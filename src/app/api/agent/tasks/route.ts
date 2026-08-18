import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { advanceEnrollmentAfterTask, sortirDeSequence } from "@/lib/automations/engine";
import { advanceToContacted, resolveStageForRole, stageBelongsToDeal } from "@/app/api/agent/_lib";
import { dayStartIso } from "@/lib/agent-progress";
import { intentByEnterprise } from "@/lib/analytics-radar/site-intent";
import { daysSince, isMissedSignal } from "@/lib/analytics-radar/intent";
import { channelOf, stepOutcome as findStepOutcomeDef } from "@/lib/sales-pipeline/stages";
import { readReplies } from "@/lib/automations/week";
import { stepIsInConversation } from "@/lib/agent-portal/conversation";
import { DAILY_QUOTA, normaliseQuotas } from "@/lib/agent-portal/demarchage-buckets";
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
  payload: Record<string, unknown> | null;
  entreprise: { owner_id: string | null } | { owner_id: string | null }[] | null;
};

/** Les seuls états qu'un geste d'agent peut poser sur une tâche. */
const STATUTS_ACCEPTES = new Set(["done", "snoozed", "skipped"]);

/** Une tâche bouclée aujourd'hui — juste de quoi la classer et la compter. */
type DoneRow = {
  kind: string | null;
  step_id: string | null;
  automation_id: string | null;
  enrollment_id: string | null;
  /** L'entreprise jointe, pour savoir si c'est ELLE qu'on a abordée aujourd'hui. */
  entreprise: unknown;
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

/**
 * Les deux cohortes de la campagne d'août 2026 (`entreprises.cohorte_demarchage`).
 * A = entreprises AVEC un site faible, B = entreprises SANS site : c'est la
 * comparaison que toute la semaine sert à trancher.
 */
const COHORTES: readonly string[] = ["A_site_faible", "B_sans_site"] as const;

/**
 * La cohorte portée par l'entreprise jointe.
 *
 * L'embed postgrest rend tantôt un objet, tantôt un tableau d'un élément selon
 * la façon dont la relation est inférée : les deux formes se lisent ici, comme
 * ailleurs dans la route pour `owner_id`.
 */
/**
 * La date de PREMIÈRE TOUCHE de l'entreprise, ou `null` si personne ne l'a
 * jamais abordée.
 *
 * C'est la frontière entre les deux files du poste de travail : sans cette date,
 * la ligne est un premier contact ; avec, c'est un suivi (cf.
 * `estPremierContact`). Elle est déjà écrite par le `PATCH` de cette route pour
 * la comparaison des cohortes — l'écran lit la même colonne, il n'en déduit pas
 * une seconde vérité.
 */
const premiereToucheDe = (entreprise: unknown): string | null => {
  const e = (Array.isArray(entreprise) ? entreprise[0] : entreprise) as
    | { premiere_touche_le?: unknown }
    | null
    | undefined;
  const valeur = e?.premiere_touche_le;
  return typeof valeur === "string" && valeur ? valeur : null;
};

const cohorteDe = (entreprise: unknown): string | null => {
  const e = (Array.isArray(entreprise) ? entreprise[0] : entreprise) as
    | { cohorte_demarchage?: unknown }
    | null
    | undefined;
  const valeur = e?.cohorte_demarchage;
  return typeof valeur === "string" && valeur ? valeur : null;
};

// La file de démarchage : les tâches manuelles en attente sur les prospects de
// cet agent, EN SÉQUENCE OU NON.
//
// POURQUOI L'APPEL À FROID EST ENTRÉ DANS LA FILE
// Cette route a longtemps filtré `enrollment_id IS NOT NULL`, au nom d'une
// décision produit assumée : « cet écran ne montre que les entreprises en
// séquence ». Cette décision supposait que le démarchage COMMENCE par une
// inscription. Ce n'est plus vrai : à partir du 17 août 2026, cent entreprises
// par jour sont assignées et appelées à froid, et l'inscription en séquence ne
// vient qu'APRÈS le premier contact. Le filtre ne cachait donc plus un cas
// marginal — il cachait le mode de travail principal (65 tâches d'appel
// invisibles en production le jour où on l'a mesuré), et aucune des cent
// entreprises du jour n'aurait jamais paru dans le cockpit.
//
// Une tâche à froid n'a ni séquence, ni étape, ni réponse enregistrée : elle
// sort d'ici avec `sequence: null`, `hors_sequence: true`, et n'est JAMAIS
// « en discussion » (cf. `enDiscussion`). Elle consomme en revanche le quota du
// jour au même titre qu'une relance : c'est le même temps d'agent.
//
// `?froid=0` restitue l'ancien comportement — utile pour comparer une file à
// l'autre, ou pour une séance consacrée aux seules relances.
// `?cohorte=A_site_faible|B_sans_site` restreint la file à une cohorte de la
// campagne : sans ce filtre, les deux cohortes se mélangent et il devient
// impossible de les comparer au même âge.
//
// Les canaux automatisés (emails de séquence) sont joués centralement par le
// ticker : ils ne produisent jamais de tâche manuelle ici.
export const GET = withAuth({ role: "freelance" }, async ({ user, req, cors }) => {
  const sc = getServiceClient();

  const params = new URL(req.url).searchParams;
  // Le froid est le défaut : il faut le demander explicitement pour le perdre.
  const avecFroid = params.get("froid") !== "0";
  // Vocabulaire fermé : une valeur inconnue (faute de frappe, vieux lien) est
  // ignorée plutôt que passée à Postgres, qui rendrait une file vide sans dire
  // pourquoi. Une file trop large se voit ; une file vide se croit.
  const cohorteDemandee = params.get("cohorte");
  const cohorte = COHORTES.includes(cohorteDemandee ?? "") ? cohorteDemandee : null;

  let filesQuery = sc
    .from("prospection_tasks")
    .select(
      "id, kind, status, title, due_at, contact_id, entreprise_id, opportunite_id, payload, " +
        "enrollment_id, automation_id, step_id, " +
        "contact:contacts(id, first_name, last_name, tel, email), " +
        "entreprise:entreprises!inner(id, name, ville, telephone, owner_id, cohorte_demarchage, premiere_touche_le)",
    )
    .eq("entreprise.owner_id", user.id)
    // `snoozed` reste dans la file : c'est une tâche « pas le bon moment »
    // replanifiée (`due_at` déplacé), pas une tâche terminée. Sans elle, une
    // relance disparaîtrait de la frise au lieu de reparaître le jour choisi.
    .in("status", ["pending", "snoozed"])
    .in("kind", ["call", "whatsapp", "linkedin"]);
  if (!avecFroid) filesQuery = filesQuery.not("enrollment_id", "is", null);
  if (cohorte) filesQuery = filesQuery.eq("entreprise.cohorte_demarchage", cohorte);

  const { data, error } = await filesQuery
    .order("due_at", { ascending: true })
    // Le plafond a doublé avec l'entrée du froid : cent entreprises par jour
    // pendant dix jours, plus les relances de la cohorte précédente, dépassent
    // les 500 d'avant. L'ordre est croissant sur l'échéance, donc ce qui saute
    // au-delà de la limite est le plus lointain — le plan n'y arriverait pas de
    // la journée de toute façon.
    .limit(1000);

  if (error) return jsonError(error.message, 500, {}, cors);
  const tasks = (data ?? []) as unknown as TaskRow[];

  // ── Les attentes de réponse ────────────────────────────────────────────
  // Une étape « attente de réponse » ne crée AUCUNE tâche : le moteur gare
  // l'inscription (`hold_reason = 'awaiting_reply'`) et attend qu'un humain
  // déclare que le prospect a répondu. Sans cette requête, ces entreprises
  // seraient invisibles ici — et personne ne débloquerait la séquence.
  let attentesQuery = sc
    .from("sequence_enrollments")
    .select(
      "id, automation_id, current_step, contact_id, entreprise_id, opportunite_id, updated_at, entered_at, " +
        "contact:contacts(id, first_name, last_name, tel, email), " +
        "entreprise:entreprises!inner(id, name, ville, telephone, owner_id, cohorte_demarchage, premiere_touche_le)",
    )
    .eq("entreprise.owner_id", user.id)
    .eq("status", "active")
    .eq("hold_reason", "awaiting_reply");
  if (cohorte) attentesQuery = attentesQuery.eq("entreprise.cohorte_demarchage", cohorte);
  const { data: waitRows } = await attentesQuery.limit(200);
  const waitEnrollments = (waitRows ?? []) as unknown as WaitEnrollmentRow[];

  // ── Ce qui a été bouclé aujourd'hui ────────────────────────────────────
  // Lu ICI, et pas en fin de route, parce que le classement premier contact /
  // discussion a besoin des mêmes séquences et des mêmes inscriptions que la
  // file : un seul aller-retour pour les deux.
  //
  // Le froid compte ICI AUSSI, et sans filtre de cohorte. Ces tâches-là
  // alimentent `done_today_by_kind`, c'est-à-dire la part de cadence DÉJÀ
  // consommée aujourd'hui : vingt appels à froid passés ce matin occupent
  // vingt places de la journée, qu'ils viennent d'une séquence ou non, et que
  // l'écran regarde la cohorte A ou l'ensemble. Les oublier rouvrirait une
  // journée déjà pleine.
  const todayStart = dayStartIso();
  let doneQuery = sc
    .from("prospection_tasks")
    .select(
      "kind, step_id, automation_id, enrollment_id, " +
        "entreprise:entreprises!inner(owner_id, premiere_touche_le)",
    )
    .eq("entreprise.owner_id", user.id)
    .eq("status", "done")
    .gte("done_at", todayStart);
  if (!avecFroid) doneQuery = doneQuery.not("enrollment_id", "is", null);
  const { data: doneRows } = await doneQuery.limit(1000);
  const done = (doneRows ?? []) as unknown as DoneRow[];

  // ── La cadence de CET agent ────────────────────────────────────────────
  // `quotas_demarchage` est un jsonb libre, souvent null : `normaliseQuotas`
  // le ramène à une cadence utilisable, ou rend `null` s'il n'y a rien
  // d'exploitable — un réglage fautif coûte le défaut, jamais une file vide.
  // Une lecture qui échoue (colonne absente, table pas encore migrée) tombe
  // dans le même repli : la file du jour ne dépend pas de ce réglage.
  const { data: settingsRow } = await sc
    .from("agent_settings")
    .select("quotas_demarchage")
    .eq("agent_id", user.id)
    .maybeSingle();
  const reglage = (settingsRow as { quotas_demarchage?: unknown } | null)?.quotas_demarchage;
  const quotas = normaliseQuotas(reglage) ?? DAILY_QUOTA;

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
    // Une tâche à froid n'a pas d'inscription : ni séquence, ni étape, ni
    // réponse enregistrée. Elle ne peut donc pas être une discussion — et il
    // faut le dire ici, sinon elle échapperait au quota du jour (les canaux
    // écrits en discussion n'ont pas de plafond) et la cadence ne voudrait
    // plus rien dire dès la première journée d'appels à froid.
    if (!row.enrollment_id) return false;
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
      // Un appel à froid : rien à afficher comme frise, et une carte d'action
      // qui doit dire « premier contact » plutôt que d'inventer une étape.
      hors_sequence: t.enrollment_id == null,
      cohorte: cohorteDe(t.entreprise),
      premiere_touche_le: premiereToucheDe(t.entreprise),
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
      // Une attente naît d'une inscription : elle est, par construction, dans
      // une séquence.
      hors_sequence: false,
      cohorte: cohorteDe(e.entreprise),
      premiere_touche_le: premiereToucheDe(e.entreprise),
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

  // ── Le décompte de la journée ──────────────────────────────────────────
  //
  // `done_today_by_kind` est l'AVANCEMENT DE L'OBJECTIF : combien d'entreprises
  // ont été abordées pour la première fois aujourd'hui, canal par canal. C'est
  // le « 12 / 20 » de la file des premiers contacts, et c'est la seule lecture
  // qui corresponde à ce que cette file contient.
  //
  // Il comptait auparavant tout ce qui n'était pas une discussion — donc les
  // relances silencieuses avec. Le chiffre était juste pour l'ancienne cadence
  // (qui plafonnait le volume sortant, relances comprises) et faux pour
  // l'objectif d'aujourd'hui : trois relances J+3 bouclées le matin
  // affichaient « 3 premiers contacts » sans qu'aucune entreprise nouvelle
  // n'ait été abordée.
  //
  // La distinction se lit sur `premiere_touche_le`, posé par le PATCH au tout
  // premier geste : une entreprise dont la première touche date d'aujourd'hui
  // est une entreprise abordée aujourd'hui. Une relance sur une fiche touchée
  // la semaine dernière ne compte donc dans aucun objectif — et c'est voulu :
  // les relances n'en ont pas.
  const doneByKind: Record<string, number> = {};
  let doneConversation = 0;
  for (const row of done) {
    if (enDiscussion(row)) {
      doneConversation += 1;
      continue;
    }
    const touche = premiereToucheDe(row.entreprise);
    if (!touche || touche < todayStart) continue;
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
        // La cadence EFFECTIVE — défaut compris. L'écran planifie la journée
        // avec exactement ces chiffres : s'il retombait sur sa propre
        // constante, il afficherait « 20 » quand le serveur en autorise 40, et
        // la moitié de la journée disparaîtrait de la file.
        quotas,
        // Ce que la file a réellement montré, pour que l'écran puisse le dire
        // au lieu de le supposer.
        cohorte,
        froid: avecFroid,
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
  // Vocabulaire fermé : `status` arrive du navigateur et finit tel quel dans la
  // colonne. Une valeur inventée sortirait la tâche de la file sans qu'aucun
  // écran ne sache plus la retrouver.
  if (!STATUTS_ACCEPTES.has(status)) return jsonError("statut_inconnu", 400, {}, cors);

  const sc = getServiceClient();

  // Ownership guard: the task must be assigned to this agent or sit on one of
  // his companies.
  const { data: taskRaw, error: taskErr } = await sc
    .from("prospection_tasks")
    .select(
      "id, kind, contact_id, entreprise_id, opportunite_id, step_id, enrollment_id, assignee_id, payload, " +
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

  // Lus AVANT l'écriture : la note voyage dans la mise de côté (c'est le motif
  // qu'on relira au retour) et l'issue décide du sort de la séquence.
  const note = typeof body.note === "string" ? body.note.trim() : "";
  const stepOutcomeId = typeof body.step_outcome === "string" ? body.step_outcome : undefined;
  const outcomeDef = stepOutcomeId ? findStepOutcomeDef(stepOutcomeId) : null;

  const snoozeUntil = body.snooze_until as string | undefined;
  const patch: Record<string, unknown> = { status };
  if (status === "done") patch.done_at = new Date().toISOString();
  // MISE DE CÔTÉ : la tâche est réellement replanifiée — sans ça, `due_at` ne
  // bouge pas et la tâche resterait affichée comme échue en boucle.
  //
  // Le motif part dans le payload et pas seulement dans l'historique : quand la
  // fiche ressort trois semaines plus tard, « il est en congés jusqu'au 8 » doit
  // être sur la carte, pas à retrouver en déroulant les échanges.
  if (status === "snoozed" && snoozeUntil) {
    patch.due_at = snoozeUntil;
    patch.payload = {
      ...(task.payload ?? {}),
      mise_de_cote: {
        jusquau: snoozeUntil,
        motif: note || null,
        le: new Date().toISOString(),
      },
    };
  }
  const { data, error } = await sc
    .from("prospection_tasks")
    .update(patch)
    .eq("id", id)
    .select("id, status")
    .maybeSingle();

  if (error) return jsonError(error.message, 500, {}, cors);
  if (!data) return jsonError("introuvable", 404, {}, cors);

  // ── La première touche, posée une seule fois ───────────────────────────
  //
  // `premiere_touche_le` est le socle de la comparaison des deux cohortes : on
  // ne les compare pas à la même DATE, on les compare au même ÂGE (J+1, J+3,
  // J+7, J+14 après le premier contact). La cohorte A est démarchée du 17 au
  // 19, la B du 20 au 22 : sans cet horodatage, le 24 août on mettrait cinq
  // jours de relances de A en face d'un seul de B et on conclurait n'importe
  // quoi.
  //
  // `.is(..., null)` fait tout le travail : la toute première tâche bouclée
  // pose la date, les suivantes ne la déplacent pas — sinon la « première »
  // touche serait en réalité la dernière, et l'âge de chaque entreprise
  // resterait éternellement à zéro.
  //
  // Best-effort assumé : rien de ce qui suit ne doit faire échouer un « Fait ».
  // L'agent a passé l'appel ; refuser d'enregistrer son travail parce qu'une
  // colonne de mesure résiste serait le pire échange possible.
  if (status === "done" && task.entreprise_id != null) {
    try {
      await sc
        .from("entreprises")
        .update({ premiere_touche_le: new Date().toISOString() })
        .eq("id", task.entreprise_id)
        .is("premiere_touche_le", null);
    } catch {
      // la mesure est perdue pour cette entreprise, la tâche reste faite
    }
  }

  // ── Ce que devient la séquence ─────────────────────────────────────────
  //
  // Deux sorties, et c'est toute la distinction qui compte :
  //
  //   · une issue qui ARRÊTE (`flow: 'stop'` — « pas intéressé », « bloqué »)
  //     ferme l'inscription et annule ce qui était encore en vol. Cette
  //     branche-là manquait : la tâche se fermait avec son issue, puis
  //     `advanceEnrollmentAfterTask` planifiait tranquillement l'étape
  //     suivante. Un prospect qui venait de dire non recevait donc la relance
  //     J+3, puis la J+7 — alors même que l'issue affichait « plus rien ne
  //     part » sous le bouton ;
  //   · tout le reste enchaîne l'étape suivante, comme avant.
  //
  // Une tâche annulée (`skipped`) ne fait jamais avancer quoi que ce soit : le
  // geste n'a pas eu lieu. Elle peut en revanche arrêter, et c'est exactement
  // ce que fait « pas sur WhatsApp ».
  if (task.enrollment_id && status !== "snoozed") {
    try {
      if (outcomeDef?.flow === "stop") await sortirDeSequence(sc, task.enrollment_id as string);
      else if (status === "done") await advanceEnrollmentAfterTask(task.enrollment_id as string);
    } catch {
      // la séquence reste en pause ; l'admin peut la reprendre depuis Démarchage
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
  if (note) {
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
