/**
 * Joindre une page distante, avec la garde SSRF et les en-têtes qui font qu'un
 * serveur nous répond.
 *
 * POURQUOI CE MODULE EXISTE. Tout ça vivait à l'intérieur de
 * `src/lib/site-builder/fetch-page-html.ts`, privé au module. L'analyseur de
 * sites a besoin exactement de la même garde — les URLs viennent de la même
 * source non maîtrisée, les mêmes hébergeurs répondent 403 à un `fetch` nu, les
 * mêmes `www` en trop font croire à un site mort — mais il ne peut pas utiliser
 * `fetchPageHtml()` pour deux raisons de fond :
 *
 *   1. `fetchPageHtml` JETTE sur 403/429/503. Pour l'import c'est correct : sans
 *      HTML il n'y a rien à importer. Pour un audit c'est faux — un blocage
 *      anti-robot est une DONNÉE d'audit (« votre site refuse les robots »),
 *      pas une panne.
 *   2. `fetchPageHtml` renvoie du HTML normalisé puis allégé pour l'IA
 *      (`normalizeImportedHtml` + `slimImportHtml`), ce qui détruit précisément
 *      les balises que l'audit doit compter : `<meta viewport>`, `<link
 *      rel=canonical>`, le JSON-LD, les `loading="lazy"`.
 *
 * D'où ce découpage : ici la couche « atteindre », là-bas la couche « nettoyer
 * pour l'IA ». `fetch-page-html.ts` importe d'ici et son comportement ne change
 * pas d'un iota — c'est la condition de sûreté de l'extraction, et ses tests
 * doivent passer sans modification.
 */
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { buildUrlCandidates } from "@/lib/http/url-variants";

/** Erreur de jonction, portant un statut HTTP et une indication facultative. */
export class ReachError extends Error {
  status: number;
  hint?: string;
  constructor(message: string, status = 502, hint?: string) {
    super(message);
    this.name = "ReachError";
    this.status = status;
    this.hint = hint;
  }
}

export const DEFAULT_FETCH_TIMEOUT_MS = 25_000;

/**
 * Sans ces en-têtes, une bonne part des hébergeurs répond 403 : un `fetch` nu
 * ressemble à un aspirateur.
 */
export const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Ch-Ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
};

/** Marqueurs de page de défi anti-robot / mur JS. */
export const BLOCK_MARKERS = [
  "just a moment",
  "cf-browser-verification",
  "cf_chl_",
  "/cdn-cgi/challenge-platform",
  "attention required! | cloudflare",
  "enable javascript and cookies",
  "captcha-delivery",
  "datadome",
  "perimeterx",
  "px-captcha",
  "incapsula",
  "_imperva",
];

function ipv4ToOctets(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return nums;
}

/** Adresse privée / loopback / lien-local / réservée (IPv4 + IPv6). */
export function isPrivateIp(ip: string): boolean {
  const v4 = ipv4ToOctets(ip);
  if (v4) {
    const [a, b] = v4;
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true; // lien-local
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  const v6 = ip.toLowerCase();
  if (v6 === "::1" || v6 === "::") return true;
  if (v6.startsWith("fc") || v6.startsWith("fd")) return true; // unique-local
  if (v6.startsWith("fe80")) return true; // lien-local
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIp(mapped[1]);
  return false;
}

/**
 * Refuse les noms d'hôte qui résolvent vers une adresse interne (garde SSRF).
 * Les URLs traitées viennent d'une saisie ou d'un enrichissement automatique :
 * une adresse de métadonnées cloud atteinte depuis nos fonctions serait une
 * fuite de credentials.
 */
export async function assertPublicHost(hostname: string): Promise<void> {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".localhost")) {
    throw new ReachError("Adresse non autorisée.", 400);
  }
  let addresses: string[];
  if (isIP(h)) {
    addresses = [h];
  } else {
    try {
      const resolved = await lookup(h, { all: true });
      addresses = resolved.map((r) => r.address);
    } catch {
      throw new ReachError("Nom de domaine introuvable.", 400);
    }
  }
  if (addresses.length === 0 || addresses.some(isPrivateIp)) {
    throw new ReachError("Adresse non autorisée (réseau interne).", 400);
  }
}

/** Parse + valide une URL saisie ; le schéma par défaut est https. */
export function normalizeUrlInput(input: string): URL {
  let s = input.trim();
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    throw new ReachError("URL invalide.", 400);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ReachError("Seules les URLs http(s) sont prises en charge.", 400);
  }
  return url;
}

/** Longueur approximative du texte visible, balises retirées — repère de coquille SPA. */
export function visibleTextLength(html: string): number {
  return html
    .replace(/<(script|style|head|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim().length;
}

/** Le HTML est-il une page de défi anti-robot ? Renvoie le marqueur trouvé. */
export function blockMarkerIn(html: string): string | null {
  const lower = html.toLowerCase();
  for (const m of BLOCK_MARKERS) {
    if (lower.includes(m)) return m;
  }
  return null;
}

export interface ReachOptions {
  timeoutMs?: number;
  /** Indication attachée aux erreurs, pour l'interface appelante. */
  hint?: string;
  headers?: Record<string, string>;
}

/**
 * Joint l'URL, en essayant les variantes www/apex et https/http.
 *
 * Un `www` en trop ou un `https` que le serveur ne sert pas suffisait à faire
 * échouer l'import sur un site parfaitement en ligne. On ne bascule QUE sur les
 * échecs de connexion : un site qui répond (même par une erreur HTTP) a bien été
 * joint, et son message doit remonter tel quel.
 */
export async function reachPage(url: URL, opts: ReachOptions = {}): Promise<Response> {
  const candidates = buildUrlCandidates(url.href);
  let lastError: ReachError | null = null;

  for (const candidate of candidates.length > 0 ? candidates : [url.href]) {
    const target = new URL(candidate);
    try {
      await assertPublicHost(target.hostname);
    } catch (e) {
      // Hôte refusé (réseau interne) : la variante est écartée, pas l'appel.
      lastError = e instanceof ReachError ? e : lastError;
      continue;
    }
    try {
      return await fetch(target.href, {
        method: "GET",
        headers: opts.headers ?? BROWSER_HEADERS,
        redirect: "follow",
        signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS),
      });
    } catch (e) {
      const aborted = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      lastError = new ReachError(
        aborted ? "Délai dépassé lors de la récupération de la page." : "Impossible de joindre l'URL.",
        504,
        opts.hint,
      );
    }
  }

  throw lastError ?? new ReachError("Impossible de joindre l'URL.", 504, opts.hint);
}

/**
 * Revalide l'hôte après redirection (garde contre les redirections ouvertes).
 * Best-effort : une URL finale illisible ne doit pas faire échouer l'appel.
 */
export async function assertFinalHost(finalUrl: string, originalHost: string): Promise<void> {
  try {
    const finalHost = new URL(finalUrl).hostname;
    if (finalHost.toLowerCase() !== originalHost.toLowerCase()) {
      await assertPublicHost(finalHost);
    }
  } catch (e) {
    if (e instanceof ReachError) throw e;
  }
}
