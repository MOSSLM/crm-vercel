import { getServiceClient } from "@/app/api/_lib/service-client";
import { getAgentPipeline, type AgentStage } from "@/app/api/agent/_lib";
import { isRealDeal, pickSurvivor, type DealRecord } from "@/lib/opportunites/one-per-company";
import { collecterCanaux, sequenceSuggeree, type PublicVise } from "@/lib/prospects/canal";
import { enrollInSequence, processSequenceEnrollment } from "@/lib/automations/engine";
import type {
  Automation,
  SequenceEnrollment,
  SequenceSettings,
} from "@/components/automations/types";

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

/**
 * Ce qu'est devenue la mise en séquence de ce prospect.
 *
 * `aucune_sequence` n'est PAS une erreur : c'est une information que l'admin
 * doit voir. Une entreprise attribuée sans séquence qui lui corresponde ne
 * produira aucune tâche — autrefois elle en produisait une (l'appel à froid) et
 * personne ne remarquait qu'aucune séquence ne la couvrait.
 */
export type MiseEnSequence =
  | "inscrit"
  | "deja_inscrit"
  | "aucune_sequence"
  | "injoignable"
  | "erreur";

export type AssignResult =
  | {
      ok: true;
      entrepriseId: number;
      agentId: string;
      opportuniteId: string;
      sequence?: MiseEnSequence;
    }
  | { ok: false; error: string };

/**
 * METTRE EN SÉQUENCE — ce qui remplace la tâche « Appel à froid ».
 *
 * LA RÈGLE, MOT POUR MOT : « ceux qui ne sont pas en séquence, on ne doit pas
 * les voir dans des tâches, même pas d'appels. Dans tous les cas on met en
 * séquence pour avoir des tâches. »
 *
 * L'attribution semait jusqu'ici une tâche d'appel sans séquence, sans étape et
 * sans inscription. Elles se sont accumulées — 631 en attente au 20/08/2026,
 * dont 86 sur des entreprises DÉJÀ inscrites ailleurs, c'est-à-dire du travail
 * en double. Une tâche sans séquence ne sait rien dire : ni ce qui a été tenté,
 * ni ce qui vient après, ni quoi faire de l'issue.
 *
 * ON NE CHOISIT RIEN À LA MAIN. `sequenceSuggeree` lit le public déclaré par
 * chaque séquence (`settings.requireCanaux` / `excludeCanaux`) et le compare
 * aux canaux réels du prospect. Une séquence créée demain entre dans le choix
 * sans qu'on retouche cette fonction — et une séquence EN SERVICE l'emporte sur
 * un brouillon, sans quoi l'inscription partirait contre un mur.
 *
 * À DÉFAUT, LA SÉQUENCE D'ENTRÉE (`settings.entree`). Notre S1 n'a pas de
 * public : elle commence par une condition et aiguille elle-même vers WhatsApp,
 * l'e-mail ou l'appel. `sequenceSuggeree` ne peut donc pas la proposer — elle
 * ignore volontairement les séquences sans besoin de canal, sinon la première
 * séquence sans règle s'imposerait à tout le parc. On la DÉSIGNE, on ne la
 * devine pas.
 *
 * QUAND RIEN NE CORRESPOND, ON NE CRÉE RIEN. Pas de tâche de repli : c'est très
 * exactement ce qu'on vient de retirer. Le prospect est attribué, il apparaît
 * dans le marketing pipeline, et le compte rendu dit « aucune séquence ».
 */
