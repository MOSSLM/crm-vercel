// =====================================================================
// Scraping du site web : Jina Reader + fallback fetch direct
// =====================================================================
// Jina Reader (https://jina.ai/reader) convertit n'importe quelle URL en
// markdown propre, idéal pour alimenter un LLM. En version gratuite (sans clé)
// il est fortement rate-limité et renvoie régulièrement du vide / 429 — ce qui
// faisait échouer l'enrichissement en "home_unreachable_or_empty" sur des sites
// pourtant bien en ligne.
//
// Pour fiabiliser :
//   1. Stratégie adaptative selon la présence de `JINA_API_KEY` :
//        - avec clé  → Jina d'abord (rendu JS, contourne les protections),
//          fetch direct en secours, retries sur 429/5xx ;
//        - sans clé  → fetch direct d'abord (Jina gratuit est quasi toujours
//          en 429), Jina en tout dernier recours, sans retry.
//   2. Coupe-circuit : dès que Jina renvoie 429 sur un site, on cesse de le
//      solliciter pour les autres pages du même site (évite d'attendre pour rien).
//   3. Fetch direct avec un User-Agent de navigateur (réduit les 403).
//   4. On tente plusieurs variantes d'URL pour la home (chemin d'origine,
//      origine, http, bascule www) avant d'abandonner.
// =====================================================================

const JINA_BASE = "https://r.jina.ai/";
const JINA_API_KEY = Deno.env.get("JINA_API_KEY") ?? "";
// Sans clé, Jina gratuit est presque toujours en 429 : inutile de le tenter en
// premier ni de le retenter. On l'utilise alors seulement en dernier recours.
const HAS_JINA_KEY = JINA_API_KEY.length > 0;
// UA d'un vrai navigateur : beaucoup de sites renvoient 403 aux UA "bot".
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

// Longueur minimale de contenu pour considérer une page utile.
const MIN_HOME_CHARS = 100;
const MIN_SECONDARY_CHARS = 200;

// Pages qu'on essaie de récupérer en plus de la home (en français et anglais)
const SECONDARY_PATHS = [
  "contact",
  "nous-contacter",
  "mentions-legales",
  "a-propos",
  "qui-sommes-nous",
  "services",
  "nos-services",
];

export interface ScrapedSite {
  base_url: string;
  pages: Array<{ url: string; path: string; markdown: string }>;
  total_chars: number;
  accessible: boolean;
  error?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Normalise "exemple.fr/x" → URL absolue (ajoute https:// si absent). */
function toAbsoluteUrl(raw: string): URL | null {
  if (!raw) return null;
  try {
    const withScheme = raw.match(/^https?:\/\//i) ? raw : `https://${raw}`;
    return new URL(withScheme);
  } catch {
    return null;
  }
}

/**
 * Construit la liste ordonnée d'URLs à tenter pour la home, à partir de l'URL
 * brute stockée en base. On garde le chemin d'origine (certains sites ne rendent
 * du contenu que sur /accueil), puis on retombe sur l'origine, le http, et la
 * bascule www.
 */
function buildHomeCandidates(rawUrl: string): { origin: string; candidates: string[] } | null {
  const u = toAbsoluteUrl(rawUrl);
  if (!u) return null;
  const origin = u.origin;
  const candidates: string[] = [];
  const push = (v: string) => {
    if (v && !candidates.includes(v)) candidates.push(v);
  };

  // 1. URL d'origine complète (avec chemin) si elle apporte un chemin utile.
  if (u.pathname && u.pathname !== "/") push(origin + u.pathname.replace(/\/+$/, ""));
  // 2. Origine (racine).
  push(origin);
  // 3. Variante http (sites sans redirection https propre).
  if (u.protocol === "https:") push(`http://${u.host}`);
  // 4. Bascule www / apex.
  const host = u.host;
  const toggledHost = host.startsWith("www.") ? host.slice(4) : `www.${host}`;
  push(`https://${toggledHost}`);

  return { origin, candidates };
}

// ---------------------------------------------------------------------
// Décodage minimal d'entités HTML pour le fallback direct.
// ---------------------------------------------------------------------
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  eacute: "é",
  egrave: "è",
  ecirc: "ê",
  agrave: "à",
  acirc: "â",
  ugrave: "ù",
  ucirc: "û",
  icirc: "î",
  iuml: "ï",
  ocirc: "ô",
  ccedil: "ç",
  euro: "€",
  laquo: "«",
  raquo: "»",
  hellip: "…",
  rsquo: "'",
  lsquo: "'",
  ldquo: "“",
  rdquo: "”",
  ndash: "–",
  mdash: "—",
  deg: "°",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => safeFromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeFromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-zA-Z][a-zA-Z0-9]+);/g, (m, name) => NAMED_ENTITIES[name] ?? m);
}

