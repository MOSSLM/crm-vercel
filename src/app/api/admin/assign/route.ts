import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { assignProspectToAgent, unassignProspectFromAgent } from "../_assign";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

// Admin: assign a company to an agent directly (no request needed).
export const POST = withAuth({ role: "admin" }, async ({ user, req, cors }) => {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonError("JSON invalide", 400, {}, cors);
  }

  const entrepriseId = Number(body.entreprise_id);
  const agentId = body.agent_id as string | undefined;
  if (!Number.isFinite(entrepriseId) || !agentId) {
    return jsonError("entreprise_id et agent_id requis", 400, {}, cors);
  }

  const res = await assignProspectToAgent(entrepriseId, agentId);
  if (!res.ok) return jsonError(res.error, 500, {}, cors);

  // Resolve any pending requests on this company: approve the chosen agent's,
  // refuse the rest.
  const sc = getServiceClient();
  const now = new Date().toISOString();
  await sc
    .from("prospect_claim_requests")
    .update({ status: "approved", decided_at: now, decided_by: user.id })
    .eq("entreprise_id", entrepriseId)
    .eq("agent_id", agentId)
    .eq("status", "pending");
  await sc
    .from("prospect_claim_requests")
    .update({ status: "refused", decided_at: now, decided_by: user.id })
    .eq("entreprise_id", entrepriseId)
    .eq("status", "pending");

  return json({ ok: true, opportunite_id: res.opportuniteId }, { status: 201, headers: cors });
});

// Admin: take a company back from an agent and return it to the pool.
// Params travel in the query string — DELETE bodies aren't reliably forwarded.
export const DELETE = withAuth({ role: "admin" }, async ({ req, cors }) => {
  const params = new URL(req.url).searchParams;
  const entrepriseId = Number(params.get("entreprise_id"));
  if (!Number.isFinite(entrepriseId)) {
    return jsonError("entreprise_id requis", 400, {}, cors);
  }
  const agentId = params.get("agent_id");

  const res = await unassignProspectFromAgent(entrepriseId, agentId);
  if (!res.ok) {
    const status = res.error === "entreprise_attribuee_a_un_autre_agent" ? 409 : 500;
    return jsonError(res.error, status, {}, cors);
  }

  return json({ ok: true }, { headers: cors });
});
