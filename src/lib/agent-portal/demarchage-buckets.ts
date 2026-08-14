/**
 * Le PLAN de démarchage — pur, sans base ni React.
 *
 * POURQUOI UN PLAN ET PLUS UN CALENDRIER
 * Une tâche manuelle portait une heure (`due_at`), et la file l'affichait telle
 * quelle : « 09:00 · WhatsApp », « 09:00 · Appel », cinquante fois de suite.
 * Personne ne passe cinquante WhatsApp à 9 h. L'heure était une fiction du
 * moteur de séquences — utile pour SAVOIR qu'une relance est due, jamais pour
 * dire QUAND la faire.
 *
 * Ce qui est réaliste, c'est une CADENCE : tant d'appels par jour, tant de
 * WhatsApp par jour. On répartit donc les tâches en attente sur les jours à
 * venir, canal par canal, à concurrence du quota quotidien — la plus ancienne
 * échéance d'abord. Ce qui dépasse le quota du jour tombe demain, et ainsi de
 * suite. Deux conséquences voulues :
 *
 *   · le nombre affiché pour un jour est le nombre RÉEL de tâches à y faire —
 *     jamais le quota lui-même. Aucun appel en attente ⇒ « 0 appel », pas
 *     « 20 appels » ;
 *   · ce qui a déjà été bouclé aujourd'hui consomme le quota du jour, sinon la
 *     journée se rechargerait à chaque tâche traitée et ne finirait jamais.
 *
 * Passé `DAY_CUTOFF_HOUR` (heure de l'agent), la journée est close : le reste
 * bascule sur demain plutôt que de rester affiché comme faisable ce soir.
 *
 * Les deux paniers de tête — signal chaud non rappelé, prospect chaud — ne sont
 * PAS soumis au quota : ce sont des occasions mesurées, pas de la cadence. Un
 * prospect qui vient de rouvrir sa démo se rappelle aujourd'hui même si les
 * vingt appels du jour sont déjà passés.
 *
 * Réutilise `dayStartIso` (`@/lib/agent-progress`) pour la frontière du jour
 * dans le fuseau de l'agent : c'est la même horloge que le compteur "X sur Y
 * aujourd'hui", donc les deux ne peuvent pas se contredire.
 */

import { AGENT_TIMEZONE, dayStartIso } from "@/lib/agent-progress";

export type DemarchageTaskLike = {
  /** Canal de la tâche — c'est lui qui porte le quota. */
  kind?: string;
  due_at: string | null;
  /** Signal d'intention mesuré (GA4). Absent = aucun site démo ou aucune visite. */
  intent?: { callWhen: string; score: number; missed?: boolean } | null;
};

export type DemarchageBucketKey = "missed" | "hot" | "today" | "tomorrow" | "week" | "later";

export type DemarchageBuckets<T> = Record<DemarchageBucketKey, T[]>;

/** L'ordre dans lequel on propose les paniers — le plus urgent d'abord. */
export const BUCKET_ORDER: readonly DemarchageBucketKey[] = [
  "missed",
  "hot",
  "today",
  "tomorrow",
  "week",
  "later",
] as const;

export const BUCKET_LABEL: Record<DemarchageBucketKey, string> = {
  missed: "Signal chaud non rappelé",
  hot: "À appeler maintenant",
  today: "Aujourd'hui",
  tomorrow: "Demain",
  week: "Cette semaine",
  later: "Plus tard",
};

/**
 * Combien de tâches manuelles de chaque canal une journée peut absorber.
 *
 * Ce sont des cadences de travail, pas des limites techniques : elles disent
 * « voilà une journée tenable », et c'est ce qui permet d'annoncer un nombre
 * honnête pour aujourd'hui au lieu de déverser toute la file.
 *
 * Un canal absent de cette table n'a pas de plafond — c'est le cas de
 * l'attente de réponse, qui ne coûte aucun effort : déclarer qu'un prospect a
 * répondu prend deux secondes, il n'y a rien à étaler.
 */
export const DAILY_QUOTA: Readonly<Record<string, number>> = {
  call: 20,
  whatsapp: 20,
  linkedin: 20,
};

/** Les canaux plafonnés, dans l'ordre où la file les présente. */
export const QUOTA_KINDS: readonly string[] = ["call", "whatsapp", "linkedin"] as const;

/** Le plafond d'un canal, ou `null` quand il n'en a pas. */
export const quotaOf = (kind: string): number | null => DAILY_QUOTA[kind] ?? null;

/**
 * Heure locale (fuseau de l'agent) à partir de laquelle la journée est close :
 * ce qui n'a pas été fait passe à demain. Personne n'appelle un artisan à
 * 22 h 30, et laisser vingt WhatsApp affichés « pour aujourd'hui » à cette
 * heure-là ne fait que fabriquer un retard qui n'en est pas un.
 */
export const DAY_CUTOFF_HOUR = 22;

/**
 * Un prospect dont les signaux mesurés réclament un appel aujourd'hui passe
 * dans son propre panier, en tête de file, QUELLE QUE SOIT l'échéance prévue
 * par sa séquence.
 *
 * C'est le cœur de l'idée : la séquence planifie le rythme normal, mais une
 * démo rouverte ce matin est une information plus fraîche que n'importe quel
 * délai décidé la semaine dernière. La tâche n'est pas dupliquée ni sortie de
 * sa séquence — elle est seulement remontée. Si l'appel ne donne rien, la
 * séquence reprend son cours là où elle en était.
 */
