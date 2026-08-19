/**
 * LA FILE DE DÉMARCHAGE — pur, sans base ni React.
 *
 * DEUX FILES, ET ELLES NE SE TRAVAILLENT PAS PAREIL
 * Tout vivait dans une seule liste, répartie sur les jours à venir à
 * concurrence d'un quota par canal. Ça mélangeait deux métiers :
 *
 *   · les PREMIERS CONTACTS — des entreprises jamais touchées. C'est un STOCK :
 *     rien ne les date, elles attendent qu'on s'y mette. Vingt WhatsApp par
 *     jour est un objectif de rythme, pas une limite : dépasser est une bonne
 *     journée, et l'ancien plan faisait exactement l'inverse — il DÉPLAÇAIT au
 *     lendemain tout ce qui dépassait, donc il cachait le travail qu'on venait
 *     de décider de faire ;
 *   · les RELANCES ET DISCUSSIONS — des gens qu'on a déjà touchés. C'est un
 *     CALENDRIER : une relance est due un jour précis, une mise de côté revient
 *     à une date, une réponse se traite le jour où elle arrive. Aucun plafond :
 *     répondre à quelqu'un qui écrit ne se rationne pas.
 *
 * La frontière est celle de la base et non d'une heuristique :
 * `entreprises.premiere_touche_le`, posé une seule fois par la première tâche
 * bouclée (cf. `PATCH /api/agent/tasks`). Une entreprise sans cette date n'a
 * jamais été abordée par personne ; avec, tout ce qui suit est un suivi.
 *
 * LES SIGNAUX SE CUMULENT
 * Un prospect peut être chaud ET en discussion ET en retard de rappel. L'ancien
 * `signalOf` n'en rendait qu'un — le premier de la liste de priorité — et la
 * pastille « Chauds » ne comptait donc PAS les prospects chauds déjà en
 * discussion : le filtre affichait trois leads quand la journée en portait
 * huit. `signalsOf` rend l'ensemble ; `signalOf` ne sert plus qu'à la teinte et
 * à l'ordre, où il faut bien trancher.
 *
 * Réutilise `dayStartIso` (`@/lib/agent-progress`) pour la frontière du jour
 * dans le fuseau de l'agent : c'est la même horloge que le compteur "X sur Y
 * aujourd'hui", donc les deux ne peuvent pas se contredire.
 */

import { AGENT_TIMEZONE, dayStartIso } from "@/lib/agent-progress";

export type DemarchageTaskLike = {
  /** Canal de la tâche — c'est lui qui porte l'objectif quotidien. */
  kind?: string;
  due_at: string | null;
  /**
   * L'état de la tâche en base. Seul `snoozed` change quelque chose ici : c'est
   * la MISE DE CÔTÉ, et elle seule fait respecter `due_at` comme une date de
   * retour (cf. `isSetAside`).
   */
  status?: string;
  /**
   * L'inscription de ce prospect a DÉJÀ enregistré une réponse : la discussion
   * est ouverte. Posé par `/api/agent/tasks` d'après `vars.replies`.
   */
  in_conversation?: boolean;
  /**
   * L'entreprise a-t-elle déjà été touchée, et quand ? `null` = jamais, par
   * personne — c'est ce qui définit un premier contact. Vient de
   * `entreprises.premiere_touche_le`, et pas d'un calcul côté écran : cette
   * date est aussi le socle de la comparaison des cohortes, les deux lectures
   * ne peuvent donc pas diverger.
   */
  premiere_touche_le?: string | null;
  /** Signal d'intention mesuré (GA4). Absent = aucun site démo ou aucune visite. */
  intent?: { callWhen: string; score: number; missed?: boolean } | null;
};

/**
 * Ce qui sort une tâche du rythme ordinaire. Une tâche peut en porter
 * plusieurs — c'est tout l'objet de `signalsOf`.
 */
export type DemarchageSignal = "missed" | "conversation" | "hot";

/** L'ordre de priorité des signaux — c'est aussi l'ordre d'affichage. */
export const SIGNAL_ORDER: readonly DemarchageSignal[] = ["missed", "conversation", "hot"] as const;

export const SIGNAL_LABEL: Record<DemarchageSignal, string> = {
  missed: "Non rappelés",
  conversation: "En discussion",
  hot: "Chauds",
};

/** Le libellé court, celui qui tient sur une ligne de file. */
export const SIGNAL_TAG: Record<DemarchageSignal, string> = {
  missed: "jamais rappelé",
  conversation: "a répondu",
  hot: "chaud",
};

