import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import type { SequenceDefinition, SequenceStep } from "@/components/automations/types";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

type SeqRow = {
  id: string;
  name: string | null;
  description: string | null;
  definition: SequenceDefinition | null;
};

function summarizeSteps(def: SequenceDefinition | null) {
  const steps = Array.isArray(def?.steps) ? (def.steps as SequenceStep[]) : [];
  return steps.map((s) => ({ id: s.id, kind: s.kind, day: s.day ?? 0, label: s.label ?? null }));
}

// Agent: everything the Séquences page needs — the sequences assigned to this
// agent (read-only, active only), his enrollments with progress, and his
// pending manual sequence tasks. Sequences are admin-created; the agent only
// launches them on his own prospects and executes the manual steps.
export const GET = withAuth({ role: "freelance" }, async ({ user, cors }) => {
  const sc = getServiceClient();

  const { data: assignRows, error: assignErr } = await sc
    .from("sequence_agent_assignments")
    .select("automation_id, automation:automations(id, name, description, kind, status, definition)")
    .eq("agent_id", user.id);
  if (assignErr) return jsonError(assignErr.message, 500, {}, cors);

  const assignedSeqs = (assignRows ?? [])
    .map((r) => (Array.isArray(r.automation) ? r.automation[0] : r.automation))
    .filter(
      (a): a is SeqRow & { kind: string; status: string } =>
        !!a && a.kind === "sequence" && a.status === "on",
    );

  const sequences = assignedSeqs.map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    steps: summarizeSteps(a.definition),
  }));

  const [enrollRes, tasksRes] = await Promise.all([
    sc
      .from("sequence_enrollments")
      .select(
        "id, automation_id, current_step, status, next_run_at, entered_at, " +
          "entreprise:entreprises(id, name), contact:contacts(id, first_name, last_name)",
      )
      .eq("created_by", user.id)
      .order("entered_at", { ascending: false })
      .limit(100),
    sc
      .from("prospection_tasks")
      .select(
        "id, kind, title, due_at, payload, enrollment_id, opportunite_id, automation_id, " +
          "contact:contacts(id, first_name, last_name, tel), " +
          "entreprise:entreprises(id, name, telephone)",
      )
      .eq("assignee_id", user.id)
      .eq("status", "pending")
      .not("enrollment_id", "is", null)
      .order("due_at", { ascending: true }),
  ]);
  if (enrollRes.error) return jsonError(enrollRes.error.message, 500, {}, cors);
  if (tasksRes.error) return jsonError(tasksRes.error.message, 500, {}, cors);

  const enrollRows = (enrollRes.data ?? []) as unknown as Array<
    Record<string, unknown> & { automation_id: string }
  >;

  // total_steps per enrollment: from the assigned sequences already loaded,
  // with a fallback fetch for enrollments on since-unassigned sequences.
  const stepsCountById = new Map(sequences.map((s) => [s.id, s.steps.length]));
  const nameById = new Map(assignedSeqs.map((a) => [a.id, a.name]));
  const missing = [
    ...new Set(enrollRows.map((e) => e.automation_id).filter((id) => !stepsCountById.has(id))),
  ];
  if (missing.length > 0) {
    const { data: extra } = await sc
      .from("automations")
      .select("id, name, definition")
      .in("id", missing);
    for (const a of extra ?? []) {
      stepsCountById.set(a.id, summarizeSteps(a.definition as SequenceDefinition).length);
      nameById.set(a.id, a.name);
    }
  }

  const enrollments = enrollRows.map((e) => ({
    ...e,
    sequence_name: nameById.get(e.automation_id) ?? null,
    total_steps: stepsCountById.get(e.automation_id) ?? 0,
  }));

  return json({ sequences, enrollments, tasks: tasksRes.data ?? [] }, { headers: cors });
});