async function mettreEnSequence(
  sc: ServiceClient,
  entrepriseId: number,
  opportuniteId: string,
  agentId: string,
): Promise<MiseEnSequence> {
  try {
    const [entRes, contactsRes, seqRes] = await Promise.all([
      sc.from("entreprises").select("email, telephone, telephones").eq("id", entrepriseId).maybeSingle(),
      sc.from("contacts").select("id, email, tel, is_decision_maker").eq("entreprise_id", entrepriseId),
      sc.from("automations").select("*").eq("kind", "sequence").in("status", ["on", "draft"]),
    ]);

    const ent = entRes.data as { email?: string | null; telephone?: string | null; telephones?: string[] | null } | null;
    const contacts = (contactsRes.data ?? []) as {
      id: string;
      email: string | null;
      tel: string | null;
      is_decision_maker: boolean | null;
    }[];

    const { canaux } = collecterCanaux({
      entrepriseEmail: ent?.email ?? null,
      entrepriseTelephones: [ent?.telephone ?? null, ...(ent?.telephones ?? [])],
      contacts: contacts.map((c) => ({
        email: c.email,
        tel: c.tel,
        isDecisionMaker: c.is_decision_maker,
      })),
    });
    if (canaux.size === 0) return "injoignable";

    const sequences = (seqRes.data ?? []) as Automation[];
    const choisie = sequenceSuggeree(
      canaux,
      sequences.map((a) => ({
        ...((a.settings ?? {}) as PublicVise),
        id: a.id,
        status: a.status,
      })),
    );
    // À défaut d'un public qui réclame ce prospect, la séquence d'entrée — en
    // service d'abord, brouillon ensuite. Un brouillon inscrit sans rien
    // envoyer (le moteur gare l'inscription sur `sequence_paused`), ce qui est
    // exactement ce qu'on veut tant que la séquence n'est pas relue.
    const entrees = sequences.filter((a) => (a.settings as SequenceSettings | null)?.entree === true);
    const automation =
      (choisie ? sequences.find((a) => a.id === choisie.id) : undefined) ??
      entrees.find((a) => a.status === "on") ??
      entrees[0];
    if (!automation) return "aucune_sequence";

    // Le décideur d'abord : c'est lui que le message nommera.
    const contact = contacts.find((c) => c.is_decision_maker) ?? contacts[0] ?? null;
    const { enrolled, enrollmentId } = await enrollInSequence(
      automation,
      {
        contact_id: contact?.id ?? null,
        entreprise_id: entrepriseId,
        opportunite_id: opportuniteId,
        event: "attribution",
      },
      { createdBy: agentId },
    );
    if (!enrolled) return enrollmentId ? "deja_inscrit" : "injoignable";

    // Une première étape MANUELLE est jouée tout de suite, pour que la tâche
    // existe sans attendre le tick. Un e-mail, jamais : il entre dans la file du
    // régulateur, qui décide de l'heure — sinon une attribution en lot ferait
    // partir cinquante e-mails d'un coup.
    const premiere = (automation.definition as { steps?: { kind?: string }[] } | null)?.steps?.[0];
    if (enrollmentId && premiere?.kind !== "email") {
      const { data: enr } = await sc
        .from("sequence_enrollments")
        .select("*")
        .eq("id", enrollmentId)
        .maybeSingle();
      if (enr) {
        try {
          await processSequenceEnrollment(enr as SequenceEnrollment);
        } catch {
          // le ticker reprendra : l'inscription existe, c'est l'essentiel
        }
      }
    }
    return "inscrit";
  } catch {
    return "erreur";
  }
}

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
 * MET LE PROSPECT EN SÉQUENCE pour qu'il produise des tâches — plus de tâche
 * d'appel semée à la main, cf. `mettreEnSequence`. Rejouable sans dommage : ni
 * l'affaire ni l'inscription ne sont dupliquées.
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
    .select("id, name, telephone, owner_id, qualifie")
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

  /**
   * UNE AFFAIRE IMPLIQUE UNE ENTREPRISE QUALIFIÉE. C'est l'invariant posé par le
   * propriétaire le 17/08 : « Une opportunité doit être créée que si entreprise
   * qualifiée ; à la limite, si c'est pas bon plus tard, on a qu'à archiver et
   * mettre le motif. »
   *
   * Il ne tenait pas. Cette fonction écrivait `owner_id` et créait l'affaire
   * sans jamais toucher `qualifie` — c'était même documenté comme un choix. Les
   * deux cohortes de la campagne d'août en portent la trace : 882 opportunités
   * pour 361 entreprises qualifiées, dont 501 fiches attribuées, démarchées, et
   * pourtant absentes de l'onglet « Qualifiés ». Le CRM affichait deux vérités
   * incompatibles selon l'écran ouvert.
   *
   * On le rend donc vrai par construction, du côté qui ne bloque personne :
   * attribuer QUALIFIE. C'est le sens de la seconde moitié de la consigne —
   * l'erreur se répare par un archivage motivé, pas par un refus au moment de
   * l'attribution qui obligerait l'admin à faire deux gestes pour un.
   *
   * `qualifie_at` et `qualifie_par` ne sont pas touchés ici : ils appartiennent
   * au geste de qualification manuelle, et les écraser effacerait qui a qualifié
   * quoi. La cohorte reste, elle, la marque de provenance du lot.
   */
  const majEntreprise: { owner_id: string; qualifie?: boolean } = { owner_id: agentId };
  if (!ent.qualifie) majEntreprise.qualifie = true;

  const { error: ownErr } = await sc
    .from("entreprises")
    .update(majEntreprise)
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

  const sequence = await mettreEnSequence(sc, entrepriseId, opportuniteId, agentId);

  return { ok: true, entrepriseId, agentId, opportuniteId, sequence };
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

  // Les tâches en attente sont IGNORÉES, jamais supprimées.
  //
  // Le `delete` d'origine effaçait la preuve : une tâche supprimée n'a jamais
  // existé, donc plus personne ne peut dire qu'une approche avait été prévue ni
  // pourquoi elle n'a pas eu lieu — et les compteurs du jour se retrouvent à
  // mentir dans le sens flatteur. C'est aussi ce que fait déjà le moteur quand
  // il annule le travail d'une inscription (`cancelEnrollmentWork`) : `_assign`
  // était l'exception, pas la règle.
  //
  // `pending` seulement, volontairement : une tâche `snoozed` porte une mise de
  // côté datée — un rappel calé pour la rentrée — et la toucher ici ferait
  // ressortir aujourd'hui les prospects les plus chauds du parc.
  const { error: taskErr } = await sc
    .from("prospection_tasks")
    .update({ status: "skipped" })
    .eq("entreprise_id", entrepriseId)
    .eq("status", "pending");
  if (taskErr) return { ok: false, error: taskErr.message };

  const { error: enrollErr } = await sc
    .from("sequence_enrollments")
    // « reattribution » : on retire la fiche à son agent, on ne renonce pas au
    // prospect. Le tableau la rend au stock à démarcher.
    .update({ status: "exited", next_run_at: null, exit_reason: "reattribution" })
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

