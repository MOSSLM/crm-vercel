import "server-only";
import {
  BROWSER_HEADERS,
  ReachError,
  assertFinalHost,
  assertPublicHost,
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

/**
 * Feuilles de style externes lues, au maximum.
 *
 * Trois suffisent : au-delà, on paie de l'attente pour des règles qui ne
 * changent plus le verdict « ce site a des règles d'affichage mobile, ou il n'en
 * a pas ». Le budget compte : la file porte 2 000 sites.
 */
const MAX_FEUILLES = 3;
const FEUILLE_TIMEOUT_MS = 2_500;
const MAX_OCTETS_FEUILLE = 400_000;

/** Ressources pesées par `HEAD`, au maximum. Les plus lourdes sont en tête de page. */
const MAX_RESSOURCES_PESEES = 12;
const PESEE_TIMEOUT_MS = 2_500;

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
    poidsTotalOctets: null,
    ressourcesPesees: 0,
    cssExterne: "",
    nbFeuillesDeclarees: 0,
    nbFeuillesLues: 0,
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
  //
  // Les trois sondes partent ENSEMBLE : elles sont indépendantes, et les
  // enchaîner additionnerait leurs délais sur chacun des 2 000 sites de la file.
  const origine = origineDe(urlFinale);
  const [robotsTxt, sitemapXml, feuilles, pesee] = await Promise.all([
    origine ? sonder(`${origine}/robots.txt`) : Promise.resolve(null),
    origine ? sonder(`${origine}/sitemap.xml`) : Promise.resolve(null),
    html ? lireFeuillesExternes(html, urlFinale) : Promise.resolve(FEUILLES_VIDES),
    html ? peserRessources(html, urlFinale, poidsOctets) : Promise.resolve(PESEE_VIDE),
  ]);

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
    poidsTotalOctets: pesee.total,
    ressourcesPesees: pesee.pesees,
    cssExterne: feuilles.css,
    nbFeuillesDeclarees: feuilles.declarees,
    nbFeuillesLues: feuilles.lues,
    robotsTxt,
    sitemapXml,
  };
}

// ---------------------------------------------------------------------------
// Feuilles de style externes
// ---------------------------------------------------------------------------

const FEUILLES_VIDES = { css: "", declarees: 0, lues: 0 };

/**
 * Récupère les premières feuilles de style de la page.
 *
 * Les règles d'affichage mobile vivent presque toujours dans un fichier, jamais
 * dans la page. Ne lire que les `<style>` inline conduisait à compter zéro règle
 * mobile sur 16 sites sur 31 — puis à leur reprocher d'être mal adaptés.
 *
 * Ne lève jamais : une feuille manquante n'invalide pas l'analyse, elle réduit
 * seulement ce dont on peut témoigner.
 */
async function lireFeuillesExternes(
  html: string,
  urlFinale: string,
): Promise<{ css: string; declarees: number; lues: number }> {
  const hrefs = extraireHrefsFeuilles(html, urlFinale);
  if (hrefs.length === 0) return FEUILLES_VIDES;

  const morceaux = await Promise.all(
    hrefs.slice(0, MAX_FEUILLES).map((h) => lireTexte(h, FEUILLE_TIMEOUT_MS, MAX_OCTETS_FEUILLE)),
  );
  const lus = morceaux.filter((m): m is string => m !== null);

  return { css: lus.join("\n"), declarees: hrefs.length, lues: lus.length };
}

/** `<link rel="stylesheet" href="…">`, résolus en absolu, même origine seulement. */
export function extraireHrefsFeuilles(html: string, base: string): string[] {
  const out: string[] = [];
  const origine = origineDe(base);
  if (!origine) return out;

  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const balise = m[0];
    if (!/rel\s*=\s*["']?[^"'>]*stylesheet/i.test(balise)) continue;

    // Une feuille réservée à l'impression ne dit rien de l'affichage mobile.
    const media = /media\s*=\s*["']([^"']+)["']/i.exec(balise)?.[1]?.toLowerCase();
    if (media && /\bprint\b/.test(media) && !/\ball\b|\bscreen\b/.test(media)) continue;

    const href = /href\s*=\s*["']([^"']+)["']/i.exec(balise)?.[1];
    if (!href) continue;

    const absolu = resoudre(href, base);
    // Hors origine on ne suit pas : un CDN tiers n'a pas à être sondé pour ça.
    if (absolu && absolu.startsWith(origine) && !out.includes(absolu)) out.push(absolu);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Pesée réelle de la page
// ---------------------------------------------------------------------------

const PESEE_VIDE: { total: number | null; pesees: number } = { total: null, pesees: 0 };

/**
 * Poids de la page = document + ressources déclarées, additionné depuis les
 * `content-length` renvoyés en `HEAD`.
 *
 * Le poids du seul document ne voulait rien dire : 587 Ko au maximum sur tout le
 * parc, pour un seuil à 2 Mo — la preuve ne se déclenchait donc jamais, sur aucun
 * site. Ce qui ralentit un visiteur, ce sont les images.
 *
 * Renvoie `null` si aucun serveur n'expose de taille : « on n'a pas pu peser »
 * n'est pas « c'est léger », et la preuve restera `inconnu`.
 */
async function peserRessources(
  html: string,
  urlFinale: string,
  poidsDocument: number | null,
): Promise<{ total: number | null; pesees: number }> {
  const urls = extraireRessources(html, urlFinale).slice(0, MAX_RESSOURCES_PESEES);
  // Aucune ressource déclarée : le document EST la page, son poids suffit.
  if (urls.length === 0) return { total: poidsDocument, pesees: 0 };

  const tailles = await Promise.all(urls.map(tailleParHead));
  const connues = tailles.filter((t): t is number => t !== null);
  if (connues.length === 0) return PESEE_VIDE;

  return {
    total: connues.reduce((a, b) => a + b, 0) + (poidsDocument ?? 0),
    pesees: connues.length,
  };
}

/** Images, scripts et feuilles déclarés dans la page, en absolu et dédoublonnés. */
export function extraireRessources(html: string, base: string): string[] {
  const out: string[] = [];
  const pousser = (valeur: string | undefined) => {
    if (!valeur) return;
    const absolu = resoudre(valeur, base);
    // Les `data:` ne coûtent aucun aller-retour : leur poids est déjà dans le
    // document, les compter une seconde fois gonflerait la mesure.
    if (absolu && absolu.startsWith("http") && !out.includes(absolu)) out.push(absolu);
  };

  for (const m of html.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) pousser(m[1]);
  for (const m of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) pousser(m[1]);
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    if (!/stylesheet/i.test(m[0])) continue;
    pousser(/href\s*=\s*["']([^"']+)["']/i.exec(m[0])?.[1]);
  }

  return out;
}

async function tailleParHead(url: string): Promise<number | null> {
  try {
    const u = new URL(url);
    await assertPublicHost(u.hostname);
    const res = await fetch(u.href, {
      method: "HEAD",
      headers: BROWSER_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(PESEE_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const n = Number(res.headers.get("content-length"));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** Corps textuel d'une ressource, plafonné. `null` au moindre incident. */
async function lireTexte(url: string, timeoutMs: number, maxOctets: number): Promise<string | null> {
  try {
    const u = new URL(url);
    await assertPublicHost(u.hostname);
    const res = await fetch(u.href, {
      method: "GET",
      headers: BROWSER_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const utile = buf.byteLength > maxOctets ? buf.slice(0, maxOctets) : buf;
    return new TextDecoder("utf-8").decode(utile);
  } catch {
    return null;
  }
}

function resoudre(href: string, base: string): string | null {
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
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
