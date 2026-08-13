/**
 * Découpage de la file de démarchage en jours — pur, sans base ni React.
 *
 * Réutilise `dayStartIso` (`@/lib/agent-progress`) pour la frontière du jour
 * dans le fuseau de l'agent : c'est la même horloge que le compteur "X sur Y
 * aujourd'hui", donc les deux ne peuvent pas se contredire.
 */

import { AGENT_TIMEZONE, dayStartIso } from "@/lib/agent-progress";

export type DemarchageTaskLike = {
  due_at: string | null;
  /** Signal d'intention mesuré (GA4). Absent = aucun site démo ou aucune visite. */
  intent?: { callWhen: string; score: number; missed?: boolean } | null;
};

export type DemarchageBucketKey = "missed" | "hot" | "overdue" | "today" | "tomorrow" | "week" | "later";

export type DemarchageBuckets<T> = Record<DemarchageBucketKey, T[]>;

export const BUCKET_LABEL: Record<DemarchageBucketKey, string> = {
  missed: "Signal chaud non rappelé",
  hot: "À appeler maintenant",
  overdue: "En retard",
  today: "Aujourd'hui",
  tomorrow: "Demain",
  week: "Cette semaine",
  later: "Plus tard",
};

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

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Range chaque tâche dans le bon panier, par échéance (`due_at`) croissante à
 * l'intérieur d'un panier — l'appelant doit donc trier `tasks` par `due_at`
 * avant d'appeler cette fonction si l'ordre importe (c'est déjà le cas de la
 * réponse de `/api/agent/tasks`, triée en base).
 */
export function bucketTasks<T extends DemarchageTaskLike>(
  tasks: T[],
  now: Date = new Date(),
  timeZone: string = AGENT_TIMEZONE,
): DemarchageBuckets<T> {
  const todayStart = new Date(dayStartIso(now, timeZone)).getTime();
  const tomorrowStart = todayStart + DAY_MS;
  const dayAfterTomorrowStart = tomorrowStart + DAY_MS;
  const weekEnd = todayStart + 7 * DAY_MS;

  const buckets: DemarchageBuckets<T> = { missed: [], hot: [], overdue: [], today: [], tomorrow: [], week: [], later: [] };

  for (const task of tasks) {
    // Un signal chaud non rappelé passe AVANT les chauds du jour : c'est une
    // opportunité déjà en train de refroidir, pas une opportunité fraîche.
    if (task.intent?.missed) {
      buckets.missed.push(task);
      continue;
    }
    if (isHot(task)) {
      buckets.hot.push(task);
      continue;
    }
    const dueMs = task.due_at ? new Date(task.due_at).getTime() : NaN;
    if (!Number.isFinite(dueMs)) {
      buckets.later.push(task);
      continue;
    }
    if (dueMs < todayStart) buckets.overdue.push(task);
    else if (dueMs < tomorrowStart) buckets.today.push(task);
    else if (dueMs < dayAfterTomorrowStart) buckets.tomorrow.push(task);
    else if (dueMs < weekEnd) buckets.week.push(task);
    else buckets.later.push(task);
  }

  return buckets;
}

/** Le premier panier non vide, dans l'ordre où on veut le proposer par défaut. */
export function firstNonEmptyBucket<T>(buckets: DemarchageBuckets<T>): T | null {
  for (const key of ["missed", "hot", "overdue", "today", "tomorrow", "week", "later"] as DemarchageBucketKey[]) {
    const first = buckets[key][0];
    if (first) return first;
  }
  return null;
}
