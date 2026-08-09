/**
 * Browser-rendering provider abstraction for the visual site import.
 *
 * Chromium can't run inside a Vercel function (50 MB limit), and Supabase Edge
 * Functions (Deno) can't bundle it either, so the "render the page like a real
 * browser" step is delegated to an external HTTP API. The provider is selected
 * by env (`RENDER_PROVIDER`, default "screenshotone") and is a drop-in seam:
 * swap to a scriptable/per-section provider later without touching callers.
 *
 * It returns a page-rendered visual (a paginated PDF by default — each page is
 * rasterized at full resolution by Claude, avoiding the "one giant downscaled
 * image" legibility problem) and, when the provider supports it, the rendered
 * (JS-executed) HTML to replace the plain `fetchPageHtml` text path.
 *
 * When no API key is configured, `renderProviderConfigured()` is false and the
 * UI falls back to manual visual upload (e.g. a GoFullPage PDF).
 */
import { RENDER_API_KEY, RENDER_API_URL, RENDER_PROVIDER } from "@/env";

export interface RenderedVisual {
  mime: string;
  bytes: ArrayBuffer;
}

export interface RenderResult {
  /** Rendered HTML after JS execution, when the provider returns it. */
  renderedHtml?: string;
  /** Full-page visual (PDF or image) of the rendered page. */
  visual?: RenderedVisual;
}

export interface RenderOptions {
  signal?: AbortSignal;
}

export class RenderError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "RenderError";
    this.status = status;
  }
}

/** True when an external render provider is configured. */
export function renderProviderConfigured(): boolean {
  return !!RENDER_API_KEY;
}

/** Render a page via the configured provider. Throws RenderError on failure. */
export async function renderPage(url: string, opts: RenderOptions = {}): Promise<RenderResult> {
  if (!RENDER_API_KEY) throw new RenderError("Rendu automatique non configuré.", 501);
  const provider = (RENDER_PROVIDER || "screenshotone").toLowerCase();

  switch (provider) {
    case "screenshotone":
      return renderScreenshotOne(url, opts);
    default:
      throw new RenderError(`Provider de rendu non supporté : ${provider}.`, 501);
  }
}

/**
 * ScreenshotOne (https://screenshotone.com) — generous no-card free tier,
 * executes JS, returns a full-page **paginated PDF**. Does not return rendered
 * HTML, so `renderedHtml` stays undefined and the caller keeps the plain-fetch
 * HTML. `RENDER_API_URL` overrides the endpoint for self-hosted deployments.
 */
async function renderScreenshotOne(url: string, opts: RenderOptions): Promise<RenderResult> {
  const base = RENDER_API_URL || "https://api.screenshotone.com/take";
  const params = new URLSearchParams({
    access_key: RENDER_API_KEY as string,
    url,
    full_page: "true",
    format: "pdf",
    block_cookie_banners: "true",
    block_ads: "true",
    cache: "true",
  });

  let res: Response;
  try {
    res = await fetch(`${base}?${params.toString()}`, {
      signal: opts.signal ?? AbortSignal.timeout(55_000),
    });
  } catch (e) {
    const aborted = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new RenderError(aborted ? "Le rendu de la page a expiré." : "Service de rendu injoignable.", 504);
  }
  if (!res.ok) {
    throw new RenderError(`Le service de rendu a répondu ${res.status}.`, res.status === 429 ? 429 : 502);
  }
  const bytes = await res.arrayBuffer();
  return { visual: { mime: "application/pdf", bytes } };
}

