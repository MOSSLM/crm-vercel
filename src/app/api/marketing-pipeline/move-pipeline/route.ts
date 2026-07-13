import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { marketingMovePipelineSchema } from "@/app/api/_lib/schemas";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = (req: Request) => preflight(req);

type StageRow = { id: number; ordre: number | null };

/**
 * POST /api/marketing-pipeline/move-pipeline   { opportunity_ids, pipeline_id }
 *
 * Reassigns a batch of opportunities to another CRM pipeline straight from the
 * Marketing & Web board, so dead-site / under-construction prospects can be
 * filed into the right pipeline ("Entreprises sans site web", "Streak…", …) and
 * keep the board tidy. The target stage is the pipeline's first stage (ordre 1,
 * else the lowest ordre), mirroring the bulk move on the Opportunities page.
 */
export const POST = withAuth({ body: marketingMovePipelineSchema }, async ({ body, cors }) => {
  const { opportunity_ids, pipeline_id } = body;
  const supabase = getServiceClient();

  const [pipelineRes, stagesRes] = await Promise.all([
    supabase.from("pipelines").select("id, nom").eq("id", pipeline_id).maybeSingle(),
    supabase.from("etapes_pipeline").select("id, ordre").eq("pipeline_id", pipeline_id),
  ]);

  if (pipelineRes.error) return jsonError(pipelineRes.error.message, 500, {}, cors);
  if (!pipelineRes.data) return jsonError("Pipeline introuvable", 404, {}, cors);
  if (stagesRes.error) return jsonError(stagesRes.error.message, 500, {}, cors);

  const stages = (stagesRes.data ?? []) as StageRow[];
  if (stages.length === 0) return jsonError("Aucune étape pour ce pipeline", 400, {}, cors);

  // First stage: ordre === 1 if present, otherwise the lowest ordre available.
  const targetStage =
    stages.find((s) => s.ordre === 1) ??
    [...stages].sort((a, b) => (a.ordre ?? Number.MAX_SAFE_INTEGER) - (b.ordre ?? Number.MAX_SAFE_INTEGER))[0];

  const ids = [...new Set(opportunity_ids)];
  const { error, count } = await supabase
    .from("opportunites")
    .update({ pipeline_id, stage_id: targetStage.id, updated_at: new Date().toISOString() }, { count: "exact" })
    .in("id", ids);

  if (error) return jsonError(error.message, 500, {}, cors);

  return json(
    { moved: count ?? ids.length, pipeline_nom: (pipelineRes.data as { nom?: string }).nom ?? "le pipeline" },
    { headers: cors },
  );
});
