import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

// Request a pool prospect. The agent no longer self-assigns — this opens a
// pending claim request that the admin confirms (or refuses) from the Agents
// page. Returns 409 if the company is already owned by someone else.
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

  // Only pool (unowned) companies can be requested.
  const { data: ent, error: entErr } = await sc
    .from("entreprises")
    .select("id, owner_id")
    .eq("id", entrepriseId)
    .maybeSingle();
  if (entErr) return jsonError(entErr.message, 500, {}, cors);
  if (!ent) return jsonError("introuvable", 404, {}, cors);
  if (ent.owner_id) {
    return ent.owner_id === user.id
      ? json({ ok: true, already_owned: true }, { headers: cors })
      : jsonError("Ce prospect a déjà été attribué.", 409, {}, cors);
  }

  const { data: reqRow, error: reqErr } = await sc
    .from("prospect_claim_requests")
    .insert({ entreprise_id: entrepriseId, agent_id: user.id })
    .select("id, status")
    .maybeSingle();

  if (reqErr) {
    // unique_violation → a pending request already exists; treat as success.
    if ((reqErr as { code?: string }).code === "23505") {
      return json({ ok: true, already_requested: true }, { headers: cors });
    }
    return jsonError(reqErr.message, 500, {}, cors);
  }

  return json({ ok: true, request: reqRow }, { status: 201, headers: cors });
});