/**
 * L'OBJECTIF quotidien par canal, à défaut de réglage propre à l'agent.
 *
 * Ce n'est plus un plafond et ça ne l'a jamais vraiment été : c'est un rythme
 * tenable, affiché pour qu'on sache où on en est de sa journée. Rien n'est
 * caché quand il est dépassé — soixante WhatsApp envoyés un jour de forme sont
 * soixante WhatsApp, pas « vingt plus quarante reportés ».
 *
 * L'agent porte son propre réglage (`agent_settings.quotas_demarchage`) ; ces
 * valeurs restent le repli — cf. `normaliseQuotas`.
 */
export const DAILY_QUOTA: Readonly<Record<string, number>> = {
  call: 20,
  whatsapp: 20,
  linkedin: 20,
};

/** Les canaux qui portent un objectif, dans l'ordre où la file les présente. */
export const QUOTA_KINDS: readonly string[] = ["call", "whatsapp", "linkedin"] as const;

/** Un objectif quotidien, canal par canal. */
export type QuotasDemarchage = Readonly<Record<string, number>>;

/**
 * Au-delà, ce n'est plus un rythme : c'est une saisie fautive (un zéro de trop)
 * ou une unité qui n'est pas la bonne.
 */
const QUOTA_MAX = 1000;

/**
 * Le réglage lu en base (`agent_settings.quotas_demarchage`, jsonb libre),
 * ramené à un objectif utilisable — ou `null` s'il n'y a rien d'exploitable.
 *
 * POURQUOI VALIDER PLUTÔT QUE FAIRE CONFIANCE
 * Ce jsonb n'a pas de forme garantie : personne n'empêche `{"call": 0}`,
 * `{"call": "vingt"}` ou un tableau d'y atterrir. Un objectif nul ou négatif
 * n'affiche plus un rythme, il affiche une barre de progression absurde. Une
 * valeur aberrante coûte donc le retour au défaut.
 *
 * Deux conséquences voulues :
 *   · le réglage est fusionné SUR le défaut — un canal absent du jsonb garde
 *     son objectif habituel ;
 *   · une valeur textuelle mais numérique (`"40"`, ce que donne un jsonb saisi
 *     à la main) est acceptée : la refuser punirait la bonne intention.
 */
export function normaliseQuotas(brut: unknown): QuotasDemarchage | null {
  if (!brut || typeof brut !== "object" || Array.isArray(brut)) return null;
  const source = brut as Record<string, unknown>;

  const retenus: Record<string, number> = {};
  for (const kind of QUOTA_KINDS) {
    const valeur = source[kind];
    const n =
      typeof valeur === "number" ? valeur : typeof valeur === "string" ? Number(valeur.trim()) : NaN;
    if (!Number.isFinite(n)) continue;
    const entier = Math.floor(n);
    if (entier < 1 || entier > QUOTA_MAX) continue;
    retenus[kind] = entier;
  }

  return Object.keys(retenus).length > 0 ? { ...DAILY_QUOTA, ...retenus } : null;
}

/**
 * L'objectif à afficher, quoi qu'on ait reçu — `meta.quotas` de
 * `/api/agent/tasks`, ou n'importe quel jsonb.
 */
export const cadenceEffective = (brut: unknown): QuotasDemarchage =>
  normaliseQuotas(brut) ?? DAILY_QUOTA;

/**
 * L'objectif d'un canal, ou `null` quand il n'en a pas (l'attente de réponse :
 * déclarer qu'un prospect a répondu prend deux secondes, il n'y a pas de rythme
 * à tenir).
 */
export const quotaOf = (kind: string, quotas: QuotasDemarchage = DAILY_QUOTA): number | null =>
  quotas[kind] ?? DAILY_QUOTA[kind] ?? null;

/* ── Les signaux ─────────────────────────────────────────────────────────── */

/**
 * Les canaux dont une discussion ouverte est un échange, pas un envoi de plus.
 * L'appel n'en fait pas partie : rappeler quelqu'un qui a répondu coûte le même
 * quart d'heure qu'un appel à froid.
 */
const CONVERSATION_KINDS: readonly string[] = ["whatsapp", "linkedin"] as const;

/**
 * Cette tâche fait-elle partie d'une discussion en cours ? Le prospect a écrit :
 * il attend une réponse, et cette réponse se donne le jour même.
 */
export const isConversation = (t: DemarchageTaskLike): boolean =>
  t.in_conversation === true && CONVERSATION_KINDS.includes(t.kind ?? "");

/**
 * Les signaux mesurés réclament un appel aujourd'hui, quelle que soit
 * l'échéance prévue par la séquence : une démo rouverte ce matin est une
 * information plus fraîche que n'importe quel délai décidé la semaine dernière.
 */
const isHot = (t: DemarchageTaskLike) =>
  t.intent?.callWhen === "maintenant" || t.intent?.callWhen === "aujourdhui";