/**
 * Les entreprises d'un LOT qui doivent changer de main, et combien il en reste
 * après ce paquet.
 *
 * AUCUN IDENTIFIANT NE CIRCULE. L'écran envoie un numéro de lot, la population
 * se résout ici — même convention que `/api/lissage/passes`, les plaquettes et
 * les campagnes, et pour la même raison : le geste doit rester possible en 4G
 * quelle que soit la taille du lot. Faire voyager les 249 identifiants du lot
 * « Semaine 36 — Bilal » à chaque clic marcherait encore ; un lot de deux mille
 * ne passerait plus, et on ne s'en apercevrait que le jour où il existe.
 *
 * ⚠️ LE FILTRE SUR `owner_id` N'EST PAS UNE OPTIMISATION, C'EST LE CONTRAT.
 * `assignProspectToAgent` est rejouable, mais elle réécrit `owner_id` et
 * resynchronise les affaires même quand rien ne change : un second clic sur un
 * lot de 249 ferait 249 écritures pour rien, et autant de coups de trigger.
 * Ne présenter que ce qui DIFFÈRE rend le geste idempotent de fait — et rend
 * `restant` honnête, puisqu'il tombe à zéro une fois le lot attribué. C'est
 * aussi ce qui permet à l'écran de boucler sans jamais tourner en rond.
 *
 * Trié par identifiant, comme `populationDuLot` : sans ordre explicite, deux
 * lectures du même lot pourraient prendre deux moitiés différentes et
 * « reprendre » ne voudrait plus rien dire.
 *
 * Les archivées sont écartées. Un lot est une photo figée, prise ici le 29/08 :
 * une fiche archivée depuis n'a rien à faire dans la journée d'un agent, et
 * l'écarter du compte comme de la page garde les deux d'accord.
 */
export async function entreprisesDuLotAAttribuer(
  lotId: number,
  agentId: string,
  max: number,
): Promise<{ ids: number[]; restant: number } | { error: string }> {
  const sc = getServiceClient();

  // Une seule lecture rend la page ET le total : `count: 'exact'` compte tout
  // ce qui correspond, `limit` ne borne que les lignes rendues.
  const { data, count, error } = await sc
    .from("entreprises")
    .select("id, lots_entreprises!inner(lot_id)", { count: "exact" })
    .eq("lots_entreprises.lot_id", lotId)
    .or(`owner_id.is.null,owner_id.neq.${agentId}`)
    .is("archived_at", null)
    .order("id", { ascending: true })
    .limit(max);
  if (error) return { error: error.message };

  const ids = ((data ?? []) as { id: number }[]).map((r) => Number(r.id));
  return { ids, restant: Math.max(0, (count ?? ids.length) - ids.length) };
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
