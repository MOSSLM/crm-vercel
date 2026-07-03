import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import type { SequenceDefinition } from "@/components/automations/types";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

// Admin: sequences available for assignment + current agent assignments.
export const GET = withAuth({ role: "admin" }, async ({ cors }) => {
  const sc = getServiceClient();
  const [seqRes, assignRes] = await Promise.all([
    sc
      .from("automations")
      .select("id, name, status, definition")
      .eq("kind", "sequence")
      .order("name"),
    sc.from("sequence_agent_assignments").select("automation_id, agent_id"),
  ]);

  if (seqRes.error) return jsonError(seqRes.error.message, 500, {}, cors);
  if (assignRes.error) return jsonError(assignRes.error.message, 500, {}, cors);

  const sequences = (seqRes.data ?? []).map((s) => {
    const def = (s.definition as SequenceDefinition) || { steps: [] };
    return {
      id: s.id,
      name: s.name,
      status: s.status,
      steps_count: Array.isArray(def.steps) ? def.steps.length : 0,
    };
  });

  return json({ sequences, assignments: assignRes.data ?? [] }, { headers: cors });
});

// Admin: assign or unassign a sequence to an agent.
export const POST = withAuth({ role: "admin" }, async ({ user, req, cors }) => {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonError("JSON invalide", 400, {}, cors);
  }

  const agentId = body.agent_id as string | undefined;
  const automationId = body.automation_id as string | undefined;
  const assigned = body.assigned;
  if (!agentId || !automationId || typeof assigned !== "boolean") {
    return jsonError("agent_id, automation_id et assigned requis", 400, {}, cors);
  }

  const sc = getServiceClient();
  const { data: auto, error: autoErr } = await sc
    .from("automations")
    .select("id, kind")
    .eq("id", automationId)
    .maybeSingle();
  if (autoErr) return jsonError(autoErr.message, 500, {}, cors);
  if (!auto || auto.kind !== "sequence") return jsonError("Séquence introuvable", 404, {}, cors);

  if (assigned) {
    const { error } = await sc
      .from("sequence_agent_assignments")
      .upsert(
        { automation_id: automationId, agent_id: agentId, assigned_by: user.id },
        { onConflict: "automation_id,agent_id" },
      );
    if (error) return jsonError(error.message, 500, {}, cors);
  } else {
    const { error } = await sc
      .from("sequence_agent_assignments")
      .delete()
      .match({ automation_id: automationId, agent_id: agentId });
    if (error) return jsonError(error.message, 500, {}, cors);
  }

  return json({ ok: true, assigned }, { headers: cors });
});