const isHot = (t: DemarchageTaskLike) =>
  t.intent?.callWhen === "maintenant" || t.intent?.callWhen === "aujourdhui";

const dueMs = (t: DemarchageTaskLike): number => {
  const ms = t.due_at ? new Date(t.due_at).getTime() : NaN;
  // Sans échéance, la tâche passe en queue de plan plutôt que d'être perdue.
  return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
};

/** Heures écoulées depuis minuit, dans le fuseau de l'agent. */
function localHour(now: Date, timeZone: string): number {
  const start = new Date(dayStartIso(now, timeZone)).getTime();
  return (now.getTime() - start) / 3_600_000;
}

/** Le panier d'un décalage en jours : 0 = aujourd'hui, 1 = demain, 2-6 = la semaine. */
function bucketOfDay(offset: number): DemarchageBucketKey {
  if (offset <= 0) return "today";
  if (offset === 1) return "tomorrow";
  if (offset < 7) return "week";
  return "later";
}

/**
 * L'échéance prévue par la séquence est-elle déjà passée ?
 *
 * Ce n'est plus un panier — le plan replace de toute façon la tâche en tête de
 * file —, mais ça reste une information : une relance due depuis six jours dit
 * que la cadence ne suit pas. L'attente de réponse est exclue, son `due_at`
 * n'est qu'une date de mise en pause.
 */
export function isLate(
  task: DemarchageTaskLike,
  now: Date = new Date(),
  timeZone: string = AGENT_TIMEZONE,
): boolean {
  if (task.kind === "wait") return false;
  const ms = dueMs(task);
  if (!Number.isFinite(ms)) return false;
  return ms < new Date(dayStartIso(now, timeZone)).getTime();
}

export type DemarchagePlanOptions = {
  now?: Date;
  timeZone?: string;
  /**
   * Tâches DÉJÀ bouclées aujourd'hui, par canal. Elles ont consommé le quota du
   * jour : sans elles, chaque tâche traitée libérerait une place que la
   * suivante viendrait remplir, et « aujourd'hui » afficherait éternellement 20.
   */
  doneToday?: Readonly<Record<string, number>>;
};

/**
 * Range chaque tâche dans son panier : d'abord les deux paniers de signal, puis
 * la répartition par cadence sur les jours à venir.
 *
 * L'ordre de passage à l'intérieur d'un panier est celui de l'échéance
 * croissante — la plus ancienne d'abord, sans date en dernier —, quel que soit
 * l'ordre dans lequel l'appelant fournit les tâches.
 */
export function bucketTasks<T extends DemarchageTaskLike>(
  tasks: T[],
  { now = new Date(), timeZone = AGENT_TIMEZONE, doneToday = {} }: DemarchagePlanOptions = {},
): DemarchageBuckets<T> {
  const buckets: DemarchageBuckets<T> = { missed: [], hot: [], today: [], tomorrow: [], week: [], later: [] };

  const aPlanifier: T[] = [];
  for (const task of tasks) {
    // Un signal chaud non rappelé passe AVANT les chauds du jour : c'est une
    // opportunité déjà en train de refroidir, pas une opportunité fraîche.
    if (task.intent?.missed) buckets.missed.push(task);
    else if (isHot(task)) buckets.hot.push(task);
    else aPlanifier.push(task);
  }

  aPlanifier.sort((a, b) => dueMs(a) - dueMs(b));

  const journeeClose = localHour(now, timeZone) >= DAY_CUTOFF_HOUR;

  /** Où en est le remplissage de chaque canal : jour courant et places libres. */
  const etats = new Map<string, { jour: number; libre: number }>();

  for (const task of aPlanifier) {
    const kind = task.kind ?? "";
    const quota = quotaOf(kind);

    // Canal sans plafond (l'attente de réponse) : rien à étaler.
    if (quota == null || quota <= 0) {
      buckets.today.push(task);
      continue;
    }

    let etat = etats.get(kind);
    if (!etat) {
      etat = journeeClose
        ? { jour: 1, libre: quota }
        : { jour: 0, libre: Math.max(0, quota - (doneToday[kind] ?? 0)) };
      etats.set(kind, etat);
    }
    while (etat.libre <= 0) {
      etat.jour += 1;
      etat.libre = quota;
    }
    etat.libre -= 1;
    buckets[bucketOfDay(etat.jour)].push(task);
  }

  return buckets;
}

/** Combien de tâches par canal dans une liste — ce que la file annonce pour un jour. */
export function countByKind(tasks: readonly DemarchageTaskLike[]): Record<string, number> {
  const par: Record<string, number> = {};
  for (const t of tasks) {
    const k = t.kind ?? "";
    par[k] = (par[k] ?? 0) + 1;
  }
  return par;
}

/** Le premier panier non vide, dans l'ordre où on veut le proposer par défaut. */
export function firstNonEmptyBucket<T>(buckets: DemarchageBuckets<T>): T | null {
  for (const key of BUCKET_ORDER) {
    const first = buckets[key][0];
    if (first) return first;
  }
  return null;
}

/** Le panier qui contient cette tâche — pour faire suivre l'onglet à la sélection. */
export function bucketOfTask<T extends { id: string }>(
  buckets: DemarchageBuckets<T>,
  id: string,
): DemarchageBucketKey | null {
  for (const key of BUCKET_ORDER) {
    if (buckets[key].some((t) => t.id === id)) return key;
  }
  return null;
}