/**
 * TOUS les signaux portés par la tâche, dans l'ordre de priorité.
 *
 * Cumulables, et c'est le correctif : un prospect chaud qui a répondu est chaud
 * ET en discussion. L'ancienne lecture n'en gardait qu'un, si bien qu'il
 * disparaissait de la pastille « Chauds » au moment précis où il devenait
 * intéressant.
 */
export function signalsOf(task: DemarchageTaskLike): DemarchageSignal[] {
  const out: DemarchageSignal[] = [];
  if (task.intent?.missed) out.push("missed");
  if (isConversation(task)) out.push("conversation");
  if (isHot(task)) out.push("hot");
  return out;
}

/** Ce prospect porte-t-il ce signal ? La question que pose un filtre. */
export const hasSignal = (task: DemarchageTaskLike, signal: DemarchageSignal): boolean =>
  signalsOf(task).includes(signal);

/**
 * Le signal DOMINANT — celui qui décide de la teinte de la ligne et de sa place
 * dans l'ordre de passage. `null` quand la tâche n'en porte aucun.
 *
 * Un signal chaud non rappelé passe devant : c'est une occasion déjà en train
 * de refroidir. Puis la discussion — quelqu'un a écrit et attend, ce qui
 * l'emporte sur un intérêt seulement observé.
 */
export const signalOf = (task: DemarchageTaskLike): DemarchageSignal | null =>
  signalsOf(task)[0] ?? null;

/** Combien de tâches portent chaque signal — ce que les pastilles annoncent. */
export function countBySignal(tasks: readonly DemarchageTaskLike[]): Record<DemarchageSignal, number> {
  const par: Record<DemarchageSignal, number> = { missed: 0, conversation: 0, hot: 0 };
  for (const t of tasks) {
    // Chaque signal porté est compté : la somme des pastilles peut donc dépasser
    // le nombre de lignes, et c'est exact — huit chauds dont trois en discussion
    // font bien huit chauds.
    for (const s of signalsOf(t)) par[s] += 1;
  }
  return par;
}

/** Combien de tâches par canal dans une liste. */
export function countByKind(tasks: readonly DemarchageTaskLike[]): Record<string, number> {
  const par: Record<string, number> = {};
  for (const t of tasks) {
    const k = t.kind ?? "";
    par[k] = (par[k] ?? 0) + 1;
  }
  return par;
}

/* ── Les deux files ──────────────────────────────────────────────────────── */

/**
 * Cette ligne est-elle un PREMIER CONTACT — une entreprise que personne n'a
 * jamais abordée ?
 *
 * Lu sur `premiere_touche_le`, jamais deviné. Une attente de réponse en est
 * exclue par construction : on n'attend une réponse qu'après avoir écrit.
 *
 * Le champ peut manquer (vieille réponse d'API en cache, tâche construite à la
 * main dans un test) : on retombe alors sur ce que la tâche sait d'elle-même —
 * hors séquence et sans discussion, c'est un premier contact.
 */
export function estPremierContact(task: DemarchageTaskLike): boolean {
  if (task.kind === "wait") return false;
  if (isConversation(task)) return false;
  return !task.premiere_touche_le;
}

/**
 * Les deux files, séparées une fois pour toutes.
 *
 * `premiers` garde l'ordre de passage (signaux d'abord, puis échéance) ;
 * `relances` sort tel quel, à charge de `joursReels` de le dater.
 */
export function separerFile<T extends DemarchageTaskLike>(
  tasks: readonly T[],
): { premiers: T[]; relances: T[] } {
  const premiers: T[] = [];
  const relances: T[] = [];
  for (const t of tasks) (estPremierContact(t) ? premiers : relances).push(t);
  return { premiers: ordreDePassage(premiers), relances };
}

const DAY_MS = 86_400_000;

const dueMs = (t: DemarchageTaskLike): number => {
  const ms = t.due_at ? new Date(t.due_at).getTime() : NaN;
  // Sans échéance, la tâche passe en fin de file plutôt que d'être perdue.
  return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
};

/**
 * L'ordre dans lequel on traite une file : les signaux d'abord, dans leur ordre
 * de priorité, puis l'échéance la plus ancienne.
 *
 * Ne retire rien et ne regroupe rien — c'est un tri, pas un plan. La liste
 * rendue contient exactement ce qu'on lui a donné.
 */
export function ordreDePassage<T extends DemarchageTaskLike>(tasks: readonly T[]): T[] {
  const rang = (t: T) => {
    const s = signalOf(t);
    return s ? SIGNAL_ORDER.indexOf(s) : SIGNAL_ORDER.length;
  };
  return [...tasks].sort((a, b) => rang(a) - rang(b) || dueMs(a) - dueMs(b));
}

