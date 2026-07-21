import { getServiceClient } from "@/app/api/_lib/service-client";

type ServiceClient = ReturnType<typeof getServiceClient>;

export const STAGE_PREMIERE_APPROCHE = "Première approche";
export const STAGE_CONTACTE = "Contacté (appelé)";

export type AgentStage = { id: number; nom: string; ordre: number };

/**
 * Resolves the dedicated "Agent SAMA" pipeline and its visible stages
 * (created by sql/20260603_agent_portal_ownership.sql). Returns null if the
 * pipeline is missing so callers can surface a clear error.
 */
export async function getAgentPipeline(): Promise<{ pipelineId: string; stages: AgentStage[] } | null> {
  const sc = getServiceClient();
  const { data: pipeline, error } = await sc
    .from("pipelines")
    .select("id")
    .eq("nom", "Agent SAMA")
    .maybeSingle();
  if (error || !pipeline) return null;

  const { data: stages } = await sc
    .from("etapes_pipeline")
    .select("id, nom, ordre")
    .eq("pipeline_id", pipeline.id)
    .eq("visible", true)
    .order("ordre", { ascending: true });

  return { pipelineId: pipeline.id as string, stages: (stages ?? []) as AgentStage[] };
}

/**
 * First email/WhatsApp touch on a deal → advance it to "Première approche",
 * but only when it's still sitting at the pipeline's very first stage
 * ("Nouveau lead") so we never move a deal backwards or past a manual advance.
 * No-op if the deal's pipeline has no "Première approche" stage. Best-effort.
 */
export async function advanceToFirstApproach(sc: ServiceClient, opportuniteId: string): Promise<void> {
  const { data: opp } = await sc
    .from("opportunites")
    .select("id, stage_id, pipeline_id")
    .eq("id", opportuniteId)
    .maybeSingle();
  if (!opp || !opp.pipeline_id) return;

  const { data: stages } = await sc
    .from("etapes_pipeline")
    .select("id, nom, ordre")
    .eq("pipeline_id", opp.pipeline_id)
    .order("ordre", { ascending: true });
  if (!stages || stages.length === 0) return;

  const premiere = (stages as AgentStage[]).find((s) => s.nom === STAGE_PREMIERE_APPROCHE);
  if (!premiere) return;
  if (opp.stage_id === premiere.id) return;

  // Only auto-advance from the very first stage.
  const firstStage = stages[0] as AgentStage;
  const isAtFirst = opp.stage_id == null || opp.stage_id === firstStage.id;
  if (!isAtFirst) return;

  await sc.from("opportunites").update({ stage_id: premiere.id }).eq("id", opportuniteId);
}

/**
 * Completing a phone-call task → advance the deal to "Contacté (appelé)", moving
 * forward only (never back past a more advanced stage). No-op if the deal's
 * pipeline lacks that stage. Best-effort.
 */
export async function advanceToContacted(sc: ServiceClient, opportuniteId: string): Promise<void> {
  const { data: opp } = await sc
    .from("opportunites")
    .select("id, stage_id, pipeline_id")
    .eq("id", opportuniteId)
    .maybeSingle();
  if (!opp || !opp.pipeline_id) return;

  const { data: stages } = await sc
    .from("etapes_pipeline")
    .select("id, nom, ordre")
    .eq("pipeline_id", opp.pipeline_id)
    .order("ordre", { ascending: true });
  if (!stages || stages.length === 0) return;

  const target = (stages as AgentStage[]).find((s) => s.nom === STAGE_CONTACTE);
  if (!target) return;

  const current = (stages as AgentStage[]).find((s) => s.id === opp.stage_id);
  if (current && current.ordre >= target.ordre) return; // already at/past it

  await sc.from("opportunites").update({ stage_id: target.id }).eq("id", opportuniteId);
}
