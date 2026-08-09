import "server-only";
import {
  ReachError,
  assertFinalHost,
  blockMarkerIn,
  normalizeUrlInput,
  reachPage,
} from "@/lib/http/reach-page";
import type { CollecteSite } from "./types";

/**
 * Aller chercher la page et chronométrer — sans jamais lever.
 *
 * C'est la différence de fond avec `fetchPageHtml` : ici, un site injoignable,
 * un 403 anti-robot ou un certificat expiré ne sont pas des pannes, ce sont des
 * RÉSULTATS. Le prospect dont le site répond 500 depuis trois mois est
 * précisément celui qu'on veut appeler ; une exception le ferait disparaître de
 * la file au lieu de le remonter en tête.
 *
 * Le chronométrage suit les mêmes grandeurs que `scripts/perf/preview-budget.mjs` :
 * TTFB (premier octet) puis corps complet. Ce ne sont PAS des Core Web Vitals —
 * on ne mesure ni le rendu, ni l'exécution du JS — et c'est écrit tel quel dans
 * le rapport.
 */

const TIMEOUT_MS = 15_000;
/** Au-delà, on cesse de lire : la note de poids est déjà acquise. */
const MAX_BYTES = 8_000_000;
/** Budget serré pour les deux sondes annexes : elles ne valent pas une attente. */
const SONDE_TIMEOUT_MS = 5_000;

export async function collecter(rawUrl: string): Promise<CollecteSite> {
  const base: CollecteSite = {
    urlDemandee: rawUrl,
    urlFinale: null,
    httpStatus: null,
    bloque: false,
    motifBlocage: null,
    injoignable: false,
    erreur: null,
    html: null,
    enTetes: {},
    https: false,
    ttfbMs: null,
    chargementMs: null,
    poidsOctets: null,
    robotsTxt: null,
    sitemapXml: null,
  };

  let url: URL;
  try {
    url = normalizeUrlInput(rawUrl);
  } catch (e) {
    return { ...base, injoignable: true, erreur: messageDe(e) };
  }

  const debut = Date.now();
  let res: Response;
  try {
    res = await reachPage(url, { timeoutMs: TIMEOUT_MS });
  } catch (e) {
    return { ...base, injoignable: true, erreur: messageDe(e) };
  }

  // Le premier octet est arrivé quand `fetch` résout : c'est notre TTFB. Il
  // englobe DNS + TLS + réponse serveur, ce qui est exactement ce que subit un
  // visiteur, et se mesure donc de façon défendable.
  const ttfbMs = Date.now() - debut;

  try {
    await assertFinalHost(res.url || url.href, url.hostname);
  } catch (e) {
    return { ...base, injoignable: true, erreur: messageDe(e) };
  }

  const urlFinale = res.url || url.href;
  const enTetes = collecterEnTetes(res.headers);
  const https = urlFinale.startsWith("https://");

  // 403 / 429 / 503 : le serveur a répondu, il nous refuse. C'est une donnée.
  const refus = res.status === 403 || res.status === 429 || res.status === 503;

  let html: string | null = null;
  let poidsOctets: number | null = null;
  let chargementMs: number | null = null;

  const typeContenu = (res.headers.get("content-type") || "").toLowerCase();
  const estHtml = !typeContenu || /(text\/html|application\/xhtml|text\/plain)/.test(typeContenu);

  if (res.ok && estHtml) {
    try {
      const buf = await res.arrayBuffer();
      chargementMs = Date.now() - debut;
      poidsOctets = buf.byteLength;
      html = new TextDecoder("utf-8").decode(
        buf.byteLength > MAX_BYTES ? buf.slice(0, MAX_BYTES) : buf,
      );
    } catch (e) {
      return {
        ...base,
        urlFinale,
        httpStatus: res.status,
        enTetes,
        https,
        ttfbMs,
        injoignable: true,
        erreur: messageDe(e),
      };
    }
  } else {
    // Rien à lire, mais la connexion a bien eu lieu : le corps est vidé pour
    // libérer la socket.
    await res.arrayBuffer().catch(() => undefined);
  }

  const marqueur = html ? blockMarkerIn(html) : null;
  const bloque = refus || Boolean(marqueur);

  // Sondes annexes seulement si la page principale a répondu : les lancer sur
  // un domaine mort ferait payer deux délais d'attente pour rien.
  const origine = origineDe(urlFinale);
  const [robotsTxt, sitemapXml] = origine
    ? await Promise.all([sonder(`${origine}/robots.txt`), sonder(`${origine}/sitemap.xml`)])
    : [null, null];

  return {
    urlDemandee: rawUrl,
    urlFinale,
    httpStatus: res.status,
    bloque,
    motifBlocage: marqueur ?? (refus ? `HTTP ${res.status}` : null),
    // Un site qui répond 404/500 EST joignable ; il est simplement cassé, et
    // c'est `httpStatus` qui le dit. `injoignable` est réservé à « rien au bout ».
    injoignable: false,
    erreur: null,
    html,
    enTetes,
    https,
    ttfbMs,
    chargementMs,
    poidsOctets,
    robotsTxt,
    sitemapXml,
  };
}

/**
 * Existence d'une ressource annexe. Renvoie `null` — et non `false` — quand la
 * vérification n'aboutit pas : la distinction remonte jusqu'à la note, où une
 * preuve inconnue est retirée du dénominateur au lieu d'être comptée comme un
 * manque.
 */
async function sonder(url: string): Promise<boolean | null> {
  try {
    const u = new URL(url);
    const res = await reachPage(u, { timeoutMs: SONDE_TIMEOUT_MS });
    await res.arrayBuffer().catch(() => undefined);
    return res.ok;
  } catch {
    return null;
  }
}

/** Les seuls en-têtes qui servent à la note — on ne stocke pas tout le reste. */
function collecterEnTetes(headers: Headers): Record<string, string> {
  const garder = ["content-encoding", "cache-control", "content-type", "server", "content-length"];
  const out: Record<string, string> = {};
  for (const k of garder) {
    const v = headers.get(k);
    if (v) out[k] = v;
  }
  return out;
}

function origineDe(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function messageDe(e: unknown): string {
  if (e instanceof ReachError) return e.message;
  if (e instanceof Error) return e.message;
  return "Erreur inconnue";
}