/* ── Le calendrier ───────────────────────────────────────────────────────── */

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

/** Une journée du calendrier — c'est exactement un onglet de la file. */
export type DemarchageDay<T> = {
  /** 0 = aujourd'hui, 1 = demain, … Négatif : jamais, l'échu est replié. */
  offset: number;
  /** Date civile (YYYY-MM-DD) dans le fuseau de l'agent — la clé de l'onglet. */
  date: string;
  tasks: T[];
};

/** Le décalage en jours entre aujourd'hui et l'échéance — 0 si elle est passée. */
function offsetDe(task: DemarchageTaskLike, now: Date, timeZone: string): number {
  const ms = dueMs(task);
  if (!Number.isFinite(ms)) return 0;
  const debut = new Date(dayStartIso(now, timeZone)).getTime();
  return Math.max(0, Math.floor((ms - debut) / DAY_MS));
}

/**
 * L'HORIZON du calendrier : combien de journées à venir sont montrées même
 * quand elles ne portent rien.
 *
 * Un calendrier qui n'affiche que les jours occupés n'est plus un calendrier,
 * c'est une liste : la semaine ne se lit plus, on ne voit pas qu'il n'y a rien
 * jeudi, et une case unique « auj. » donne l'impression que la barre est
 * cassée. Une semaine complète tient dans le rail (elle défile au-delà).
 */
export const HORIZON_JOURS = 7;

/**
 * Le CALENDRIER des relances : chaque tâche à la date où elle est réellement
 * due.
 *
 * Ce que ça change par rapport au plan qu'il remplace : rien n'est déplacé.
 * Une relance due jeudi est jeudi, une mise de côté revient le jour choisi, et
 * ce qui est échu est replié sur aujourd'hui — parce qu'une relance en retard
 * est du travail du jour, pas un onglet dans le passé où personne n'irait
 * regarder.
 *
 * Le tableau rendu contient TOUJOURS la semaine qui vient, vide ou non
 * (`horizon`), plus toutes les journées plus lointaines qui portent une tâche —
 * une mise de côté à trois mois garde sa case, elle ne disparaît pas au bout de
 * l'horizon.
 */
export function joursReels<T extends DemarchageTaskLike>(
  tasks: readonly T[],
  {
    now = new Date(),
    timeZone = AGENT_TIMEZONE,
    horizon = HORIZON_JOURS,
  }: { now?: Date; timeZone?: string; horizon?: number } = {},
): Array<DemarchageDay<T>> {
  const parJour = new Map<number, T[]>();
  // La semaine qui vient existe d'abord, vide : c'est le calendrier lui-même,
  // pas le résultat de ce qu'il contient.
  for (let i = 0; i < Math.max(1, horizon); i += 1) parJour.set(i, []);

  for (const t of tasks) {
    const offset = offsetDe(t, now, timeZone);
    const liste = parJour.get(offset);
    if (liste) liste.push(t);
    else parJour.set(offset, [t]);
  }

  return [...parJour.entries()]
    .sort(([a], [b]) => a - b)
    .map(([offset, liste]) => ({
      offset,
      date: dayDate(offset, now, timeZone),
      tasks: ordreDePassage(liste),
    }));
}

/**
 * L'échéance prévue est-elle déjà passée ?
 *
 * Le calendrier replie de toute façon l'échu sur aujourd'hui, mais ça reste une
 * information : une relance due depuis six jours dit que le rythme ne suit pas.
 * L'attente de réponse est exclue, son `due_at` n'est qu'une date de mise en
 * pause.
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

/**
 * Cette tâche est-elle MISE DE CÔTÉ — replanifiée à une date qui n'est pas
 * encore arrivée ?
 *
 * Ni un oui ni un non : le prospect n'est pas joignable en ce moment (congés,
 * chantier, saison creuse), on le range et il revient tout seul. C'est
 * `status = 'snoozed'` avec un `due_at` déplacé — la tâche n'est pas fermée,
 * elle dort.
 *
 * La lecture du STATUT est ce qui distingue le geste d'une simple échéance
 * future : sans elle, toute relance planifiée passerait pour une mise de côté.
 */
export function isSetAside(
  task: DemarchageTaskLike,
  now: Date = new Date(),
  timeZone: string = AGENT_TIMEZONE,
): boolean {
  if (task.status !== "snoozed") return false;
  return offsetDe(task, now, timeZone) > 0;
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

/** La première tâche du calendrier — celle sur laquelle on atterrit. */
export function firstPlannedTask<T extends DemarchageTaskLike>(
  days: ReadonlyArray<DemarchageDay<T>>,
): T | null {
  for (const day of days) {
    if (day.tasks[0]) return day.tasks[0];
  }
  return null;
}
