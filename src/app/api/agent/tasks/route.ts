import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

// Démarchage queue: the pending cold-call tasks for the prospects this agent
// owns. Automated channels (email / WhatsApp sequences) are run centrally by
// the admin — the agent's manual step is the call. Scoped by the company's
// owner_id (not assignee_id) so it works for both admin-seeded and
// sequence-generated call tasks on the agent's prospects.
export const GET = withAuth({ role: "freelance" }, async ({ user, cors }) => {
  const { data, error } = await getServiceClient()
    .from("prospection_tasks")
    .select(
      "id, kind, status, title, due_at, contact_id, entreprise_id, opportunite_id, " +
        "contact:contacts(id, first_name, last_name, tel, email), " +
        "entreprise:entreprises!inner(id, name, ville, telephone, owner_id)",
    )
    .eq("entreprise.owner_id", user.id)
    .eq("status", "pending")
    .eq("kind", "call")
    .order("due_at", { ascending: true });

  if (error) return jsonError(error.message, 500, {}, cors);
  return json(data ?? [], { headers: cors });
});

// Mark a task done/snoozed and optionally advance the linked opportunity stage.
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
  const { data, error } = await sc
    .from("prospection_tasks")
    .update({ status })
    .eq("id", id)
    .select("id, status")
    .maybeSingle();

  if (error) return jsonError(error.message, 500, {}, cors);
  if (!data) return jsonError("introuvable", 404, {}, cors);

  const opportuniteId = body.opportunite_id as string | undefined;
  const stageId = body.stage_id;
  if (opportuniteId && stageId != null && Number.isFinite(Number(stageId))) {
    await sc
      .from("opportunites")
      .update({ stage_id: Number(stageId), updated_at: new Date().toISOString() })
      .eq("id", opportuniteId)
      .eq("owner_id", user.id);
  }

  return json(data, { headers: cors });
});
