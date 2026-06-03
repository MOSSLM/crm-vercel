// =====================================================================
// Scraping du site web via Jina Reader
// =====================================================================
// Jina Reader (https://jina.ai/reader) convertit n'importe quelle URL
// en markdown propre, idéal pour alimenter un LLM.
// Gratuit sans clé pour un usage modéré.
// =====================================================================

const JINA_BASE = "https://r.jina.ai/";

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

// Signaux déterministes extraits du HTML BRUT de la home (pas du markdown Jina,
// qui perd les liens tel:/mailto, les <form> et la balise viewport).
export interface RawSiteSignals {
  hasTelLink: boolean;
  hasMailtoLink: boolean;
  hasForm: boolean;
  hasViewport: boolean;
  phoneInText: boolean; // un numéro FR apparaît dans le texte visible
}

function normalizeBaseUrl(raw: string): string | null {
  if (!raw) return null;
  try {
    // Si on a juste "exemple.fr", on ajoute https://
    const withScheme = raw.match(/^https?:\/\//i) ? raw : `https://${raw}`;
    const u = new URL(withScheme);
    // On garde uniquement l'origine + racine
    return u.origin;
  } catch {
    return null;
  }
}

async function fetchJina(targetUrl: string, timeoutMs = 15000): Promise<string | null> {
  const jinaUrl = `${JINA_BASE}${targetUrl}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(jinaUrl, {
      method: "GET",
      headers: {
        // X-Return-Format: markdown est le défaut, on le précise
        "X-Return-Format": "markdown",
        "Accept": "text/plain",
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`Jina fetch non-OK ${res.status} for ${targetUrl}`);
      return null;
    }
    const text = await res.text();
    // Jina retourne du markdown préfixé par "Title:..." "URL Source:..." "Markdown Content:..."
    // on laisse tel quel, le LLM s'en sort très bien avec ça.
    return text;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`Jina fetch error for ${targetUrl}: ${msg}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Scrape le site: home + quelques pages secondaires si elles répondent.
 * Retourne un objet avec les pages récupérées (markdown) et un flag accessible.
 */
export async function scrapeWebsite(rawUrl: string | null | undefined): Promise<ScrapedSite> {
  const base = normalizeBaseUrl(rawUrl ?? "");
  if (!base) {
    return {
      base_url: "",
      pages: [],
      total_chars: 0,
      accessible: false,
      error: "invalid_url",
    };
  }

  // On récupère d'abord la home
  const homeMarkdown = await fetchJina(base);
  if (!homeMarkdown || homeMarkdown.trim().length < 100) {
    return {
      base_url: base,
      pages: [],
      total_chars: 0,
      accessible: false,
      error: "home_unreachable_or_empty",
    };
  }

  const pages = [{ url: base, path: "/", markdown: homeMarkdown }];

  // On tente les pages secondaires en parallèle (max 7 requêtes)
  const secondaryFetches = SECONDARY_PATHS.map(async (path) => {
    const u = `${base}/${path}`;
    const md = await fetchJina(u, 10000);
    if (md && md.trim().length > 200) {
      return { url: u, path: `/${path}`, markdown: md };
    }
    return null;
  });
  const secondaryResults = await Promise.all(secondaryFetches);
  for (const r of secondaryResults) {
    if (r) pages.push(r);
  }

  const totalChars = pages.reduce((acc, p) => acc + p.markdown.length, 0);

  return {
    base_url: base,
    pages,
    total_chars: totalChars,
    accessible: true,
  };
}

/**
 * Récupère le HTML brut de la home et en extrait des signaux déterministes
 * utiles pour l'audit (tel: cliquable, formulaire, viewport, numéro affiché).
 * Best-effort : retourne null si la page n'est pas récupérable.
 */
export async function fetchRawSignals(
  rawUrl: string | null | undefined,
  timeoutMs = 12000,
): Promise<RawSiteSignals | null> {
  const base = normalizeBaseUrl(rawUrl ?? "");
  if (!base) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(base, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; SamaAuditBot/1.0; +https://samadigitalstudio.fr)",
        "Accept": "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`fetchRawSignals non-OK ${res.status} for ${base}`);
      return null;
    }
    let html = await res.text();
    if (html.length > 500000) html = html.slice(0, 500000); // cap mémoire

    const hasTelLink = /href\s*=\s*["']\s*tel:/i.test(html);
    const hasMailtoLink = /href\s*=\s*["']\s*mailto:/i.test(html);
    const hasForm = /<form[\s>]/i.test(html);
    const hasViewport = /<meta[^>]+name\s*=\s*["']\s*viewport\s*["']/i.test(html);

    // Texte visible : on retire scripts/styles puis toutes les balises.
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ");
    // Numéro FR : +33/0033/0 suivi d'un indicatif puis 4 paires de chiffres.
    const phoneInText = /(?:\+33|0033|0)\s?[1-9](?:[\s. \-]?\d{2}){4}/.test(text);

    return { hasTelLink, hasMailtoLink, hasForm, hasViewport, phoneInText };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`fetchRawSignals error for ${base}: ${msg}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
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