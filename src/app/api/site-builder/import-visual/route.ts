import { json, jsonError } from "@/app/api/_lib/respond";
import { withAuth } from "@/app/api/_lib/with-auth";
import { storeImportVisual, visualKindForMime } from "@/lib/site-builder/import-visuals";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/site-builder/import-visual  (multipart form-data, field "file")
 *
 * Manual fallback for the visual site import: upload a screenshot/PDF of the
 * page's rendered look (e.g. a GoFullPage paginated PDF). Stores it and returns
 * a reference to attach to the import. Vercel caps inbound bodies at ~4.5 MB —
 * larger captures must be reduced (export as JPEG, or split the page).
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

  const mime = file.type || "";
  if (!visualKindForMime(mime)) {
    return jsonError("Format non supporté (PDF ou image PNG/JPEG/GIF/WebP).", 400, {}, cors);
  }

  try {
    const bytes = await file.arrayBuffer();
    const ref = await storeImportVisual(bytes, mime);
    return json(ref, { headers: cors });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Échec de l'envoi.", 500, {}, cors);
  }
});
