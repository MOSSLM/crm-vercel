import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { assignProspectsToAgent, unassignProspectsFromAgent } from "../_assign";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

/** Entreprises traitables en un appel — garde-fou anti-timeout. */
const MAX_BATCH = 200;

/**
 * Accepte l'ancien `entreprise_id` (une seule) comme le `entreprise_ids` des
 * attributions en masse : les deux formes cohabitent sur la même route.
 */
const readIds = (single: unknown, many: unknown): number[] => {
  const raw = Array.isArray(many) ? many : single != null ? [single] : [];
  return [...new Set(raw.map(Number).filter((n) => Number.isFinite(n)))];
};

// Admin: assign one or many companies to an agent directly (no request needed).
export const POST = withAuth({ role: "admin" }, async ({ user, req, cors }) => {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonError("JSON invalide", 400, {}, cors);
  }

  const entrepriseIds = readIds(body.entreprise_id, body.entreprise_ids);
  const agentId = body.agent_id as string | undefined;
  if (entrepriseIds.length === 0 || !agentId) {
    return jsonError("entreprise_id (ou entreprise_ids) et agent_id requis", 400, {}, cors);
  }
  if (entrepriseIds.length > MAX_BATCH) {
    return jsonError(`Maximum ${MAX_BATCH} entreprises par attribution`, 400, {}, cors);
  }

  const res = await assignProspectsToAgent(entrepriseIds, agentId);
  if (!res.ok) return jsonError(res.error, 500, {}, cors);

  // Rien n'est passé : c'est un échec, pas un succès partiel.
  if (res.assigned.length === 0) {
    return jsonError(
      res.failed[0]?.error ?? "attribution_impossible",
      500,
      { failed: res.failed },
      cors,
    );
  }

  // Resolve any pending requests on the assigned companies: approve the chosen
  // agent's, refuse the rest.
  const sc = getServiceClient();
  const now = new Date().toISOString();
  const assignedIds = res.assigned.map((a) => a.entreprise_id);
  await sc
    .from("prospect_claim_requests")
    .update({ status: "approved", decided_at: now, decided_by: user.id })
    .in("entreprise_id", assignedIds)
    .eq("agent_id", agentId)
    .eq("status", "pending");
  await sc
    .from("prospect_claim_requests")
    .update({ status: "refused", decided_at: now, decided_by: user.id })
    .in("entreprise_id", assignedIds)
    .eq("status", "pending");

  return json(
    {
      ok: true,
      assigned: res.assigned.length,
      failed: res.failed,
      // Conservé pour les appels portant sur une seule entreprise.
      opportunite_id: res.assigned[0].opportunite_id,
    },
    { status: 201, headers: cors },
  );
});

// Admin: take one or many companies back from an agent and return them to the
// pool. Params travel in the query string — DELETE bodies aren't reliably
// forwarded — et `entreprise_ids` accepte une liste séparée par des virgules.
export const DELETE = withAuth({ role: "admin" }, async ({ req, cors }) => {
  const params = new URL(req.url).searchParams;
  const entrepriseIds = readIds(
    params.get("entreprise_id"),
    params.get("entreprise_ids")?.split(",") ?? null,
  );
  if (entrepriseIds.length === 0) {
    return jsonError("entreprise_id (ou entreprise_ids) requis", 400, {}, cors);
  }
  if (entrepriseIds.length > MAX_BATCH) {
    return jsonError(`Maximum ${MAX_BATCH} entreprises par retrait`, 400, {}, cors);
  }
  const agentId = params.get("agent_id");

  const res = await unassignProspectsFromAgent(entrepriseIds, agentId);

  if (res.released.length === 0) {
    const first = res.failed[0]?.error ?? "retrait_impossible";
    const status = first === "entreprise_attribuee_a_un_autre_agent" ? 409 : 500;
    return jsonError(first, status, { failed: res.failed }, cors);
  }

  return json({ ok: true, released: res.released.length, failed: res.failed }, { headers: cors });
});
