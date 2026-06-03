import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { getAgentPipeline } from "../_lib";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

// Claim an unowned prospect from the shared pool: atomically take ownership of
// the company (only if still unowned) and open an opportunity in the agent
// pipeline at the first stage. Returns 409 if another agent claimed it first.
export const POST = withAuth({ role: "freelance" }, async ({ user, req, cors }) => {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonError("JSON invalide", 400, {}, cors);
  }

  const entrepriseId = body.entreprise_id;
  if (entrepriseId == null) return jsonError("entreprise_id requis", 400, {}, cors);

  const sc = getServiceClient();
  const agent = await getAgentPipeline();
  if (!agent || agent.stages.length === 0) {
    return jsonError("pipeline_introuvable", 500, {}, cors);
  }

  // Atomic claim: the owner_id IS NULL filter means only one agent can win.
  const { data: claimed, error: claimErr } = await sc
    .from("entreprises")
    .update({ owner_id: user.id })
    .eq("id", entrepriseId)
    .is("owner_id", null)
    .select("id, name, ville")
    .maybeSingle();

  if (claimErr) return jsonError(claimErr.message, 500, {}, cors);
  if (!claimed) return jsonError("Ce prospect a déjà été réclamé.", 409, {}, cors);

  const { data: opp, error: oppErr } = await sc
    .from("opportunites")
    .insert({
      entreprise_id: entrepriseId,
      owner_id: user.id,
      pipeline_id: agent.pipelineId,
      stage_id: agent.stages[0].id,
      name: claimed.name ?? "Nouveau prospect",
    })
    .select("id")
    .single();

  if (oppErr) return jsonError(oppErr.message, 500, {}, cors);

  return json({ entreprise: claimed, opportunite: opp }, { status: 201, headers: cors });
});
