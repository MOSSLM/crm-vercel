import { json, jsonError } from "@/app/api/_lib/respond";
import { withAuth } from "@/app/api/_lib/with-auth";
import { renderPage, renderProviderConfigured, RenderError } from "@/lib/site-builder/render-provider";
import { storeImportVisual } from "@/lib/site-builder/import-visuals";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/site-builder/screenshot
 * Body: { url }
 *
 * Renders a page via the external render provider (JS executed) and stores the
 * resulting visual (full-page PDF) in Supabase, returning a lightweight
 * reference to attach to the import. Optionally returns the rendered HTML.
 *
 * SSRF note: our server never fetches the target URL — the external provider
 * does — so no internal-network guard is needed here.
 */
export const POST = withAuth({}, async ({ req, cors }) => {
  let body: { url?: string };
  try {
    body = (await req.json()) as { url?: string };
  } catch {
    return jsonError("invalid_body", 400, {}, cors);
  }

  const url = (body.url || "").trim();
  if (!url) return jsonError("url requise", 400, {}, cors);

  if (!renderProviderConfigured()) {
    return jsonError("Rendu automatique non configuré.", 501, { code: "render_not_configured" }, cors);
  }

  try {
    const result = await renderPage(url);
    const visual = result.visual
      ? await storeImportVisual(result.visual.bytes, result.visual.mime)
      : null;
    return json({ visual, renderedHtml: result.renderedHtml ?? null }, { headers: cors });
  } catch (e) {
    if (e instanceof RenderError) return jsonError(e.message, e.status, {}, cors);
    return jsonError(e instanceof Error ? e.message : "Échec du rendu.", 502, {}, cors);
  }
});
