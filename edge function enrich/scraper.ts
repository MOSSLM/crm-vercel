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
//   1. On envoie la clé `JINA_API_KEY` si elle est présente (quotas bien plus
//      élevés) et on retente sur 429 / 5xx.
//   2. Si Jina échoue quand même, on récupère le HTML EN DIRECT et on le
//      convertit en texte nous-mêmes (fallback sans dépendance externe).
//   3. On tente plusieurs variantes d'URL pour la home (chemin d'origine,
//      origine, http, bascule www) avant d'abandonner.
// =====================================================================

const JINA_BASE = "https://r.jina.ai/";
const JINA_API_KEY = Deno.env.get("JINA_API_KEY") ?? "";
const USER_AGENT =
  "Mozilla/5.0 (compatible; SamaDigitalEnrichBot/1.0; +https://samadigitalstudio.fr)";

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

// ---------------------------------------------------------------------
// Récupération via Jina Reader (avec clé + retries sur 429/5xx).
// ---------------------------------------------------------------------
async function fetchJina(targetUrl: string, timeoutMs = 20000, retries = 2): Promise<string | null> {
  const jinaUrl = `${JINA_BASE}${targetUrl}`;
  const headers: Record<string, string> = {
    "X-Return-Format": "markdown",
    Accept: "text/plain",
  };
  if (JINA_API_KEY) headers.Authorization = `Bearer ${JINA_API_KEY}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(jinaUrl, { method: "GET", headers, signal: controller.signal });
      if (res.ok) {
        const text = await res.text();
        if (text && text.trim().length > 0) return text;
        return null;
      }
      // Rate-limit / erreur serveur transitoire → on retente avec un backoff.
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        console.warn(`Jina ${res.status} for ${targetUrl} — retry ${attempt + 1}/${retries}`);
        await sleep(1200 * (attempt + 1));
        continue;
      }
      console.warn(`Jina fetch non-OK ${res.status} for ${targetUrl}`);
      return null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`Jina fetch error for ${targetUrl}: ${msg}`);
      if (attempt < retries) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
  return null;
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

/** Récupère une page via Jina, puis fallback direct si besoin. */
async function fetchPage(targetUrl: string, minChars: number, timeoutMs = 15000): Promise<string | null> {
  const viaJina = await fetchJina(targetUrl, timeoutMs);
  if (viaJina && viaJina.trim().length >= minChars) return viaJina;
  const direct = await fetchDirect(targetUrl, timeoutMs);
  if (direct && direct.trim().length >= minChars) return direct;
  // On garde le meilleur contenu partiel disponible (mieux que rien pour le LLM).
  const best = [viaJina, direct]
    .filter((v): v is string => !!v && v.trim().length > 0)
    .sort((a, b) => b.length - a.length)[0];
  return best ?? null;
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

  // On tente la home sur chaque variante jusqu'à obtenir du contenu utile.
  let homeMarkdown: string | null = null;
  let homeUrl = origin;
  for (const candidate of candidates) {
    const md = await fetchPage(candidate, MIN_HOME_CHARS);
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
    const md = await fetchPage(u, MIN_SECONDARY_CHARS, 10000);
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
