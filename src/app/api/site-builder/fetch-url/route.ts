import { json, jsonError } from "@/app/api/_lib/respond";
import { withAuth } from "@/app/api/_lib/with-auth";
import { fetchPageHtml, FetchPageError } from "@/lib/site-builder/fetch-page-html";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/site-builder/fetch-url
 * Body: { url }
 *
 * Fetches a remote page and returns normalized, self-contained HTML (absolute
 * asset URLs, scripts stripped) ready to feed to the page-import conversion. The
 * fetch is decoupled from the (slow) AI conversion so neither hits the Vercel
 * function timeout, and so the user can preview/edit the HTML before importing.
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

  try {
    const result = await fetchPageHtml(url);
    return json(result, { headers: cors });
  } catch (e) {
    if (e instanceof FetchPageError) {
      return jsonError(e.message, e.status, e.hint ? { hint: e.hint } : {}, cors);
    }
    return jsonError(e instanceof Error ? e.message : "Échec de récupération", 502, {}, cors);
  }
});
