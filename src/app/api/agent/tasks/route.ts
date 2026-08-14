import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { advanceEnrollmentAfterTask } from "@/lib/automations/engine";
import { advanceToContacted, resolveStageForRole, stageBelongsToDeal } from "@/app/api/agent/_lib";
import { dayStartIso } from "@/lib/agent-progress";
import { intentByEnterprise } from "@/lib/analytics-radar/site-intent";
import { daysSince, isMissedSignal } from "@/lib/analytics-radar/intent";
import { channelOf, stepOutcome as findStepOutcomeDef } from "@/lib/sales-pipeline/stages";
import { readReplies } from "@/lib/automations/week";
import { stepIsInConversation } from "@/lib/agent-portal/conversation";
import type { SequenceDefinition, SequenceStep } from "@/components/automations/types";
import type { StageRole } from "@/lib/opportunites/stage-roles";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

type AutomationDefRow = { id: string; name: string | null; definition: SequenceDefinition | null };

function summarizeSteps(def: SequenceDefinition | null): SequenceStep[] {
  return Array.isArray(def?.steps) ? (def!.steps as SequenceStep[]) : [];
}

// La chaîne `.select(...)` ci-dessous mêle des colonnes plates et deux embeds
// (`contact`, `entreprise`) : au-delà d'une certaine longueur, le parseur de
// types de postgrest-js abandonne et retombe sur `GenericStringError` plutôt
// que d'inférer la forme réelle. On décrit donc la ligne à la main et on
// caste — même remède déjà appliqué dans `agent/sequences/route.ts`.
type TaskRow = {
  id: string;
  kind: "call" | "whatsapp" | "linkedin" | "email";
  status: "pending" | "done" | "skipped" | "snoozed";
  title: string | null;
  due_at: string | null;
  contact_id: string | null;
  entreprise_id: number | null;
  opportunite_id: string | null;
  payload: Record<string, unknown>;
  enrollment_id: string | null;
  automation_id: string | null;
  step_id: string | null;
  contact: unknown;
  entreprise: unknown;
};

type TaskGuardRow = {
  id: string;
  kind: string;
  contact_id: string | null;
  entreprise_id: number | null;
  opportunite_id: string | null;
  step_id: string | null;
  enrollment_id: string | null;
  assignee_id: string | null;
  entreprise: { owner_id: string | null } | { owner_id: string | null }[] | null;
};

/** Une tâche bouclée aujourd'hui — juste de quoi la classer et la compter. */
type DoneRow = {
  kind: string | null;
  step_id: string | null;
  automation_id: string | null;
  enrollment_id: string | null;
};

/** Ligne d'inscription garée sur une attente-réponse. */
type WaitEnrollmentRow = {
  id: string;
  automation_id: string;
  current_step: number;
  contact_id: string | null;
  entreprise_id: number | null;
  opportunite_id: string | null;
  updated_at: string | null;
  entered_at: string | null;
  contact: unknown;
  entreprise: unknown;
};

/** L'étape d'une séquence, telle que la frise l'affiche. */
type StepView = { kind: string; day: number; label: string };

const stepViews = (steps: SequenceStep[]): StepView[] =>
  steps.map((s) => ({
    kind: s.kind,
    day: Number(s.day) || 0,
    label: s.label?.trim() || channelOf(s.kind).label,
  }));

