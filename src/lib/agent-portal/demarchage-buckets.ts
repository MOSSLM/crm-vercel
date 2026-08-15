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
 * DES JOURS, RIEN QUE DES JOURS
 * Le plan ne rend QUE des journées datées. Les trois signaux — chaud non
 * rappelé, discussion ouverte, prospect chaud — ne sont plus des onglets à côté
 * des jours : ils vivaient là par accident d'implémentation, et la barre
 * d'onglets se retrouvait avec sept entrées de six pixels où on ne lisait plus
 * que la première lettre. Ce sont désormais des ATTRIBUTS (`signalOf`) posés sur
 * la tâche, qui la font remonter en tête d'AUJOURD'HUI et qui alimentent les
 * filtres. Un signal chaud est une chose à faire aujourd'hui : sa place est dans
 * la journée, pas dans un onglet parallèle.
 *
 * Ces trois signaux échappent en revanche au quota : ce sont des occasions
 * mesurées, pas de la cadence. Un prospect qui vient de rouvrir sa démo se
 * rappelle aujourd'hui même si les vingt appels du jour sont déjà passés.
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
  /**
   * L'inscription de ce prospect a DÉJÀ enregistré une réponse : la discussion
   * est ouverte. Posé par `/api/agent/tasks` d'après `vars.replies`.
   */
  in_conversation?: boolean;
  /** Signal d'intention mesuré (GA4). Absent = aucun site démo ou aucune visite. */
  intent?: { callWhen: string; score: number; missed?: boolean } | null;
};

/**
 * Ce qui sort une tâche de la cadence et la remonte en tête de journée.
 * `null` = tâche ordinaire, planifiée au quota.
 */
export type DemarchageSignal = "missed" | "conversation" | "hot";

/** L'ordre de priorité des signaux — c'est aussi l'ordre d'affichage. */
export const SIGNAL_ORDER: readonly DemarchageSignal[] = ["missed", "conversation", "hot"] as const;

