import { getServiceClient } from "@/app/api/_lib/service-client";
import { getAgentPipeline, type AgentStage } from "@/app/api/agent/_lib";
import { isRealDeal, pickSurvivor, type DealRecord } from "@/lib/opportunites/one-per-company";

type ServiceClient = ReturnType<typeof getServiceClient>;

/** Pipeline « Agent SAMA » déjà résolu, pour ne pas le relire à chaque prospect. */
export type AgentPipelineRef = { pipelineId: string; stages: AgentStage[] };

/**
 * `Promise.all` borné : les attributions en masse partent par petits paquets
 * plutôt que toutes d'un coup. Chaque prospect coûte une poignée de requêtes —
 * lâcher 200 attributions en parallèle saturerait le pool Postgres.
 */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (let i = cursor++; i < items.length; i = cursor++) {
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Ids uniques, dans l'ordre d'arrivée. */
const uniqueIds = (ids: number[]): number[] => [...new Set(ids.filter((n) => Number.isFinite(n)))];

/**
 * `entreprises.owner_id` is the single source of truth for who works a
 * prospect; a deal never owns itself. This realigns every opportunity of a
 * company on its owner, so the admin view (which reads the company) and the
 * agent's board (which reads the deals) can never disagree — the drift that
 * left released prospects sitting in an agent's pipeline.
 *
 * Only touches rows that are actually out of sync.
 */
async function syncOpportuniteOwners(
  sc: ServiceClient,
  entrepriseId: number,
  ownerId: string | null,
): Promise<string | null> {
  const { data, error } = await sc
    .from("opportunites")
    .select("id, owner_id")
    .eq("entreprise_id", entrepriseId);
  if (error) return error.message;

  const stale = (data ?? []).filter((o) => o.owner_id !== ownerId).map((o) => o.id as string);
  if (stale.length === 0) return null;

  const { error: updErr } = await sc
    .from("opportunites")
    .update({ owner_id: ownerId })
    .in("id", stale);
  return updErr ? updErr.message : null;
}

export type AssignResult =
  | { ok: true; entrepriseId: number; agentId: string; opportuniteId: string }
  | { ok: false; error: string };

/**
 * Attribue une entreprise du pool à un agent (action admin).
 *
 * UNE ENTREPRISE = UNE AFFAIRE. Attribuer, c'est poser `owner_id` sur l'affaire
 * qui existe déjà — quel que soit son pipeline et quel que soit son propriétaire
 * actuel. On ne crée une affaire que si l'entreprise n'en a strictement aucune.
 *
 * L'ancienne version ne cherchait un candidat que dans le pipeline « Agent
 * SAMA », et seulement s'il appartenait à l'agent ou à personne : une entreprise
 * dont l'affaire vivait dans « Streak Mars/Avril » n'avait aucun candidat, donc
 * l'attribution ouvrait une seconde affaire. Un lot de 47 entreprises a produit
 * 47 doublons — chacun déclenchant en plus `opportunity_created` et ses
 * automatisations.
 *
 * L'affaire réutilisée NE CHANGE PAS de pipeline : on n'écrit que `owner_id`,
 * jamais `stage_id` ni `pipeline_id`. Toucher `stage_id` déclencherait
 * `trg_sync_opportunity_pipeline_from_stage`, qui dérive `pipeline_id` de
 * l'étape et déplacerait l'affaire (cf. `sql/20260326_multi_pipeline_support.sql`).
 *
 * Sème la première tâche « Appel à froid » pour que le prospect apparaisse dans
 * la file Démarchage. Rejouable sans dommage : ni l'affaire ni la tâche ne sont
 * dupliquées.
 *
 * `pipeline` laisse une attribution en masse résoudre le pipeline agent une
 * seule fois pour tout le lot. Il n'est nécessaire QUE pour créer une affaire :
 * une attribution sur affaire existante réussit même sans lui.
 */
export async function assignProspectToAgent(
  entrepriseId: number,
  agentId: string,
  pipeline?: AgentPipelineRef | null,
): Promise<AssignResult> {
  const sc = getServiceClient();

  // L'entreprise est lue AVANT d'être réattribuée. Le trigger
  // `entreprises_sync_opportunite_owner` propage `owner_id` sur toutes ses
  // affaires dès l'update : après coup, elles appartiennent déjà à l'agent et
  // plus rien ne distingue une première attribution d'une réattribution. C'est
  // l'ancien propriétaire de l'ENTREPRISE qui fait foi.
  const { data: ent, error: entErr } = await sc
    .from("entreprises")
    .select("id, name, telephone, owner_id")
    .eq("id", entrepriseId)
    .maybeSingle();
  if (entErr) return { ok: false, error: entErr.message };
  if (!ent) return { ok: false, error: "entreprise_introuvable" };

  const alreadyOwned = (ent.owner_id as string | null) === agentId;

  // Toutes les affaires de l'entreprise, tous pipelines confondus et quel que
  // soit leur propriétaire : l'attribution admin est autoritaire, elle reprend
  // l'affaire d'un autre agent au lieu d'en forger une seconde.
  const { data: deals, error: dealsErr } = await sc
    .from("opportunites")
    .select("id, owner_id, pipeline_id, stage_id, created_at, is_test")
    .eq("entreprise_id", entrepriseId)
    .order("created_at", { ascending: true })
    .limit(50);
  if (dealsErr) return { ok: false, error: dealsErr.message };

  const real = ((deals ?? []) as DealRecord[]).filter(isRealDeal);
  const existing = pickSurvivor(real);

  if (real.length > 1) {
    // Doublon résiduel : l'invariant n'est pas encore tenu sur cette entreprise.
    // On attribue quand même (l'admin ne doit pas être bloqué), mais on le dit —
    // c'est ce que `/api/admin/merge-duplicate-opportunites` est là pour réparer.
    console.warn(
      `[assign] entreprise ${entrepriseId} porte ${real.length} affaires : ` +
        `attribution sur ${existing?.id}, doublons à fusionner.`,
    );
  }

  const { error: ownErr } = await sc
    .from("entreprises")
    .update({ owner_id: agentId })
    .eq("id", entrepriseId);
  if (ownErr) return { ok: false, error: ownErr.message };

  let opportuniteId: string;
  if (existing) {
    // L'affaire existe : elle change de main, pas de pipeline.
    opportuniteId = String(existing.id);
  } else {
    // Aucune affaire : c'est le seul cas où l'attribution en crée une, dans le
    // pipeline agent, à sa première étape.
    const agent = pipeline ?? (await getAgentPipeline());
    if (!agent || agent.stages.length === 0) {
      return { ok: false, error: "pipeline_introuvable" };
    }
    const { data: opp, error: oppErr } = await sc
      .from("opportunites")
      .insert({
        entreprise_id: entrepriseId,
        owner_id: agentId,
        pipeline_id: agent.pipelineId,
        stage_id: agent.stages[0].id,
        name: ent.name ?? "Nouveau prospect",
      })
      .select("id")
      .single();
    if (oppErr) return { ok: false, error: oppErr.message };
    opportuniteId = opp.id as string;
  }

  // Every deal of the company follows its new owner — including ones a
  // previous release left behind.
  const syncErr = await syncOpportuniteOwners(sc, entrepriseId, agentId);
  if (syncErr) return { ok: false, error: syncErr };

  if (alreadyOwned) {
    return { ok: true, entrepriseId, agentId, opportuniteId };
  }

  // Seed the cold-call task — the agent's manual step in the sequence. Skipped
  // when one is already waiting on this company, so a re-attribution doesn't
  // stack duplicate calls in the Démarchage queue.
  const { data: pendingCall } = await sc
    .from("prospection_tasks")
    .select("id")
    .eq("entreprise_id", entrepriseId)
    .eq("kind", "call")
    .eq("status", "pending")
    .limit(1)
    .maybeSingle();

  if (!pendingCall) {
    await sc.from("prospection_tasks").insert({
      kind: "call",
      status: "pending",
      entreprise_id: entrepriseId,
      opportunite_id: opportuniteId,
      assignee_id: agentId,
      title: "Appel à froid",
      payload: { phone: ent.telephone ?? null },
    });
  }

  return { ok: true, entrepriseId, agentId, opportuniteId };
}

export type UnassignResult =
  | { ok: true; entrepriseId: number; agentId: string | null }
  | { ok: false; error: string };

/**
 * Give a company back to the pool (admin-driven) — the mirror of
 * `assignProspectToAgent`. Releases ownership, releases its deals (kept, not
 * deleted, so the history survives a later re-attribution), drops the manual
 * tasks still waiting on the prospect and exits its running sequences so
 * nothing keeps firing for an agent who no longer owns it.
 *
 * Every step runs even when the company is already back in the pool, and every
 * error is reported instead of swallowed: a half-applied release used to leave
 * the deal owned by the agent — the prospect vanished from the admin's list but
 * stayed on the agent's pipeline — and re-clicking "Retirer" was a no-op that
 * could never repair it. Re-running it now always reconciles.
 */
export async function unassignProspectFromAgent(
  entrepriseId: number,
  expectedAgentId?: string | null,
): Promise<UnassignResult> {
  const sc = getServiceClient();

  const { data: ent, error: entErr } = await sc
    .from("entreprises")
    .select("id, owner_id")
    .eq("id", entrepriseId)
    .maybeSingle();
  if (entErr) return { ok: false, error: entErr.message };
  if (!ent) return { ok: false, error: "entreprise_introuvable" };

  const ownerId = (ent.owner_id as string | null) ?? null;
  if (expectedAgentId && ownerId && ownerId !== expectedAgentId) {
    return { ok: false, error: "entreprise_attribuee_a_un_autre_agent" };
  }

  if (ownerId) {
    const { error: relErr } = await sc
      .from("entreprises")
      .update({ owner_id: null })
      .eq("id", entrepriseId);
    if (relErr) return { ok: false, error: relErr.message };
  }

  // Deals lose their owner too — whoever it was. Runs even on an already
  // released company, which is what repairs a previously botched removal.
  const syncErr = await syncOpportuniteOwners(sc, entrepriseId, null);
  if (syncErr) return { ok: false, error: syncErr };

  const { error: taskErr } = await sc
    .from("prospection_tasks")
    .delete()
    .eq("entreprise_id", entrepriseId)
    .eq("status", "pending");
  if (taskErr) return { ok: false, error: taskErr.message };

  const { error: enrollErr } = await sc
    .from("sequence_enrollments")
    .update({ status: "exited", next_run_at: null })
    .eq("entreprise_id", entrepriseId)
    .in("status", ["active", "paused"]);
  if (enrollErr) return { ok: false, error: enrollErr.message };

  return { ok: true, entrepriseId, agentId: ownerId };
}

export type BatchFailure = { entreprise_id: number; error: string };

export type BatchAssignResult =
  | {
      ok: true;
      assigned: { entreprise_id: number; opportunite_id: string }[];
      failed: BatchFailure[];
    }
  | { ok: false; error: string };

/**
 * Attribue un lot d'entreprises au même agent — ce que fait « Attribuer la
 * sélection » côté admin. Le pipeline agent est résolu une fois pour tout le
 * lot, et un échec isolé n'annule pas les autres : l'appelant reçoit le détail
 * pour le remonter, plutôt qu'un tout-ou-rien qui laisserait l'admin sans
 * savoir ce qui est passé.
 */
export async function assignProspectsToAgent(
  entrepriseIds: number[],
  agentId: string,
): Promise<BatchAssignResult> {
  const ids = uniqueIds(entrepriseIds);
  if (ids.length === 0) return { ok: true, assigned: [], failed: [] };

  // Résolu une fois pour le lot, mais plus bloquant : il ne sert qu'à créer
  // l'affaire des entreprises qui n'en ont aucune. Un lot d'entreprises qui ont
  // déjà leur affaire s'attribue même si le pipeline agent a disparu.
  const pipeline = await getAgentPipeline();
  const usable = pipeline && pipeline.stages.length > 0 ? pipeline : null;

  const results = await mapLimit(ids, 4, (id) => assignProspectToAgent(id, agentId, usable));

  const assigned: { entreprise_id: number; opportunite_id: string }[] = [];
  const failed: BatchFailure[] = [];
  results.forEach((res, i) => {
    if (res.ok) assigned.push({ entreprise_id: res.entrepriseId, opportunite_id: res.opportuniteId });
    else failed.push({ entreprise_id: ids[i], error: res.error });
  });

  return { ok: true, assigned, failed };
}

export type BatchUnassignResult = { released: number[]; failed: BatchFailure[] };

/** Retire un lot d'entreprises, même contrat que `assignProspectsToAgent`. */
export async function unassignProspectsFromAgent(
  entrepriseIds: number[],
  expectedAgentId?: string | null,
): Promise<BatchUnassignResult> {
  const ids = uniqueIds(entrepriseIds);
  const results = await mapLimit(ids, 4, (id) => unassignProspectFromAgent(id, expectedAgentId));

  const released: number[] = [];
  const failed: BatchFailure[] = [];
  results.forEach((res, i) => {
    if (res.ok) released.push(ids[i]);
    else failed.push({ entreprise_id: ids[i], error: res.error });
  });

  return { released, failed };
}
