import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import {
  assignProspectsToAgent,
  entreprisesDuLotAAttribuer,
  unassignProspectsFromAgent,
} from "../_assign";

export const runtime = "nodejs";
// Chaque attribution coûte une poignée de requêtes plus une mise en séquence,
// et `mapLimit` en mène quatre de front : deux cents en valent une bonne
// minute. On déclare le budget plutôt que de dépendre du défaut de la
// plateforme — même choix que `/api/marketing-pipeline/reenrich`, pour la même
// raison. `MAX_BATCH` reste le vrai garde-fou : c'est lui qui garantit qu'on
// rend la main avant la coupure, `maxDuration` n'est que la marge.
export const maxDuration = 300;
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

/**
 * `agent_id` part dans un filtre PostgREST assemblé à la main
 * (`or=(owner_id.is.null,owner_id.neq.…)`) : il ne s'y glisse que s'il est un
 * UUID. Ailleurs il ne sert que d'égalité, où PostgREST échappe lui-même.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Admin: assign one or many companies to an agent directly (no request needed).
 *
 * DEUX PORTES, UNE SEULE ATTRIBUTION. Par identifiants (la sélection cochée
 * dans l'explorateur ou le pipeline marketing) ou par `lot_id` — et dans ce
 * second cas la route résout la population elle-même, sans qu'aucun identifiant
 * ne voyage. Voir `entreprisesDuLotAAttribuer` pour le pourquoi.
 *
 * UN LOT SE REPREND, IL NE SE RELANCE PAS. Au plus `MAX_BATCH` par appel, et la
 * réponse porte `restant` : un lot de 249 se fait en deux clics du même bouton,
 * comme `/api/marketing-pipeline/reenrich` rend son `next_after_id`. Il n'y a
 * pas de curseur à transporter — le filtre sur `owner_id` fait que ce qui vient
 * d'être attribué sort tout seul de la population suivante.
 */
export const POST = withAuth({ role: "admin" }, async ({ user, req, cors }) => {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonError("JSON invalide", 400, {}, cors);
  }

  const agentId = body.agent_id as string | undefined;
  if (!agentId || !UUID.test(agentId)) {
    return jsonError("agent_id requis", 400, {}, cors);
  }

  const lotId = body.lot_id != null ? Number(body.lot_id) : null;
  const parLot = lotId != null && Number.isFinite(lotId);

  let entrepriseIds: number[];
  let restant = 0;
  if (parLot) {
    const population = await entreprisesDuLotAAttribuer(lotId, agentId, MAX_BATCH);
    if ("error" in population) return jsonError(population.error, 500, {}, cors);
    entrepriseIds = population.ids;
    restant = population.restant;

    // RIEN À FAIRE N'EST PAS UN ÉCHEC — c'est la réponse normale d'un second
    // clic, ou d'un lot déjà entièrement chez cet agent. Répondre 500 ici
    // ferait passer un lot terminé pour une panne, et on irait chercher la
    // cause dans l'attribution alors qu'il n'y a plus rien à attribuer.
    if (entrepriseIds.length === 0) {
      return json(
        { ok: true, assigned: 0, failed: [], restant: 0, lot_id: lotId },
        { headers: cors },
      );
    }
  } else {
    entrepriseIds = readIds(body.entreprise_id, body.entreprise_ids);
    if (entrepriseIds.length === 0) {
      return jsonError("entreprise_id, entreprise_ids ou lot_id requis", 400, {}, cors);
    }
    if (entrepriseIds.length > MAX_BATCH) {
      return jsonError(`Maximum ${MAX_BATCH} entreprises par attribution`, 400, {}, cors);
    }
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
      // Ce qui reste du lot après ce paquet : l'écran rappelle tant qu'il n'est
      // pas nul. Toujours zéro hors du chemin `lot_id`.
      restant,
      ...(parLot ? { lot_id: lotId } : {}),
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
