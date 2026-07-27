import { getServiceClient } from "@/app/api/_lib/service-client";
import { getAgentPipeline } from "@/app/api/agent/_lib";

type ServiceClient = ReturnType<typeof getServiceClient>;

/**
 * `entreprises.owner_id` is the single source of truth for who works a
 * prospect; a deal never owns itself. This realigns every opportunity of a
 * company on its owner, so the admin view (which reads the company) and the
 * agent's board (which reads the deals) can never disagree — the drift that
 * left released prospects sitting in an agent's pipeline.
 *
 * Only touches rows that are actually out of sync.
 */
async function syncOpportuniteOwners(
  sc: ServiceClient,
  entrepriseId: number,
  ownerId: string | null,
): Promise<string | null> {
  const { data, error } = await sc
    .from("opportunites")
    .select("id, owner_id")
    .eq("entreprise_id", entrepriseId);
  if (error) return error.message;

  const stale = (data ?? []).filter((o) => o.owner_id !== ownerId).map((o) => o.id as string);
  if (stale.length === 0) return null;

  const { error: updErr } = await sc
    .from("opportunites")
    .update({ owner_id: ownerId })
    .in("id", stale);
  return updErr ? updErr.message : null;
}

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

  // Reuse an existing opportunity for this prospect: the agent's own, or one
  // released by a previous unassignment (owner_id null) so re-attributing a
  // prospect picks its history back up instead of forking a second deal.
  const { data: candidates } = await sc
    .from("opportunites")
    .select("id, owner_id")
    .eq("entreprise_id", entrepriseId)
    .eq("pipeline_id", agent.pipelineId)
    .limit(20);

  const reusable = (candidates ?? []).filter((o) => o.owner_id === agentId || o.owner_id == null);
  const existing = reusable.find((o) => o.owner_id === agentId) ?? reusable[0] ?? null;

  const alreadyOwned = existing?.id != null && existing.owner_id === agentId;

  let opportuniteId: string;
  if (existing?.id) {
    // The agent's own deal, or one released by a previous unassignment.
    opportuniteId = existing.id as string;
  } else {
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
    opportuniteId = opp.id as string;
  }

  // Every deal of the company follows its new owner — including ones a
  // previous release left behind.
  const syncErr = await syncOpportuniteOwners(sc, entrepriseId, agentId);
  if (syncErr) return { ok: false, error: syncErr };

  if (alreadyOwned) {
    return { ok: true, entrepriseId, agentId, opportuniteId };
  }

  // Seed the cold-call task — the agent's manual step in the sequence. Skipped
  // when one is already waiting on this company, so a re-attribution doesn't
  // stack duplicate calls in the Démarchage queue.
  const { data: pendingCall } = await sc
    .from("prospection_tasks")
    .select("id")
    .eq("entreprise_id", entrepriseId)
    .eq("kind", "call")
    .eq("status", "pending")
    .limit(1)
    .maybeSingle();

  if (!pendingCall) {
    await sc.from("prospection_tasks").insert({
      kind: "call",
      status: "pending",
      entreprise_id: entrepriseId,
      opportunite_id: opportuniteId,
      assignee_id: agentId,
      title: "Appel à froid",
      payload: { phone: ent.telephone ?? null },
    });
  }

  return { ok: true, entrepriseId, agentId, opportuniteId };
}

export type UnassignResult =
  | { ok: true; entrepriseId: number; agentId: string | null }
  | { ok: false; error: string };

/**
 * Give a company back to the pool (admin-driven) — the mirror of
 * `assignProspectToAgent`. Releases ownership, releases its deals (kept, not
 * deleted, so the history survives a later re-attribution), drops the manual
 * tasks still waiting on the prospect and exits its running sequences so
 * nothing keeps firing for an agent who no longer owns it.
 *
 * Every step runs even when the company is already back in the pool, and every
 * error is reported instead of swallowed: a half-applied release used to leave
 * the deal owned by the agent — the prospect vanished from the admin's list but
 * stayed on the agent's pipeline — and re-clicking "Retirer" was a no-op that
 * could never repair it. Re-running it now always reconciles.
 */
export async function unassignProspectFromAgent(
  entrepriseId: number,
  expectedAgentId?: string | null,
): Promise<UnassignResult> {
  const sc = getServiceClient();

  const { data: ent, error: entErr } = await sc
    .from("entreprises")
    .select("id, owner_id")
    .eq("id", entrepriseId)
    .maybeSingle();
  if (entErr) return { ok: false, error: entErr.message };
  if (!ent) return { ok: false, error: "entreprise_introuvable" };

  const ownerId = (ent.owner_id as string | null) ?? null;
  if (expectedAgentId && ownerId && ownerId !== expectedAgentId) {
    return { ok: false, error: "entreprise_attribuee_a_un_autre_agent" };
  }

  if (ownerId) {
    const { error: relErr } = await sc
      .from("entreprises")
      .update({ owner_id: null })
      .eq("id", entrepriseId);
    if (relErr) return { ok: false, error: relErr.message };
  }

  // Deals lose their owner too — whoever it was. Runs even on an already
  // released company, which is what repairs a previously botched removal.
  const syncErr = await syncOpportuniteOwners(sc, entrepriseId, null);
  if (syncErr) return { ok: false, error: syncErr };

  const { error: taskErr } = await sc
    .from("prospection_tasks")
    .delete()
    .eq("entreprise_id", entrepriseId)
    .eq("status", "pending");
  if (taskErr) return { ok: false, error: taskErr.message };

  const { error: enrollErr } = await sc
    .from("sequence_enrollments")
    .update({ status: "exited", next_run_at: null })
    .eq("entreprise_id", entrepriseId)
    .in("status", ["active", "paused"]);
  if (enrollErr) return { ok: false, error: enrollErr.message };

  return { ok: true, entrepriseId, agentId: ownerId };
}