// Démarchage queue: the pending manual tasks for the prospects this agent
// owns, STRICTLY scoped to prospects actually enrolled on a sequence
// (`enrollment_id IS NOT NULL`) — cold-call tasks seeded without a sequence
// (fresh assignment, ad-hoc workflow actions) are deliberately excluded, per
// product decision: this page only shows "entreprises en séquence".
// Automated channels (sequence emails) are run centrally by the ticker, so
// they never produce a manual task here.
export const GET = withAuth({ role: "freelance" }, async ({ user, cors }) => {
  const sc = getServiceClient();

  const { data, error } = await sc
    .from("prospection_tasks")
    .select(
      "id, kind, status, title, due_at, contact_id, entreprise_id, opportunite_id, payload, " +
        "enrollment_id, automation_id, step_id, " +
        "contact:contacts(id, first_name, last_name, tel, email), " +
        "entreprise:entreprises!inner(id, name, ville, telephone, owner_id)",
    )
    .eq("entreprise.owner_id", user.id)
    // `snoozed` reste dans la file : c'est une tâche « pas le bon moment »
    // replanifiée (`due_at` déplacé), pas une tâche terminée. Sans elle, une
    // relance disparaîtrait de la frise au lieu de reparaître le jour choisi.
    .in("status", ["pending", "snoozed"])
    .in("kind", ["call", "whatsapp", "linkedin"])
    .not("enrollment_id", "is", null)
    .order("due_at", { ascending: true })
    .limit(500);

  if (error) return jsonError(error.message, 500, {}, cors);
  const tasks = (data ?? []) as unknown as TaskRow[];

  // ── Les attentes de réponse ────────────────────────────────────────────
  // Une étape « attente de réponse » ne crée AUCUNE tâche : le moteur gare
  // l'inscription (`hold_reason = 'awaiting_reply'`) et attend qu'un humain
  // déclare que le prospect a répondu. Sans cette requête, ces entreprises
  // seraient invisibles ici — et personne ne débloquerait la séquence.
  const { data: waitRows } = await sc
    .from("sequence_enrollments")
    .select(
      "id, automation_id, current_step, contact_id, entreprise_id, opportunite_id, updated_at, entered_at, " +
        "contact:contacts(id, first_name, last_name, tel, email), " +
        "entreprise:entreprises!inner(id, name, ville, telephone, owner_id)",
    )
    .eq("entreprise.owner_id", user.id)
    .eq("status", "active")
    .eq("hold_reason", "awaiting_reply")
    .limit(200);
  const waitEnrollments = (waitRows ?? []) as unknown as WaitEnrollmentRow[];

  // ── Ce qui a été bouclé aujourd'hui ────────────────────────────────────
  // Lu ICI, et pas en fin de route, parce que le classement premier contact /
  // discussion a besoin des mêmes séquences et des mêmes inscriptions que la
  // file : un seul aller-retour pour les deux.
  const todayStart = dayStartIso();
  const { data: doneRows } = await sc
    .from("prospection_tasks")
    .select("kind, step_id, automation_id, enrollment_id, entreprise:entreprises!inner(owner_id)")
    .eq("entreprise.owner_id", user.id)
    .eq("status", "done")
    .not("enrollment_id", "is", null)
    .gte("done_at", todayStart)
    .limit(1000);
  const done = (doneRows ?? []) as unknown as DoneRow[];

  // Étapes de séquence : un seul aller-retour pour TOUTES les automatisations
  // citées, qu'elles viennent d'une tâche, d'une attente ou d'une tâche bouclée
  // aujourd'hui.
  const automationIds = [
    ...new Set(
      [
        ...tasks.map((t) => t.automation_id),
        ...waitEnrollments.map((e) => e.automation_id),
        ...done.map((d) => d.automation_id),
      ].filter((id): id is string => !!id),
    ),
  ];
  const stepsByAutomation = new Map<string, { name: string | null; steps: SequenceStep[] }>();
  if (automationIds.length > 0) {
    const { data: autos } = await sc
      .from("automations")
      .select("id, name, definition")
      .in("id", automationIds);
    for (const a of (autos ?? []) as AutomationDefRow[]) {
      stepsByAutomation.set(a.id, { name: a.name, steps: summarizeSteps(a.definition) });
    }
  }

  // Ce que le prospect a réellement fait de sa démo (GA4), greffé sur sa
  // tâche. Même moteur que le radar — un prospect ne peut pas être « chaud »
  // ici et « tiède » là-bas. Une panne GA4 ne doit pas vider la file : on
  // repart sans signal plutôt que d'échouer.
  const intents = await intentByEnterprise(sc).catch(() => new Map());

  // Dernier appel RÉELLEMENT passé par entreprise : c'est ce qui permet de
  // distinguer un prospect chaud d'un prospect chaud qu'on a laissé filer.
  const entrepriseIds = [...new Set(tasks.map((t) => t.entreprise_id).filter((id): id is number => id != null))];
  const lastCallByEnterprise = new Map<number, string>();
  if (entrepriseIds.length) {
    const { data: calls } = await sc
      .from("prospection_tasks")
      .select("entreprise_id, done_at")
      .eq("kind", "call")
      .eq("status", "done")
      .in("entreprise_id", entrepriseIds)
      .order("done_at", { ascending: false });
    (calls ?? []).forEach((c) => {
      const id = c.entreprise_id as number | null;
      const at = c.done_at as string | null;
      if (id == null || !at) return;
      if (!lastCallByEnterprise.has(id)) lastCallByEnterprise.set(id, at); // trié desc → le premier est le plus récent
    });
  }
  // ── Premier contact, ou message dans une discussion ouverte ? ──────────
  //
  // C'est la frontière que la cadence quotidienne plafonne : vingt entreprises
  // ABORDÉES par jour. Les échanges avec celles qui ont répondu n'en font pas
  // partie — sans quoi l'étape déclenchée par une réponse (typiquement l'envoi
  // du site démo) est repoussée au lendemain dès que les vingt places du jour
  // sont prises, c'est-à-dire précisément quand la journée s'est bien passée.
  //
  // Le classement se fait sur la POSITION de l'étape dans sa séquence, pas sur
  // l'état de l'inscription à l'instant T (cf. `stepIsInConversation`) : un
  // premier contact envoyé ce matin doit rester un premier contact même si le
  // prospect répond cet après-midi, sinon la journée se rouvre toute seule.
  const enrollmentIds = [
    ...new Set(
      [...tasks.map((t) => t.enrollment_id), ...done.map((d) => d.enrollment_id)].filter(
        (id): id is string => !!id,
      ),
    ),
  ];
  const repliesByEnrollment = new Map<string, Record<string, string>>();
  if (enrollmentIds.length) {
    const { data: enrolls } = await sc
      .from("sequence_enrollments")
      .select("id, vars")
      .in("id", enrollmentIds);
    for (const e of (enrolls ?? []) as { id: string; vars: unknown }[]) {
      repliesByEnrollment.set(e.id, readReplies(e.vars));
    }
  }

  /** Cette tâche (en file ou déjà bouclée) est-elle un message de discussion ? */
  const enDiscussion = (row: {
    automation_id: string | null;
    step_id: string | null;
    enrollment_id: string | null;
  }): boolean => {
    const auto = row.automation_id ? stepsByAutomation.get(row.automation_id) : undefined;
    if (!auto) return false;
    const idx = auto.steps.findIndex((s) => s.id === row.step_id);
    const replies = row.enrollment_id ? repliesByEnrollment.get(row.enrollment_id) ?? {} : {};
    return stepIsInConversation(auto.steps, idx, replies);
  };

  const nowDate = new Date();

  const enriched = tasks.map((t) => {
    const auto = t.automation_id ? stepsByAutomation.get(t.automation_id as string) : undefined;
    const stepIndex = auto ? auto.steps.findIndex((s) => s.id === t.step_id) : -1;
    const step = stepIndex >= 0 ? auto!.steps[stepIndex] : null;
    const intent = t.entreprise_id != null ? intents.get(t.entreprise_id) : undefined;
    return {
      ...t,
      in_conversation: enDiscussion(t),
      sequence: auto
        ? {
            name: auto.name,
            stepLabel: step?.label?.trim() || channelOf(t.kind).label,
            stepIndex: stepIndex >= 0 ? stepIndex + 1 : null,
            totalSteps: auto.steps.length,
            // La frise d'étapes de l'écran a besoin de TOUTES les étapes, pas
            // seulement de celle en cours : c'est ce qui permet de montrer le
            // chemin parcouru et ce qui reste.
            steps: stepViews(auto.steps),
          }
        : null,
      intent: intent
        ? {
            score: intent.score,
            tier: intent.tier,
            flame: intent.flame,
            callWhen: intent.callWhen,
            reasons: intent.reasons,
            sessions: intent.sessions,
            pageViews: intent.pageViews,
            engagementSec: intent.engagementSec,
            lastDay: intent.lastDay,
            missed: isMissedSignal({
              callWhen: intent.callWhen,
              lastVisitDay: intent.lastDay,
              lastCallDoneAt: t.entreprise_id != null ? lastCallByEnterprise.get(t.entreprise_id) ?? null : null,
              now: nowDate,
            }),
            daysSinceVisit: daysSince(intent.lastDay, nowDate),
          }
        : null,
    };
  });

  const waits = waitEnrollments.map((e) => {
    const auto = stepsByAutomation.get(e.automation_id);
    const idx = Number(e.current_step) || 0;
    const step = auto?.steps[idx] ?? null;
    const intent = e.entreprise_id != null ? intents.get(e.entreprise_id) : undefined;
    return {
      // Préfixé pour ne jamais entrer en collision avec un id de tâche : les
      // deux vivent dans la même file côté écran.
      id: `wait:${e.id}`,
      kind: "wait" as const,
      status: "pending" as const,
      title: step?.label?.trim() ?? "En attente de réponse",
      due_at: e.updated_at ?? e.entered_at,
      contact_id: e.contact_id,
      entreprise_id: e.entreprise_id,
      opportunite_id: e.opportunite_id,
      automation_id: e.automation_id,
      enrollment_id: e.id,
      step_id: step?.id ?? null,
      payload: {},
      contact: e.contact,
      entreprise: e.entreprise,
      // Une attente n'est jamais « en discussion » : par définition, personne
      // n'a encore répondu à CETTE étape — il n'y a rien à traiter, seulement à
      // patienter.
      in_conversation: false,
      sequence: auto
        ? {
            name: auto.name,
            stepLabel: step?.label?.trim() || "En attente de réponse",
            stepIndex: idx + 1,
            totalSteps: auto.steps.length,
            steps: stepViews(auto.steps),
          }
        : null,
      // Une attente de réponse mérite l'intention plus que n'importe quelle
      // autre ligne : « il visite la démo mais ne répond pas » est exactement
      // le moment où il faut décrocher plutôt que de continuer à écrire.
      intent: intent
        ? {
            score: intent.score,
            tier: intent.tier,
            flame: intent.flame,
            callWhen: intent.callWhen,
            reasons: intent.reasons,
            sessions: intent.sessions,
            pageViews: intent.pageViews,
            engagementSec: intent.engagementSec,
            lastDay: intent.lastDay,
            missed: isMissedSignal({
              callWhen: intent.callWhen,
              lastVisitDay: intent.lastDay,
              lastCallDoneAt: e.entreprise_id != null ? lastCallByEnterprise.get(e.entreprise_id) ?? null : null,
              now: nowDate,
            }),
            daysSinceVisit: daysSince(intent.lastDay, nowDate),
          }
        : null,
    };
  });

  // Une seule file : tâches et attentes se lisent dans le même mouvement.
  // Les plus chauds d'abord — un prospect qui vient de rouvrir sa démo passe
  // devant une relance planifiée, sans sortir de sa séquence pour autant :
  // l'ordre change, pas le parcours. À intensité égale, on retombe sur
  // l'échéance, qui reste l'ordre naturel de traitement.
  const queue = [...enriched, ...waits].sort((a, b) => {
    const sa = a.intent?.score ?? -1;
    const sb = b.intent?.score ?? -1;
    if (sa !== sb) return sb - sa;
    const ta = a.due_at ? new Date(a.due_at).getTime() : Infinity;
    const tb = b.due_at ? new Date(b.due_at).getTime() : Infinity;
    return ta - tb;
  });

  // Le décompte de la journée, séparé en deux — c'est toute la nuance.
  //
  // `done_today_by_kind` ne compte QUE les premiers contacts : c'est lui qui
  // consomme la cadence, et qui fait avancer le compteur « 3/20 ». Un message
  // de discussion bouclé aujourd'hui n'y entre pas, sinon répondre à trois
  // prospects amputerait de trois le démarchage du jour.
  const doneByKind: Record<string, number> = {};
  let doneConversation = 0;
  for (const row of done) {
    if (enDiscussion(row)) {
      doneConversation += 1;
      continue;
    }
    const k = row.kind ?? "";
    doneByKind[k] = (doneByKind[k] ?? 0) + 1;
  }

  return json(
    {
      tasks: queue,
      meta: {
        done_today: done.length,
        done_today_by_kind: doneByKind,
        done_today_conversation: doneConversation,
      },
    },
    { headers: cors },
  );
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
  const { data: taskRaw, error: taskErr } = await sc
    .from("prospection_tasks")
    .select(
      "id, kind, contact_id, entreprise_id, opportunite_id, step_id, enrollment_id, assignee_id, " +
        "entreprise:entreprises(owner_id)",
    )
    .eq("id", id)
    .maybeSingle();
  if (taskErr) return jsonError(taskErr.message, 500, {}, cors);
  const task = taskRaw as unknown as TaskGuardRow | null;
  const ownerId = (Array.isArray(task?.entreprise) ? task?.entreprise[0] : task?.entreprise)?.owner_id as
    | string
    | null
    | undefined;
  if (!task || (task.assignee_id !== user.id && ownerId !== user.id)) {
    return jsonError("introuvable", 404, {}, cors);
  }

  const snoozeUntil = body.snooze_until as string | undefined;
  const patch: Record<string, unknown> = { status };
  if (status === "done") patch.done_at = new Date().toISOString();
  // "Pas le bon moment" replanifie réellement la tâche — sans ça, `due_at`
  // ne bouge pas et la tâche resterait affichée comme échue en boucle.
  if (status === "snoozed" && snoozeUntil) patch.due_at = snoozeUntil;
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

  const opportuniteId = (body.opportunite_id as string | undefined) ?? null;
  const stageId = body.stage_id;
  // `outcome` exprime une INTENTION (« RDV calé », « pas intéressé »…) et laisse
  // le serveur trouver l'étape correspondante DANS le pipeline de l'affaire.
  // L'ancien contrat — un `stage_id` deviné côté client à partir des libellés
  // d'« Agent SAMA » — aspirait toute affaire d'un autre pipeline vers Agent
  // SAMA au premier clic, via `trg_sync_opportunity_pipeline_from_stage`.
  const outcome = body.outcome as StageRole | undefined;

  if (opportuniteId && outcome) {
    const target = await resolveStageForRole(sc, opportuniteId, outcome);
    if (target) {
      await sc
        .from("opportunites")
        .update({ stage_id: target.id, updated_at: new Date().toISOString() })
        .eq("id", opportuniteId)
        .eq("owner_id", user.id);
    }
  } else if (opportuniteId && stageId != null && Number.isFinite(Number(stageId))) {
    // Chemin explicite conservé, mais l'étape doit appartenir au pipeline de
    // l'affaire : on ne déplace jamais une affaire de pipeline par ce biais.
    if (!(await stageBelongsToDeal(sc, opportuniteId, Number(stageId)))) {
      return jsonError("etape_hors_pipeline", 400, {}, cors);
    }
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

  // Une note d'issue (vocabulaire STEP_OUTCOMES du pipeline commercial) se
  // journalise dans `email_logs` comme `channel:'note'` — c'est exactement ce
  // que `AgentExchangeHistory` sait déjà afficher, sans rien y changer.
  const note = typeof body.note === "string" ? body.note.trim() : "";
  const stepOutcomeId = typeof body.step_outcome === "string" ? body.step_outcome : undefined;
  if (note) {
    const outcomeDef = stepOutcomeId ? findStepOutcomeDef(stepOutcomeId) : null;
    try {
      await sc.from("email_logs").insert({
        channel: "note",
        contact_id: task.contact_id ?? null,
        entreprise_id: task.entreprise_id ?? null,
        opportunite_id: task.opportunite_id ?? opportuniteId ?? null,
        step_id: task.step_id ?? null,
        outcome: stepOutcomeId ?? null,
        to_email: "",
        subject: outcomeDef?.label ?? "Note",
        body_text: note,
        status: "sent",
      });
    } catch {
      // best effort : l'issue est déjà enregistrée sur la tâche, la note est un bonus
    }
  }

  return json(data, { headers: cors });
});
