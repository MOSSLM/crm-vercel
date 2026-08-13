import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { reparerPhotosSupprimees } from "@/lib/site-builder/claude-design/appliquer-tirage";
import { entreprisesMontrant } from "@/lib/site-builder/claude-design/tirage-entreprise";
import type { MediaImageType } from "@/types";

export const dynamic = "force-dynamic";

type Params = { id: string };

const IMAGE_TYPES: ReadonlySet<MediaImageType> = new Set([
  "stock",
  "ai_generated",
  "personal",
  "company",
]);

interface PatchBody {
  alt_text?: string | null;
  description?: string | null;
  service_tags?: string[];
  image_type?: MediaImageType;
  entreprise_id?: number | null;
}

export const PATCH = withAuth<undefined, Params>({}, async ({ req, params }) => {
  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const patch: Record<string, unknown> = {};
  if (body.alt_text !== undefined) patch.alt_text = body.alt_text;
  if (body.description !== undefined) patch.description = body.description;
  if (body.service_tags !== undefined) {
    if (!Array.isArray(body.service_tags)) return jsonError("service_tags must be array", 400);
    patch.service_tags = Array.from(
      new Set(body.service_tags.map((t) => String(t).trim()).filter(Boolean)),
    );
  }
  if (body.image_type !== undefined) {
    if (!IMAGE_TYPES.has(body.image_type)) return jsonError("Invalid image_type", 400);
    patch.image_type = body.image_type;
  }
  if (body.entreprise_id !== undefined) patch.entreprise_id = body.entreprise_id;

  if (patch.image_type === "company" && !patch.entreprise_id) {
    const supabase = getServiceClient();
    const { data: existing } = await supabase
      .from("media_library")
      .select("entreprise_id")
      .eq("id", params.id)
      .single();
    if (!existing?.entreprise_id) {
      return jsonError("entreprise_id requis pour image_type='company'", 400);
    }
  }

  if (Object.keys(patch).length === 0) return jsonError("No fields to update", 400);

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("media_library")
    .update(patch)
    .eq("id", params.id)
    .select("*")
    .single();

  if (error) return jsonError(error.message, 500);
  return json(data);
});

/**
 * Supprime une image de la médiathèque — ET la retire des bandes qui la
 * montraient.
 *
 * Cette route efface aussi le fichier du storage : sans la réparation qui
 * suit, tout site dont le tirage pointe sur cette URL affiche un cadre cassé,
 * sans que rien ne le signale. On s'en apercevait en ouvrant les sites un par
 * un — deux images mortes traînaient ainsi sur le parc en août 2026.
 *
 * La réparation part des tirages enregistrés (`entreprise_tirages_photos`),
 * qui servent d'index inverse url → entreprises, et retire au sort une
 * remplaçante dans le même métier. Best-effort : la suppression reste un
 * succès même si une repose échoue, et le compte est renvoyé pour l'affichage.
 */
export const DELETE = withAuth<undefined, Params>({}, async ({ params }) => {
  const supabase = getServiceClient();
  const { data: asset, error: fetchError } = await supabase
    .from("media_library")
    .select("storage_path, public_url")
    .eq("id", params.id)
    .single();
  if (fetchError || !asset) return jsonError("Image introuvable", 404);

  const url = (asset as { public_url: string | null }).public_url;
  // Relevé AVANT la suppression : après, plus rien ne relie l'URL à l'image.
  const concernees = url ? await entreprisesMontrant(supabase, [url]) : [];

  await supabase.storage.from("media-library").remove([asset.storage_path]);

  const { error: dbError } = await supabase.from("media_library").delete().eq("id", params.id);
  if (dbError) return jsonError(dbError.message, 500);

  // APRÈS la suppression : la repose vérifie les URLs contre la médiathèque,
  // et ne verrait pas celle-ci comme morte tant que sa ligne existe encore.
  const reparation = await reparerPhotosSupprimees(supabase, concernees);

  return json({ ok: true, reparation });
});
