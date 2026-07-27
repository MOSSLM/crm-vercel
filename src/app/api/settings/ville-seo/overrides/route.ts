import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { villeSeoOverrideSchema } from "@/app/api/_lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = (req: Request) => preflight(req);

const isMissingTable = (error: { code?: string; message?: string } | null): boolean =>
  !!error &&
  (error.code === "42P01" ||
    error.code === "PGRST205" ||
    /does not exist|could not find the table/i.test(error.message ?? ""));

/**
 * POST /api/settings/ville-seo/overrides
 *
 * Pose (ou remplace) une correction manuelle de ville SEO. Elle gagne sur le
 * calcul géographique, et vaut pour TOUTES les entreprises du code postal — ou
 * de la commune quand elle est précisée.
 *
 * L'upsert vise l'index partiel correspondant : deux règles peuvent coexister
 * pour un même code postal, l'une ciblant une commune, l'autre servant de
 * défaut, et c'est la plus spécifique qui l'emporte à la lecture.
 */
export const POST = withAuth({ body: villeSeoOverrideSchema }, async ({ body, cors }) => {
  const sb = getServiceClient();
  const commune = body.commune?.trim() || null;

  const row = {
    code_postal: body.code_postal.trim(),
    commune,
    ville_seo: body.ville_seo.trim(),
    note: body.note?.trim() || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await sb
    .from("ville_seo_overrides")
    .upsert(row, { onConflict: commune ? "code_postal,commune" : "code_postal" })
    .select("id, code_postal, commune, ville_seo, note")
    .single();

  if (error) {
    if (isMissingTable(error)) {
      return jsonError("Applique d'abord sql/20260727_ville_seo_geo.sql dans Supabase.", 409, {}, cors);
    }
    return jsonError(error.message, 500, {}, cors);
  }

  return json({ override: data }, { headers: cors });
});

/** DELETE /api/settings/ville-seo/overrides?id=123 — retire une correction. */
export const DELETE = withAuth({}, async ({ req, cors }) => {
  const id = new URL(req.url).searchParams.get("id");
  if (!id || !/^\d+$/.test(id)) return jsonError("id invalide", 400, {}, cors);

  const { error } = await getServiceClient().from("ville_seo_overrides").delete().eq("id", Number(id));
  if (error) return jsonError(error.message, 500, {}, cors);

  return json({ deleted: Number(id) }, { headers: cors });
});
