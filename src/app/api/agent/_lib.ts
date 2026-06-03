import { getServiceClient } from "@/app/api/_lib/service-client";

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
