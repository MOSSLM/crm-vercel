import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { stageBelongsToDeal } from "@/app/api/agent/_lib";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

// Déplace une affaire vers une autre étape (dépôt kanban). La propriété est
// vérifiée par le filtre `owner_id` : un agent ne bouge que ses propres cartes.
//
// L'étape visée doit appartenir au pipeline de l'affaire. Sans ce contrôle,
// `trg_sync_opportunity_pipeline_from_stage` (sql/20260326_multi_pipeline_support.sql)
// réécrit `pipeline_id` à partir de l'étape : déposer une carte de « Streak
// Mars/Avril » sur une colonne « Agent SAMA » déplacerait l'affaire de pipeline
// sans le moindre message. Les affaires historiques repartiraient une à une vers
// le pipeline agent, défaisant la fusion des doublons.
export const PATCH = withAuth<undefined, { id: string }>(
  { role: "freelance" },
  async ({ user, params, req, cors }) => {
    const { id } = params;
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonError("JSON invalide", 400, {}, cors);
    }
    const stageId = Number(body.stage_id);
    if (!id || !Number.isFinite(stageId)) {
      return jsonError("id et stage_id requis", 400, {}, cors);
    }

    const sc = getServiceClient();
    if (!(await stageBelongsToDeal(sc, id, stageId))) {
      return jsonError("etape_hors_pipeline", 400, {}, cors);
    }

    const { data, error } = await sc
      .from("opportunites")
      .update({ stage_id: stageId, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("owner_id", user.id)
      .select("id, stage_id")
      .maybeSingle();

    if (error) return jsonError(error.message, 500, {}, cors);
    if (!data) return jsonError("introuvable", 404, {}, cors);
    return json(data, { headers: cors });
  },
);
