import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { assignProspectToAgent } from "../_assign";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

// Admin: list the pending prospect-claim requests waiting for a decision.
export const GET = withAuth({ role: "admin" }, async ({ cors }) => {
  const { data, error } = await getServiceClient()
    .from("prospect_claim_requests")
    .select(
      "id, status, created_at, " +
        "entreprise:entreprises(id, name, ville, telephone), " +
        "agent:user_profiles!prospect_claim_requests_agent_id_fkey(id, full_name, email)",
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) return jsonError(error.message, 500, {}, cors);
  return json(data ?? [], { headers: cors });
});

// Admin: confirm or refuse a request. Approving assigns the company + opens the
// opportunity + seeds the cold-call task, and refuses any rival pending request
// on the same company.
export const POST = withAuth({ role: "admin" }, async ({ user, req, cors }) => {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonError("JSON invalide", 400, {}, cors);
  }

  const requestId = body.request_id as string | undefined;
  const decision = body.decision as string | undefined;
  if (!requestId || (decision !== "approve" && decision !== "refuse")) {
    return jsonError("request_id et decision (approve|refuse) requis", 400, {}, cors);
  }

  const sc = getServiceClient();
  const { data: reqRow, error } = await sc
    .from("prospect_claim_requests")
    .select("id, entreprise_id, agent_id, status")
    .eq("id", requestId)
    .maybeSingle();
  if (error) return jsonError(error.message, 500, {}, cors);
  if (!reqRow) return jsonError("introuvable", 404, {}, cors);
  if (reqRow.status !== "pending") return jsonError("Demande déjà traitée.", 409, {}, cors);

  const now = new Date().toISOString();

  if (decision === "refuse") {
    await sc
      .from("prospect_claim_requests")
      .update({ status: "refused", decided_at: now, decided_by: user.id })
      .eq("id", requestId);
    return json({ ok: true, status: "refused" }, { headers: cors });
  }

  const res = await assignProspectToAgent(reqRow.entreprise_id as number, reqRow.agent_id as string);
  if (!res.ok) return jsonError(res.error, 500, {}, cors);

  await sc
    .from("prospect_claim_requests")
    .update({ status: "approved", decided_at: now, decided_by: user.id })
    .eq("id", requestId);
  // The company is taken now — refuse any other pending request on it.
  await sc
    .from("prospect_claim_requests")
    .update({ status: "refused", decided_at: now, decided_by: user.id })
    .eq("entreprise_id", reqRow.entreprise_id)
    .eq("status", "pending");

  return json({ ok: true, status: "approved", opportunite_id: res.opportuniteId }, { headers: cors });
});
