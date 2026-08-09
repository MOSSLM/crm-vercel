/**
 * Fetch a remote web page and return clean, self-contained HTML ready for the
 * import pipeline.
 *
 * Phase 1 strategy: a single "direct" tier — a plain Node `fetch` with a
 * realistic browser header set. This covers the large majority of small-business
 * / WordPress / static sites. JS-rendered SPAs (Wix, Squarespace, React) and
 * bot-protected sites (Cloudflare, DataDome) are detected and reported back with
 * a clear message so the user can paste the HTML manually. Heavier tiers
 * (headless browser, anti-bot API) can be slotted in as additional fallbacks
 * later without touching callers.
 *
 * Security: arbitrary user-supplied URLs are fetched server-side, so we apply an
 * SSRF guard (block localhost / private / link-local addresses, resolved via
 * DNS) before connecting, and re-validate the final URL after redirects.
 *
 * La couche « atteindre » (garde SSRF, en-têtes de navigateur, variantes
 * www/apex, marqueurs anti-robot) vit désormais dans `@/lib/http/reach-page`,
 * partagée avec l'analyseur de sites. Ce module garde ce qui lui est propre :
 * la validation du contenu et la normalisation pour l'IA — qui détruit les
 * balises que l'audit doit compter, d'où la séparation.
 */
import {
  BLOCK_MARKERS,
  ReachError,
  assertFinalHost,
  blockMarkerIn,
  normalizeUrlInput,
  reachPage,
  visibleTextLength,
} from "@/lib/http/reach-page";
import { normalizeImportedHtml, type NormalizeResult } from "./normalize-imported-html";
import { extractPageAssets } from "@/lib/ai/import-page-sections";
import { slimImportHtml } from "@/lib/ai/slim-import-html";

export interface FetchPageResult extends NormalizeResult {
  /** URL actually fetched (after redirects). */
  finalUrl: string;
  /** Which tier produced the result. */
  method: "direct";
  /** Page stylesheet captured for re-attachment (kept OUT of `html`). */
  css: string;
  /** Absolute stylesheet links captured for re-attachment. */
  links: string[];
}

/** Error carrying an HTTP status + an optional actionable hint for the UI. */
export class FetchPageError extends Error {
  status: number;
  hint?: string;
  constructor(message: string, status = 502, hint?: string) {
    super(message);
    this.name = "FetchPageError";
    this.status = status;
    this.hint = hint;
  }
}

const PASTE_HINT =
  "Collez plutôt le HTML de la page manuellement (clic droit → « Afficher le code source », tout sélectionner, copier).";

const FETCH_TIMEOUT_MS = 25_000;
const MAX_BYTES = 5_000_000;

/** Ré-exporté : des appelants historiques importaient la liste depuis ici. */
export { BLOCK_MARKERS };

/** `ReachError` porte déjà message / statut / indication : on ne fait que retyper. */
function asFetchPageError(e: unknown): FetchPageError {
  if (e instanceof ReachError) return new FetchPageError(e.message, e.status, e.hint ?? PASTE_HINT);
  if (e instanceof FetchPageError) return e;
  return new FetchPageError("Impossible de joindre l'URL.", 504, PASTE_HINT);
}

function detectBlocked(html: string): string | null {
  if (blockMarkerIn(html)) return "Le site affiche une protection anti-robot.";
  if (visibleTextLength(html) < 200 && /<script/i.test(html)) {
    return "La page semble rendue côté JavaScript (peu de contenu statique).";
  }
  return null;
}

export async function fetchPageHtml(input: string): Promise<FetchPageResult> {
  let url: URL;
  try {
    url = normalizeUrlInput(input);
  } catch (e) {
    throw asFetchPageError(e);
  }

  let res: Response;
  try {
    res = await reachPage(url, { timeoutMs: FETCH_TIMEOUT_MS, hint: PASTE_HINT });
  } catch (e) {
    throw asFetchPageError(e);
  }

  // Re-validate after redirects (best-effort SSRF guard against open redirects).
  try {
    await assertFinalHost(res.url || url.href, url.hostname);
  } catch (e) {
    throw asFetchPageError(e);
  }

  if (res.status === 403 || res.status === 429 || res.status === 503) {
    throw new FetchPageError(
      "Le site bloque la récupération automatique (anti-robot).",
      422,
      PASTE_HINT,
    );
  }
  if (!res.ok) {
    throw new FetchPageError(`Le site a répondu ${res.status}.`, 422, PASTE_HINT);
  }

  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  if (contentType && !/(text\/html|application\/xhtml|text\/plain|application\/xml)/.test(contentType)) {
    throw new FetchPageError(`L'URL ne renvoie pas une page HTML (type : ${contentType.split(";")[0]}).`, 422);
  }

  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) {
    throw new FetchPageError(
      `Page trop volumineuse (${Math.round(buf.byteLength / 1_000_000)} Mo). Essayez une page plus simple.`,
      413,
    );
  }
  const rawHtml = new TextDecoder("utf-8").decode(buf);

  if (!rawHtml.trim() || !/<[a-z!]/i.test(rawHtml)) {
    throw new FetchPageError("La page récupérée est vide.", 422, PASTE_HINT);
  }

  const blocked = detectBlocked(rawHtml);
  if (blocked) {
    throw new FetchPageError(blocked, 422, PASTE_HINT);
  }

  const normalized = normalizeImportedHtml(rawHtml, res.url || url.href);
  // Capture the stylesheet now, then strip it (and other bulk) from the HTML we
  // hand back, so the editor textarea + AI conversion stay small. The CSS rides
  // separately and is re-attached to each section at import time.
  const { css, links } = extractPageAssets(normalized.html);
  const slim = slimImportHtml(normalized.html);
  return {
    html: slim,
    title: normalized.title,
    warnings: normalized.warnings,
    finalUrl: res.url || url.href,
    method: "direct",
    css,
    links,
  };
}
