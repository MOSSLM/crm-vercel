import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import {
  createClaudeDesignMultiPage,
  type ClaudeDesignPageInput,
} from "@/lib/site-builder/create-claude-design";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/site-builder/designs/import-bundle  (JSON)
 *
 * Finalises a multi-page Claude Design import. The browser does the heavy work
 * (unzip, parse, upload each image to the assets bucket, rewrite paths/links and
 * tokenise brackets) — see MultiPageImportDialog — and posts the small,
 * already-processed result here. This avoids the serverless body-size limit that
 * a 20 MB+ image-laden ZIP would blow past.
 *
 * Body: {
 *   siteId, name, sharedCss, fontLinks[], tweaks,
 *   pages: [{ slug, title, serviceTag, html, sourceHtml }],
 *   enterpriseId?
 * }
 */
export const POST = withAuth({}, async ({ req, cors }) => {
  let body: {
    siteId?: string;
    name?: string;
    pages?: ClaudeDesignPageInput[];
    sharedCss?: string;
    fontLinks?: string[];
    tweaks?: Record<string, unknown>;
    enterpriseId?: number | null;
  };
  try {
    body = await req.json();
  } catch {
    return jsonError("JSON invalide.", 400, {}, cors);
  }

  const siteId = body.siteId?.trim();
  const pages = Array.isArray(body.pages) ? body.pages : [];
  if (!siteId) return jsonError("siteId requis.", 400, {}, cors);
  if (pages.length === 0) return jsonError("Aucune page à importer.", 400, {}, cors);

  // Light validation: every page needs a slug + html.
  for (const p of pages) {
    if (!p || typeof p.slug !== "string" || typeof p.html !== "string") {
      return jsonError("Page invalide (slug/html manquant).", 422, {}, cors);
    }
  }

  const name = body.name?.trim() || pages.find((p) => p.slug === "/")?.title || "Template Claude";

  try {
    const supabase = getServiceClient();
    const result = await createClaudeDesignMultiPage(supabase, {
      siteId,
      name,
      pages,
      sharedCss: body.sharedCss ?? "",
      fontLinks: Array.isArray(body.fontLinks) ? body.fontLinks : [],
      tweaks: body.tweaks ?? {},
      enterpriseId: body.enterpriseId ?? null,
    });
    return json({ siteId: result.siteId, pageCount: result.pageCount }, { status: 201, headers: cors });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Échec de l'import.", 500, {}, cors);
  }
});
