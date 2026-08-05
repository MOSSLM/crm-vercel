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
//   4. On tente les quatre variantes d'URL (www/apex × https/http) avant
//      d'abandonner — cf. `url-variants.ts`. Et surtout : la variante qui a
//      RÉPONDU devient l'origine du reste du scraping. Sans ça, la home était
//      trouvée sur `exemple.fr` mais les pages secondaires (contact, mentions
//      légales — celles qui portent les emails et le SIRET) continuaient d'être
//      demandées à `www.exemple.fr`, injoignable, et revenaient vides.
//
// Pour que le LLM reçoive les bonnes pages (cf. `page-discovery.ts`) :
//   5. Les pages secondaires sont DÉCOUVERTES dans les liens de la home, plus
//      devinées : sept chemins fixes manquaient tout site nommant sa page
//      `/nous-joindre` ou `/qui-sommes-nous.php` — précisément celles qui portent
//      l'email et le SIRET. Les chemins devinés complètent la liste, et le
//      `sitemap.xml` sert de repli quand la home ne donne rien d'exploitable.
//   6. Menu et pied de page, répétés à l'identique sur chaque page, sont retirés.
//      Concaténés, ils occupaient une large part des 30 000 caractères du prompt —
//      huit fois la même navigation au détriment du contenu réel. Et le budget est
//      désormais réparti par page au lieu d'être consommé dans l'ordre.
// =====================================================================

import { buildHomeCandidates, originOf } from "./url-variants.ts";
import {
  allocateBudget,
  extractInternalLinks,
  rankCandidatePages,
  stripSharedBoilerplate,
} from "./page-discovery.ts";

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
/**
 * Seuil auquel une page secondaire est gardée bien qu'incomplète.
 *
 * `fetchPage` promettait de « garder le meilleur contenu partiel », mais les deux
 * appelants re-testaient ensuite le seuil plein et le jetaient : la promesse était
 * du code mort. Elle sert maintenant aux pages secondaires, où quelques lignes
 * suffisent à porter un email ou un SIRET. La home garde son seuil strict, parce
 * qu'une home vide veut dire « site inexploitable » et doit router l'opportunité.
 */
const MIN_SECONDARY_PARTIAL_CHARS = 80;

/** Pages secondaires retenues au maximum, découvertes et devinées confondues. */
const MAX_SECONDARY_PAGES = 6;

/**
 * Chemins tentés en complément de la découverte de liens.
 *
 * Ils ne sont plus la stratégie principale — `page-discovery` lit les vrais liens
 * de la home — mais restent utiles quand la home vient de Jina (markdown, aucun
 * lien exploitable) ou quand la navigation est en JavaScript.
 */
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
/**
 * Contenu d'une page, avec l'URL réellement servie quand on la connaît.
 * `finalUrl` est le fruit des redirections suivies par le fetch direct : c'est
 * lui qui dit sur quel hôte le site vit vraiment.
 */
interface PageFetch {
  text: string;
  finalUrl: string | null;
  /**
   * HTML brut, quand la page vient du fetch direct.
   *
   * Conservé uniquement pour la home, dont les liens servent à découvrir les
   * vraies pages du site. Jina ne rend que du markdown : dans ce cas il est
   * `null` et la découverte est sautée.
   */
  html?: string;
}

/**
 * Plafond de lecture d'une page.
 *
 * `res.text()` lit sans limite : un document de plusieurs dizaines de Mo — export
 * mal configuré, page générée à la volée — passait entièrement en mémoire dans un
 * isolat qui n'en a pas beaucoup. 2 Mo couvrent très largement une page de site
 * vitrine ; au-delà on tronque, le budget du prompt étant de toute façon de 30 000
 * caractères.
 */
const MAX_PAGE_BYTES = 2_000_000;

