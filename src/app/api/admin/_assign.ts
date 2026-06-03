import { getServiceClient } from "@/app/api/_lib/service-client";
import { getAgentPipeline } from "@/app/api/agent/_lib";

export type AssignResult =
  | { ok: true; entrepriseId: number; agentId: string; opportuniteId: string }
  | { ok: false; error: string };

/**
 * Assign a pool company to an agent (admin-driven). Takes ownership of the
 * company, opens an opportunity in the "Agent SAMA" pipeline if one doesn't
 * exist yet, and seeds the first "Appel à froid" task so the prospect shows up
 * in the agent's Démarchage queue. Safe to call twice — it won't duplicate the
 * opportunity or the seed task.
 */
export async function assignProspectToAgent(
  entrepriseId: number,
  agentId: string,
): Promise<AssignResult> {
  const sc = getServiceClient();
  const agent = await getAgentPipeline();
  if (!agent || agent.stages.length === 0) {
    return { ok: false, error: "pipeline_introuvable" };
  }

  const { data: ent, error: entErr } = await sc
    .from("entreprises")
    .update({ owner_id: agentId })
    .eq("id", entrepriseId)
    .select("id, name, telephone")
    .maybeSingle();
  if (entErr) return { ok: false, error: entErr.message };
  if (!ent) return { ok: false, error: "entreprise_introuvable" };

  // Reuse an existing opportunity for this prospect + agent if there is one.
  const { data: existing } = await sc
    .from("opportunites")
    .select("id")
    .eq("entreprise_id", entrepriseId)
    .eq("owner_id", agentId)
    .eq("pipeline_id", agent.pipelineId)
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    return { ok: true, entrepriseId, agentId, opportuniteId: existing.id as string };
  }

  const { data: opp, error: oppErr } = await sc
    .from("opportunites")
    .insert({
      entreprise_id: entrepriseId,
      owner_id: agentId,
      pipeline_id: agent.pipelineId,
      stage_id: agent.stages[0].id,
      name: ent.name ?? "Nouveau prospect",
    })
    .select("id")
    .single();
  if (oppErr) return { ok: false, error: oppErr.message };

  // Seed the cold-call task — the agent's manual step in the sequence.
  await sc.from("prospection_tasks").insert({
    kind: "call",
    status: "pending",
    entreprise_id: entrepriseId,
    opportunite_id: opp.id,
    assignee_id: agentId,
    title: "Appel à froid",
    payload: { phone: ent.telephone ?? null },
  });

  return { ok: true, entrepriseId, agentId, opportuniteId: opp.id as string };
}
