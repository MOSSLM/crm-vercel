import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { advanceEnrollmentAfterTask } from "@/lib/automations/engine";
import { advanceToContacted, resolveStageForRole, stageBelongsToDeal } from "@/app/api/agent/_lib";
import { dayStartIso } from "@/lib/agent-progress";
import { channelOf, stepOutcome as findStepOutcomeDef } from "@/lib/sales-pipeline/stages";
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

  // Étapes de séquence : un seul aller-retour pour TOUTES les automatisations
  // citées, qu'elles viennent d'une tâche ou d'une attente.
  const automationIds = [
    ...new Set(
      [
        ...tasks.map((t) => t.automation_id),
        ...waitEnrollments.map((e) => e.automation_id),
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

  const enriched = tasks.map((t) => {
    const auto = t.automation_id ? stepsByAutomation.get(t.automation_id as string) : undefined;
    const stepIndex = auto ? auto.steps.findIndex((s) => s.id === t.step_id) : -1;
    const step = stepIndex >= 0 ? auto!.steps[stepIndex] : null;
    return {
      ...t,
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
    };
  });

  const waits = waitEnrollments.map((e) => {
    const auto = stepsByAutomation.get(e.automation_id);
    const idx = Number(e.current_step) || 0;
    const step = auto?.steps[idx] ?? null;
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
      sequence: auto
        ? {
            name: auto.name,
            stepLabel: step?.label?.trim() || "En attente de réponse",
            stepIndex: idx + 1,
            totalSteps: auto.steps.length,
            steps: stepViews(auto.steps),
          }
        : null,
    };
  });

  // Une seule file : les tâches et les attentes se lisent dans le même ordre
  // d'échéance, puisque l'agent les traite dans le même mouvement.
  const queue = [...enriched, ...waits].sort((a, b) => {
    const ta = a.due_at ? new Date(a.due_at).getTime() : Infinity;
    const tb = b.due_at ? new Date(b.due_at).getTime() : Infinity;
    return ta - tb;
  });

  // "X sur Y aujourd'hui" : Y = ce qui est échu aujourd'hui ou avant ; X = les
  // tâches en séquence bouclées aujourd'hui, même périmètre strict que la file.
  const todayStart = dayStartIso();
  const tomorrowStart = new Date(new Date(todayStart).getTime() + 86_400_000).toISOString();
  const dueToday = queue.filter((t) => !!t.due_at && t.due_at < tomorrowStart).length;

  const { count: doneToday } = await sc
    .from("prospection_tasks")
    .select("id, entreprise:entreprises!inner(owner_id)", { count: "exact", head: true })
    .eq("entreprise.owner_id", user.id)
    .eq("status", "done")
    .not("enrollment_id", "is", null)
    .gte("done_at", todayStart);

  return json(
    { tasks: queue, meta: { due_today: dueToday, done_today: doneToday ?? 0 } },
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
