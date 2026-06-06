import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";

export const dynamic = "force-dynamic";

type Params = { siteId: string };

/**
 * Manual LM validation: once the human has reviewed the deployed demo, this
 * moves the linked opportunity to its pipeline's "LM Déployé" stage. The DB
 * trigger keeps opportunites.pipeline_id in sync with the new stage. We never
 * write to the entreprises table — the opportunity stage is the source of
 * truth for "validated".
 */
export const POST = withAuth<undefined, Params>({}, async ({ params }) => {
  const supabase = getServiceClient();
  const { siteId } = params;

  const { data: site } = await supabase
    .from("sites")
    .select("lead_magnet_project_id, enterprise_id")
    .eq("id", siteId)
    .single();
  if (!site) return jsonError("Site introuvable", 404);

  // Resolve the opportunity via the linked lead-magnet project, then fall back
  // to the enterprise's own project.
  let opportuniteId: string | null = null;
  if (site.lead_magnet_project_id) {
    const { data: proj } = await supabase
      .from("lead_magnet_projects")
      .select("opportunite_id")
      .eq("id", site.lead_magnet_project_id)
      .maybeSingle();
    opportuniteId = (proj as { opportunite_id?: string | null } | null)?.opportunite_id ?? null;
  }
  if (!opportuniteId && site.enterprise_id) {
    const { data: proj } = await supabase
      .from("lead_magnet_projects")
      .select("opportunite_id")
      .eq("entreprise_id", site.enterprise_id)
      .not("opportunite_id", "is", null)
      .limit(1)
      .maybeSingle();
    opportuniteId = (proj as { opportunite_id?: string | null } | null)?.opportunite_id ?? null;
  }
  if (!opportuniteId) return jsonError("Aucune opportunité liée à ce site (via le projet lead magnet).", 404);

  const { data: opp } = await supabase
    .from("opportunites")
    .select("id, pipeline_id")
    .eq("id", opportuniteId)
    .maybeSingle();
  if (!opp) return jsonError("Opportunité introuvable", 404);
  const pipelineId = (opp as { pipeline_id?: string | null }).pipeline_id ?? null;
  if (!pipelineId) return jsonError("L'opportunité n'a pas de pipeline.", 422);

  const { data: stage } = await supabase
    .from("etapes_pipeline")
    .select("id, nom")
    .eq("pipeline_id", pipelineId)
    .ilike("nom", "lm déployé")
    .maybeSingle();
  if (!stage) return jsonError("Ce pipeline n'a pas d'étape « LM Déployé ».", 422);

  const stageId = (stage as { id: number }).id;
  const { error: updErr } = await supabase
    .from("opportunites")
    .update({ stage_id: stageId, updated_at: new Date().toISOString() })
    .eq("id", opportuniteId);
  if (updErr) return jsonError(updErr.message, 500);

  return json({ ok: true, opportunite_id: opportuniteId, stage_id: stageId, stage: (stage as { nom: string }).nom });
});
