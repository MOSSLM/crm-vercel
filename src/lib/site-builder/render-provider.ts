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