function safeFromCodePoint(cp: number): string {
  try {
    return Number.isFinite(cp) ? String.fromCodePoint(cp) : "";
  } catch {
    return "";
  }
}

/** Convertit un document HTML en texte lisible (headings, listes, alt d'images). */
function htmlToText(html: string): string {
  let s = html;
  // Titre de la page en tête (souvent le nom + activité).
  const titleMatch = s.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1]).trim() : "";
  // Meta description (souvent un résumé de l'activité et des services).
  const descMatch = s.match(
    /<meta[^>]+name=["']description["'][^>]*content=["']([^"']+)["']/i,
  );
  const desc = descMatch ? decodeEntities(descMatch[1]).trim() : "";

  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  s = s.replace(/<script[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  s = s.replace(/<svg[\s\S]*?<\/svg>/gi, " ");
  s = s.replace(/<head[\s\S]*?<\/head>/gi, " ");
  // Conserver le texte alternatif des images (services souvent dans les alt).
  s = s.replace(/<img[^>]*\balt=["']([^"']+)["'][^>]*>/gi, " $1 ");
  // Blocs → saut de ligne pour préserver un minimum de structure.
  s = s.replace(/<\/(p|div|section|article|li|h[1-6]|tr|ul|ol|header|footer|nav|main)>/gi, "\n");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  // Suppression des balises restantes.
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  s = s.replace(/[ \t\f\r]+/g, " ").replace(/\n[ \t]*/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

  const header = [title ? `Title: ${title}` : "", desc ? `Description: ${desc}` : ""]
    .filter(Boolean)
    .join("\n");
  return header ? `${header}\n\n${s}` : s;
}

/** État de scraping partagé sur toute la durée d'un site (1 project). */
interface ScrapeState {
  // Une fois Jina rate-limité, inutile de le re-solliciter pour les autres pages.
  jinaRateLimited: boolean;
}

type JinaResult = { text: string | null; rateLimited: boolean };

// ---------------------------------------------------------------------
// Récupération via Jina Reader (avec clé + retries sur 429/5xx).
// Sans clé, aucun retry (le 429 gratuit ne se résout pas en 1-2 s).
// ---------------------------------------------------------------------
async function fetchJina(targetUrl: string, timeoutMs = 20000): Promise<JinaResult> {
  const jinaUrl = `${JINA_BASE}${targetUrl}`;
  const headers: Record<string, string> = {
    "X-Return-Format": "markdown",
    Accept: "text/plain",
  };
  if (JINA_API_KEY) headers.Authorization = `Bearer ${JINA_API_KEY}`;
  const retries = HAS_JINA_KEY ? 2 : 0;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(jinaUrl, { method: "GET", headers, signal: controller.signal });
      if (res.ok) {
        const text = await res.text();
        return { text: text && text.trim().length > 0 ? text : null, rateLimited: false };
      }
      if (res.status === 429) {
        if (attempt < retries) {
          console.warn(`Jina 429 for ${targetUrl} — retry ${attempt + 1}/${retries}`);
          await sleep(1200 * (attempt + 1));
          continue;
        }
        console.warn(`Jina 429 (rate limited) for ${targetUrl}`);
        return { text: null, rateLimited: true };
      }
      if (res.status >= 500 && attempt < retries) {
        await sleep(1200 * (attempt + 1));
        continue;
      }
      console.warn(`Jina fetch non-OK ${res.status} for ${targetUrl}`);
      return { text: null, rateLimited: false };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`Jina fetch error for ${targetUrl}: ${msg}`);
      if (attempt < retries) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      return { text: null, rateLimited: false };
    } finally {
      clearTimeout(timeout);
    }
  }
  return { text: null, rateLimited: false };
}

// ---------------------------------------------------------------------
// Fallback : récupération directe du HTML puis conversion en texte.
// ---------------------------------------------------------------------
async function fetchDirect(targetUrl: string, timeoutMs = 15000): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(targetUrl, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`Direct fetch non-OK ${res.status} for ${targetUrl}`);
      return null;
    }
    const ct = res.headers.get("content-type") ?? "";
    if (ct && !/text\/html|application\/xhtml|text\/plain|application\/xml/i.test(ct)) {
      return null;
    }
    const html = await res.text();
    if (!html) return null;
    return htmlToText(html);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`Direct fetch error for ${targetUrl}: ${msg}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Tente Jina en tenant compte du coupe-circuit de rate-limit du run. */
async function tryJina(targetUrl: string, state: ScrapeState, timeoutMs: number): Promise<string | null> {
  if (state.jinaRateLimited) return null; // déjà rate-limité sur ce site → on n'insiste pas
  const res = await fetchJina(targetUrl, timeoutMs);
  if (res.rateLimited) state.jinaRateLimited = true;
  return res.text;
}

/**
 * Récupère une page. Stratégie :
 *   - avec clé Jina → Jina d'abord (rendu JS, contourne les protections), direct en secours ;
 *   - sans clé → direct d'abord (Jina gratuit est quasi toujours en 429), Jina en dernier recours.
 * Garde le meilleur contenu partiel si aucune source n'atteint `minChars`.
 */
async function fetchPage(
  targetUrl: string,
  minChars: number,
  state: ScrapeState,
  timeoutMs = 15000,
): Promise<string | null> {
  const jina = () => tryJina(targetUrl, state, timeoutMs);
  const direct = () => fetchDirect(targetUrl, timeoutMs);
  const order = HAS_JINA_KEY ? [jina, direct] : [direct, jina];

  const gathered: string[] = [];
  for (const source of order) {
    const out = await source();
    if (out && out.trim().length >= minChars) return out;
    if (out && out.trim().length > 0) gathered.push(out);
  }
  // Aucune source complète → on renvoie le meilleur contenu partiel disponible.
  return gathered.sort((a, b) => b.length - a.length)[0] ?? null;
}

/**
 * Scrape le site: home (plusieurs variantes d'URL tentées) + quelques pages
 * secondaires si elles répondent. Retourne les pages récupérées (markdown/texte)
 * et un flag accessible.
 */
export async function scrapeWebsite(rawUrl: string | null | undefined): Promise<ScrapedSite> {
  const built = buildHomeCandidates(rawUrl ?? "");
  if (!built) {
    return { base_url: "", pages: [], total_chars: 0, accessible: false, error: "invalid_url" };
  }
  const { origin, candidates } = built;
  const state: ScrapeState = { jinaRateLimited: false };

  // On tente la home sur chaque variante jusqu'à obtenir du contenu utile.
  let homeMarkdown: string | null = null;
  let homeUrl = origin;
  for (const candidate of candidates) {
    const md = await fetchPage(candidate, MIN_HOME_CHARS, state);
    if (md && md.trim().length >= MIN_HOME_CHARS) {
      homeMarkdown = md;
      homeUrl = candidate;
      break;
    }
  }

  if (!homeMarkdown) {
    return {
      base_url: origin,
      pages: [],
      total_chars: 0,
      accessible: false,
      error: "home_unreachable_or_empty",
    };
  }

  const pages = [{ url: homeUrl, path: "/", markdown: homeMarkdown }];

  // Pages secondaires en parallèle (relatives à l'origine).
  const secondaryFetches = SECONDARY_PATHS.map(async (path) => {
    const u = `${origin}/${path}`;
    const md = await fetchPage(u, MIN_SECONDARY_CHARS, state, 10000);
    if (md && md.trim().length >= MIN_SECONDARY_CHARS) {
      return { url: u, path: `/${path}`, markdown: md };
    }
    return null;
  });
  const secondaryResults = await Promise.all(secondaryFetches);
  for (const r of secondaryResults) {
    if (r) pages.push(r);
  }

  const totalChars = pages.reduce((acc, p) => acc + p.markdown.length, 0);

  return { base_url: origin, pages, total_chars: totalChars, accessible: true };
}

/**
 * Concatène les pages en un seul bloc de markdown, tronqué pour rester
 * dans un budget de tokens raisonnable pour le LLM (~30k chars = ~8k tokens).
 */
export function buildSiteContext(scraped: ScrapedSite, maxChars = 30000): string {
  const parts: string[] = [];
  let remaining = maxChars;
  for (const page of scraped.pages) {
    const header = `\n\n===== PAGE ${page.path} (${page.url}) =====\n`;
    const available = remaining - header.length;
    if (available <= 500) break;
    const content = page.markdown.length > available
      ? page.markdown.slice(0, available) + "\n...[tronqué]"
      : page.markdown;
    parts.push(header + content);
    remaining -= (header.length + content.length);
  }
  return parts.join("");
}