export const SIGNAL_LABEL: Record<DemarchageSignal, string> = {
  missed: "Non rappelés",
  conversation: "En discussion",
  hot: "Chauds",
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

/**
 * Les canaux dont une discussion ouverte échappe au quota.
 *
 * LE QUOTA PORTE SUR LES PREMIERS CONTACTS, PAS SUR LES ÉCHANGES
 * Vingt WhatsApp par jour, c'est vingt entreprises qu'on démarche. Ce n'est pas
 * vingt messages : chacune de ces vingt-là peut répondre, et il faut pouvoir
 * lui répondre dans la foulée — comme à celles d'hier et d'avant-hier. Sans
 * cette exception, l'étape « envoie-lui le site démo », déclenchée par la
 * réponse du prospect, se retrouvait planifiée AU LENDEMAIN parce que les vingt
 * places du jour étaient prises. On laisse refroidir la seule chose qui était
 * chaude.
 *
 * Répondre à un message coûte une minute, d'où l'absence de plafond. L'APPEL
 * reste plafonné même en discussion : vingt appels par jour, c'est une
 * contrainte d'horloge, pas de volume sortant.
 */
const CONVERSATION_KINDS: readonly string[] = ["whatsapp", "linkedin"] as const;

/** Le plafond d'un canal, ou `null` quand il n'en a pas. */
export const quotaOf = (kind: string): number | null => DAILY_QUOTA[kind] ?? null;

/**
 * Cette tâche fait-elle partie d'une discussion en cours ?
 *
 * Le prospect a écrit : il attend une réponse, et cette réponse ne se planifie
 * pas — elle se donne. Ces tâches sortent donc du plan et se traitent le jour
 * même, sans plafond.
 */
export const isConversation = (t: DemarchageTaskLike): boolean =>
  t.in_conversation === true && CONVERSATION_KINDS.includes(t.kind ?? "");

/**
 * Un prospect dont les signaux mesurés réclament un appel aujourd'hui remonte
 * en tête de journée, QUELLE QUE SOIT l'échéance prévue par sa séquence.
 *
 * C'est le cœur de l'idée : la séquence planifie le rythme normal, mais une
 * démo rouverte ce matin est une information plus fraîche que n'importe quel
 * délai décidé la semaine dernière. La tâche n'est pas dupliquée ni sortie de
 * sa séquence — elle est seulement remontée. Si l'appel ne donne rien, la
 * séquence reprend son cours là où elle en était.
 */
const isHot = (t: DemarchageTaskLike) =>
  t.intent?.callWhen === "maintenant" || t.intent?.callWhen === "aujourdhui";

/** Le signal porté par la tâche, ou `null` si elle suit simplement la cadence. */
export function signalOf(task: DemarchageTaskLike): DemarchageSignal | null {
  // Un signal chaud non rappelé passe AVANT tout : c'est une opportunité déjà
  // en train de refroidir, pas une opportunité fraîche.
  if (task.intent?.missed) return "missed";
  // Puis ce qui vient d'arriver : quelqu'un a écrit et attend. Devant les
  // signaux de visite, qui ne sont qu'un intérêt observé, jamais une demande.
  if (isConversation(task)) return "conversation";
  if (isHot(task)) return "hot";
  return null;
}

/**
 * Heure locale (fuseau de l'agent) à partir de laquelle la journée est close :
 * ce qui n'a pas été fait passe à demain. Personne n'appelle un artisan à
 * 22 h 30, et laisser vingt WhatsApp affichés « pour aujourd'hui » à cette
 * heure-là ne fait que fabriquer un retard qui n'en est pas un.
 */
export const DAY_CUTOFF_HOUR = 22;

const DAY_MS = 86_400_000;

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

/**
 * La date civile (YYYY-MM-DD, fuseau de l'agent) du jour `offset`.
 *
 * On vise MIDI du jour visé plutôt que minuit : aux deux changements d'heure,
 * « minuit + 24 h » tombe à 23 h la veille ou 1 h le lendemain, et la date
 * formatée serait fausse une fois par an dans chaque sens.
 */
export function dayDate(
  offset: number,
  now: Date = new Date(),
  timeZone: string = AGENT_TIMEZONE,
): string {
  const start = new Date(dayStartIso(now, timeZone)).getTime();
  const midi = new Date(start + offset * DAY_MS + DAY_MS / 2);
  // en-CA rend exactement YYYY-MM-DD, sans avoir à recoller des morceaux.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(midi);
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

/** Une journée du plan — c'est exactement un onglet de la file. */
export type DemarchageDay<T> = {
  /** 0 = aujourd'hui, 1 = demain, … */
  offset: number;
  /** Date civile (YYYY-MM-DD) dans le fuseau de l'agent — la clé de l'onglet. */
  date: string;
  tasks: T[];
};

/**
 * Range chaque tâche dans sa journée.
 *
 * Aujourd'hui vient d'abord les trois signaux (chaud non rappelé, discussion,
 * chaud), dans cet ordre, puis la part de cadence du jour. Les jours suivants
 * n'ont que de la cadence.
 *
 * L'ordre de passage à l'intérieur d'un groupe est celui de l'échéance
 * croissante — la plus ancienne d'abord, sans date en dernier —, quel que soit
 * l'ordre dans lequel l'appelant fournit les tâches.
 *
 * Le tableau rendu contient TOUJOURS aujourd'hui (même vide : c'est l'onglet
 * par défaut, il ne doit pas disparaître sous les doigts), puis uniquement les
 * journées qui portent au moins une tâche — pas de colonne « 0 act. » pour un
 * jeudi où il n'y a rien.
 */
export function planTasks<T extends DemarchageTaskLike>(
  tasks: T[],
  { now = new Date(), timeZone = AGENT_TIMEZONE, doneToday = {} }: DemarchagePlanOptions = {},
): Array<DemarchageDay<T>> {
  /** Les tâches de chaque décalage de jour, avant mise en forme. */
  const parJour = new Map<number, T[]>();
  const pousser = (offset: number, task: T) => {
    const arr = parJour.get(offset);
    if (arr) arr.push(task);
    else parJour.set(offset, [task]);
  };

  const signaux: Record<DemarchageSignal, T[]> = { missed: [], conversation: [], hot: [] };
  const aPlanifier: T[] = [];
  for (const task of tasks) {
    const signal = signalOf(task);
    if (signal) signaux[signal].push(task);
    else aPlanifier.push(task);
  }

  for (const cle of SIGNAL_ORDER) {
    signaux[cle].sort((a, b) => dueMs(a) - dueMs(b));
    // Les signaux sont du travail du jour : ils ouvrent la journée, dans
    // l'ordre de priorité, avant la cadence.
    signaux[cle].forEach((t) => pousser(0, t));
  }

  aPlanifier.sort((a, b) => dueMs(a) - dueMs(b));

  const journeeClose = localHour(now, timeZone) >= DAY_CUTOFF_HOUR;

  /** Où en est le remplissage de chaque canal : jour courant et places libres. */
  const etats = new Map<string, { jour: number; libre: number }>();

  for (const task of aPlanifier) {
    const kind = task.kind ?? "";
    const quota = quotaOf(kind);

    // Canal sans plafond (l'attente de réponse) : rien à étaler, et rien à
    // reporter non plus — déclarer une réponse prend deux secondes, la clôture
    // du soir ne la concerne pas.
    if (quota == null || quota <= 0) {
      pousser(0, task);
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
    pousser(etat.jour, task);
  }

  // Aujourd'hui existe toujours, même vide.
  if (!parJour.has(0)) parJour.set(0, []);

  return [...parJour.entries()]
    .sort(([a], [b]) => a - b)
    .map(([offset, liste]) => ({ offset, date: dayDate(offset, now, timeZone), tasks: liste }));
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

/** Combien de tâches portent chaque signal — ce que les filtres annoncent. */
export function countBySignal(tasks: readonly DemarchageTaskLike[]): Record<DemarchageSignal, number> {
  const par: Record<DemarchageSignal, number> = { missed: 0, conversation: 0, hot: 0 };
  for (const t of tasks) {
    const s = signalOf(t);
    if (s) par[s] += 1;
  }
  return par;
}

/**
 * La première tâche du plan — celle sur laquelle on atterrit à l'ouverture.
 *
 * L'ordre du plan porte déjà la priorité : le premier jour d'abord, et à
 * l'intérieur de ce jour les signaux avant la cadence. Il n'y a donc rien à
 * arbitrer ici.
 */
export function firstPlannedTask<T extends DemarchageTaskLike>(
  days: ReadonlyArray<DemarchageDay<T>>,
): T | null {
  for (const day of days) {
    if (day.tasks[0]) return day.tasks[0];
  }
  return null;
}

/** La journée qui contient cette tâche — pour faire suivre l'onglet à la sélection. */
export function dayOfTask<T extends DemarchageTaskLike & { id: string }>(
  days: ReadonlyArray<DemarchageDay<T>>,
  id: string,
): string | null {
  for (const day of days) {
    if (day.tasks.some((t) => t.id === id)) return day.date;
  }
  return null;
}