// ---------------------------------------------------------------------------
// Mode « vignette » : une capture d'écran unique, au format image
// ---------------------------------------------------------------------------
// `renderPage` ci-dessus rend un PDF paginé pleine page pour l'import IA. La
// carte OpenGraph et le rapport d'audit ont un besoin différent : UNE image du
// premier écran, légère, dans un rapport d'aspect donné.
//
// Deux fournisseurs, et la présence du second n'est pas un luxe : sans lui, la
// preview sociale ne fonctionnerait que chez qui a posé `RENDER_API_KEY`.
// thum.io ne demande aucune clé et est déjà utilisé dans le dépôt
// (`AuditPage1.tsx`, `htmlPage1.ts`) — à ceci près qu'il y est appelé depuis un
// `<img>` du NAVIGATEUR, avec l'URL du prospect en clair et sans le moindre
// cache. Ici l'appel est serveur, le résultat atterrit dans notre bucket, et
// c'est notre URL que le deck et le rapport servent ensuite.

export interface ViewportShotOptions extends RenderOptions {
  width?: number;
  height?: number;
  /** Qualité JPEG (ScreenshotOne uniquement). */
  quality?: number;
}

const SHOT_TIMEOUT_MS = 30_000;

/** True quand une capture est possible — toujours vrai, thum.io ne demande rien. */
export function viewportShotAvailable(): boolean {
  return true;
}

/**
 * Capture le premier écran de `url` et renvoie une image.
 *
 * Ne suit PAS la discipline « throw » de `renderPage` par accident : elle jette
 * bien, mais tous ses appelants (`ensure-demo-screenshot`, l'analyseur) rattrapent
 * et continuent sans image. Une capture manquante dégrade la carte OG, elle ne
 * doit jamais empêcher une publication ni une analyse.
 */
export async function renderViewportShot(
  url: string,
  opts: ViewportShotOptions = {},
): Promise<RenderedVisual> {
  const width = opts.width ?? 1280;
  const height = opts.height ?? 800;
  return RENDER_API_KEY
    ? shotScreenshotOne(url, width, height, opts)
    : shotThumIo(url, width, height, opts);
}

async function shotScreenshotOne(
  url: string,
  width: number,
  height: number,
  opts: ViewportShotOptions,
): Promise<RenderedVisual> {
  const base = RENDER_API_URL || "https://api.screenshotone.com/take";
  const params = new URLSearchParams({
    access_key: RENDER_API_KEY as string,
    url,
    format: "jpg",
    full_page: "false",
    viewport_width: String(width),
    viewport_height: String(height),
    image_quality: String(opts.quality ?? 82),
    block_cookie_banners: "true",
    block_ads: "true",
    cache: "true",
  });
  return fetchShot(`${base}?${params.toString()}`, "image/jpeg", opts.signal);
}

/**
 * thum.io — pas de clé, pas de compte. L'URL cible est encodée dans le CHEMIN,
 * pas dans un paramètre : `…/get/width/1200/crop/800/https://exemple.fr`. Elle ne
 * doit donc surtout pas être `encodeURIComponent`é, sinon le service reçoit une
 * URL littérale avec des `%3A` et renvoie une image d'erreur en 200.
 */
async function shotThumIo(
  url: string,
  width: number,
  height: number,
  opts: ViewportShotOptions,
): Promise<RenderedVisual> {
  const endpoint = `https://image.thum.io/get/width/${width}/crop/${height}/${url}`;
  return fetchShot(endpoint, "image/jpeg", opts.signal);
}

async function fetchShot(
  endpoint: string,
  mime: string,
  signal: AbortSignal | undefined,
): Promise<RenderedVisual> {
  let res: Response;
  try {
    res = await fetch(endpoint, { signal: signal ?? AbortSignal.timeout(SHOT_TIMEOUT_MS) });
  } catch (e) {
    const aborted = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new RenderError(aborted ? "La capture a expiré." : "Service de capture injoignable.", 504);
  }
  if (!res.ok) {
    throw new RenderError(`Le service de capture a répondu ${res.status}.`, res.status === 429 ? 429 : 502);
  }
  const bytes = await res.arrayBuffer();
  // Un service de capture qui échoue répond parfois 200 avec quelques octets de
  // texte. Sans ce garde-fou on déposerait ça dans le bucket comme une image.
  if (bytes.byteLength < 1024) {
    throw new RenderError("Capture vide ou tronquée.", 502);
  }
  return { mime, bytes };
}
