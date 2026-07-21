import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { advanceEnrollmentAfterTask } from "@/lib/automations/engine";
import { advanceToContacted } from "@/app/api/agent/_lib";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

// Démarchage queue: the pending manual tasks for the prospects this agent
// owns — cold calls plus the manual sequence steps (WhatsApp / LinkedIn).
// Automated channels (sequence emails) are run centrally by the ticker.
// Scoped by the company's owner_id (not assignee_id) so it works for both
// admin-seeded and sequence-generated tasks on the agent's prospects.
export const GET = withAuth({ role: "freelance" }, async ({ user, cors }) => {
  const { data, error } = await getServiceClient()
    .from("prospection_tasks")
    .select(
      "id, kind, status, title, due_at, contact_id, entreprise_id, opportunite_id, payload, enrollment_id, " +
        "contact:contacts(id, first_name, last_name, tel, email), " +
        "entreprise:entreprises!inner(id, name, ville, telephone, owner_id)",
    )
    .eq("entreprise.owner_id", user.id)
    .eq("status", "pending")
    .in("kind", ["call", "whatsapp", "linkedin"])
    .order("due_at", { ascending: true });

  if (error) return jsonError(error.message, 500, {}, cors);
  return json(data ?? [], { headers: cors });
});

// Mark a task done/snoozed and optionally advance the linked opportunity
// stage. Completing a sequence task also advances its enrollment.
export const PATCH = withAuth({ role: "freelance" }, async ({ user, req, cors }) => {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonError("JSON invalide", 400, {}, cors);
  }

  const id = body.id as string | undefined;
  const status = body.status as string | undefined;
  if (!id || !status) return jsonError("id et status requis", 400, {}, cors);

  const sc = getServiceClient();

  // Ownership guard: the task must be assigned to this agent or sit on one of
  // his companies.
  const { data: task, error: taskErr } = await sc
    .from("prospection_tasks")
    .select("id, kind, opportunite_id, enrollment_id, assignee_id, entreprise:entreprises(owner_id)")
    .eq("id", id)
    .maybeSingle();
  if (taskErr) return jsonError(taskErr.message, 500, {}, cors);
  const ownerId = (Array.isArray(task?.entreprise) ? task?.entreprise[0] : task?.entreprise)
    ?.owner_id as string | null | undefined;
  if (!task || (task.assignee_id !== user.id && ownerId !== user.id)) {
    return jsonError("introuvable", 404, {}, cors);
  }

  const patch: Record<string, unknown> = { status };
  if (status === "done") patch.done_at = new Date().toISOString();
  const { data, error } = await sc
    .from("prospection_tasks")
    .update(patch)
    .eq("id", id)
    .select("id, status")
    .maybeSingle();

  if (error) return jsonError(error.message, 500, {}, cors);
  if (!data) return jsonError("introuvable", 404, {}, cors);

  // A completed sequence step resumes the paused enrollment.
  if (status === "done" && task.enrollment_id) {
    try {
      await advanceEnrollmentAfterTask(task.enrollment_id as string);
    } catch {
      // the sequence stays paused; the admin can re-complete from Démarchage
    }
  }

  const opportuniteId = body.opportunite_id as string | undefined;
  const stageId = body.stage_id;
  if (opportuniteId && stageId != null && Number.isFinite(Number(stageId))) {
    await sc
      .from("opportunites")
      .update({ stage_id: Number(stageId), updated_at: new Date().toISOString() })
      .eq("id", opportuniteId)
      .eq("owner_id", user.id);
  } else if (status === "done" && task.kind === "call") {
    // Completing a cold-call task → mark the deal "Contacté (appelé)" (unless the
    // caller already set an explicit stage above). Forward-only, best effort.
    const oppId = (task.opportunite_id as string | null) ?? opportuniteId ?? null;
    if (oppId) await advanceToContacted(sc, oppId).catch(() => {});
  }

  return json(data, { headers: cors });
});