async function fetchDirect(targetUrl: string, timeoutMs = 15000): Promise<PageFetch | null> {
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
    const declared = Number(res.headers.get("content-length") ?? "0");
    if (declared > MAX_PAGE_BYTES) {
      console.warn(`Direct fetch: ${targetUrl} annonce ${declared} octets — ignoré`);
      return null;
    }
    const raw = await res.text();
    if (!raw) return null;
    // Troncature défensive : `content-length` est souvent absent en chunked.
    const html = raw.length > MAX_PAGE_BYTES ? raw.slice(0, MAX_PAGE_BYTES) : raw;
    return { text: htmlToText(html), finalUrl: res.url || targetUrl, html };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`Direct fetch error for ${targetUrl}: ${msg}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Tente Jina en tenant compte du coupe-circuit de rate-limit du run. */
async function tryJina(targetUrl: string, state: ScrapeState, timeoutMs: number): Promise<PageFetch | null> {
  if (state.jinaRateLimited) return null; // déjà rate-limité sur ce site → on n'insiste pas
  const res = await fetchJina(targetUrl, timeoutMs);
  if (res.rateLimited) state.jinaRateLimited = true;
  // Jina ne dit pas où il a atterri : seule la variante demandée fait foi.
  return res.text ? { text: res.text, finalUrl: null } : null;
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
): Promise<PageFetch | null> {
  const jina = () => tryJina(targetUrl, state, timeoutMs);
  const direct = () => fetchDirect(targetUrl, timeoutMs);
  const order = HAS_JINA_KEY ? [jina, direct] : [direct, jina];

  const gathered: PageFetch[] = [];
  for (const source of order) {
    const out = await source();
    if (out && out.text.trim().length >= minChars) return out;
    if (out && out.text.trim().length > 0) gathered.push(out);
  }
  // Aucune source complète → on renvoie le meilleur contenu partiel disponible.
  return gathered.sort((a, b) => b.text.length - a.text.length)[0] ?? null;
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
  let homeHtml: string | null = null;
  let homeUrl = origin;
  // L'origine qui a RÉPONDU — pas celle qui était stockée. C'est elle qui sert
  // au reste du scraping : demander les pages secondaires à un hôte qu'on vient
  // de constater injoignable ne peut rien donner.
  let workingOrigin = origin;
  for (const candidate of candidates) {
    const page = await fetchPage(candidate, MIN_HOME_CHARS, state);
    if (page && page.text.trim().length >= MIN_HOME_CHARS) {
      homeMarkdown = page.text;
      homeHtml = page.html ?? null;
      // Une redirection fait autorité sur la variante demandée.
      homeUrl = page.finalUrl ?? candidate;
      workingOrigin = originOf(homeUrl) ?? originOf(candidate) ?? origin;
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

  const targets = await resolveSecondaryTargets(homeHtml, workingOrigin);
  console.log(`scrape ${workingOrigin} : ${targets.length} page(s) secondaire(s) retenue(s)`);

  const pages = [{ url: homeUrl, path: "/", markdown: homeMarkdown }];

  // Pages secondaires en parallèle, relatives à l'origine qui répond.
  const secondaryResults = await Promise.all(
    targets.map(async (u) => {
      const page = await fetchPage(u, MIN_SECONDARY_CHARS, state, 10000);
      // Seuil abaissé : sur une page secondaire, quelques lignes suffisent à
      // porter un email ou un SIRET.
      if (page && page.text.trim().length >= MIN_SECONDARY_PARTIAL_CHARS) {
        const path = pathOf(page.finalUrl ?? u);
        return { url: page.finalUrl ?? u, path, markdown: page.text };
      }
      return null;
    }),
  );
  for (const r of secondaryResults) {
    if (r && !pages.some((p) => p.path === r.path)) pages.push(r);
  }

  // Menu et pied de page, répétés sur chaque page, remplissaient le budget du
  // prompt sans rien apprendre au modèle.
  const deduped = stripSharedBoilerplate(pages.map((p) => ({ path: p.path, markdown: p.markdown })));
  const byPath = new Map(deduped.map((p) => [p.path, p.markdown]));
  const finalPages = pages.map((p) => ({ ...p, markdown: byPath.get(p.path) ?? p.markdown }));

  const totalChars = finalPages.reduce((acc, p) => acc + p.markdown.length, 0);

  return { base_url: workingOrigin, pages: finalPages, total_chars: totalChars, accessible: true };
}

/** Chemin d'une URL, `/x` sans slash final — la clé d'identité d'une page ici. */
function pathOf(url: string): string {
  try {
    const p = new URL(url).pathname.replace(/\/+$/, "");
    return p === "" ? "/" : p;
  } catch {
    return url;
  }
}

/**
 * Les pages secondaires à récupérer, par ordre d'intérêt.
 *
 * Les liens de la home d'abord : ils donnent les VRAIES URLs du site, alors que
 * les chemins devinés manquaient tout site nommant sa page `/nous-joindre` ou
 * `/qui-sommes-nous.php`. Le sitemap ne sert que si la home n'a rien donné
 * d'exploitable (navigation en JavaScript, ou home venue de Jina donc sans HTML),
 * et les chemins devinés complètent toujours la liste — ils ne coûtent rien de
 * plus qu'un 404.
 */
async function resolveSecondaryTargets(homeHtml: string | null, origin: string): Promise<string[]> {
  const discovered = homeHtml ? rankCandidatePages(extractInternalLinks(homeHtml, origin)) : [];

  let fromSitemap: string[] = [];
  if (discovered.length < 3) {
    fromSitemap = await fetchSitemapUrls(origin);
  }

  const guessed = SECONDARY_PATHS.map((p) => `${origin}/${p}`);
  const ordered = [...discovered, ...rankCandidatePages(fromSitemap), ...guessed];

  // Dédoublonnage par chemin : la découverte et les chemins devinés se recoupent
  // largement sur un site classique.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of ordered) {
    const key = pathOf(u);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(u);
    if (out.length >= MAX_SECONDARY_PAGES) break;
  }
  return out;
}

/** URLs d'un `sitemap.xml`, au plus 200 — au-delà c'est un catalogue, pas un site vitrine. */
async function fetchSitemapUrls(origin: string): Promise<string[]> {
  const page = await fetchDirect(`${origin}/sitemap.xml`, 8000);
  if (!page?.html) return [];
  const urls: string[] = [];
  for (const m of page.html.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
    urls.push(m[1]);
    if (urls.length >= 200) break;
  }
  return urls;
}

/**
 * Concatène les pages en un seul bloc de markdown, dans un budget de tokens
 * raisonnable pour le LLM (~30k chars ≈ 8k tokens).
 *
 * Le budget est RÉPARTI, plus consommé dans l'ordre. L'ancienne version remplissait
 * séquentiellement : une home bavarde absorbait les 30 000 caractères et `contact`
 * — la page qui porte l'email — n'atteignait jamais le modèle, qui cherchait donc
 * une donnée absente de son contexte. Chaque page a maintenant une part garantie,
 * et le reliquat des pages courtes revient à celles qui débordent
 * (cf. `allocateBudget`).
 */
export function buildSiteContext(scraped: ScrapedSite, maxChars = 30000): string {
  const quota = allocateBudget(
    scraped.pages.map((p) => ({ path: p.path, markdown: p.markdown })),
    { total: maxChars },
  );

  const parts: string[] = [];
  for (const page of scraped.pages) {
    const allowed = quota.get(page.path) ?? 0;
    if (allowed <= 0) continue;
    const header = `\n\n===== PAGE ${page.path} (${page.url}) =====\n`;
    const content = page.markdown.length > allowed
      ? page.markdown.slice(0, allowed) + "\n...[tronqué]"
      : page.markdown;
    parts.push(header + content);
  }
  return parts.join("");
}
