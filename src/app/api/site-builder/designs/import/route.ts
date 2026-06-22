import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { sanitizeDesignHtml } from "@/lib/site-builder/sanitize-design-html";
import { createClaudeDesignSite } from "@/lib/site-builder/create-claude-design";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Generous upper bound on a single HTML upload (Vercel caps bodies ~4.5 MB). */
const MAX_HTML_BYTES = 4_000_000;

/**
 * POST /api/site-builder/designs/import  (multipart form-data)
 *   fields: file (.html, required), name (optional)
 *
 * Imports a whole-page "Claude design" as a single faithful raw section + a
 * template site. Returns the new site id so the UI can open the editor and/or
 * run the variable tokenization pass.
 */
export const POST = withAuth({}, async ({ req, cors }) => {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return jsonError("Formulaire invalide.", 400, {}, cors);
  }

  const file = formData.get("file") as File | null;
  if (!file) return jsonError("Aucun fichier fourni.", 400, {}, cors);

  const name = (formData.get("name") as string | null)?.trim() || "";
  const lowerName = (file.name || "").toLowerCase();
  const isHtml = file.type.includes("html") || lowerName.endsWith(".html") || lowerName.endsWith(".htm");
  if (!isHtml) {
    return jsonError("Format non supporté : envoie un fichier .html exporté depuis Claude.", 400, {}, cors);
  }
  if (file.size > MAX_HTML_BYTES) {
    return jsonError("Fichier trop volumineux (max 4 Mo).", 413, {}, cors);
  }

  let rawHtml: string;
  try {
    rawHtml = await file.text();
  } catch {
    return jsonError("Impossible de lire le fichier.", 400, {}, cors);
  }
  if (!rawHtml.trim()) return jsonError("Le fichier est vide.", 400, {}, cors);

  const sanitized = sanitizeDesignHtml(rawHtml);
  if (!sanitized.html.trim()) {
    return jsonError("Aucun contenu HTML exploitable détecté.", 422, {}, cors);
  }

  const siteName = name || sanitized.title || file.name.replace(/\.html?$/i, "") || "Design Claude";

  try {
    const supabase = getServiceClient();
    const result = await createClaudeDesignSite(supabase, { name: siteName, html: sanitized.html });
    return json(
      { siteId: result.siteId, name: siteName, imageCount: sanitized.imageUrls.length },
      { status: 201, headers: cors },
    );
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Échec de l'import.", 500, {}, cors);
  }
});
