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
 *   · les RELANCES ET DISCUSSIONS — des gens qu'on a déjà touchés. Aucun
 *     plafond : répondre à quelqu'un qui a réagi ne se rationne pas. Ce qui est
 *     dû plus tard est compté, pas déplié — cf. `repartirLaJournee` ;
 *   · les ATTENTES DE RÉPONSE — rien à envoyer, une réponse à déclarer. Elles
 *     avaient été rangées avec les relances, où elles étaient invisibles.
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
import type { EtatDemo } from "@/lib/agent-portal/etat-demo";
import type { EtatSite } from "@/lib/agent-portal/etat-site";

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
  /** Où en est NOTRE démo (cf. `etat-demo.ts`). */
  demo_etat?: EtatDemo | null;
  /** Joignable sur un mobile français (06/07), toutes sources confondues. */
  a_mobile?: boolean;
  /** A-t-il un site, LUI (cf. `etat-site.ts`) — à ne pas confondre avec `demo_etat`. */
  etat_site?: EtatSite | null;
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
 * CE QUE CHAQUE SIGNAL VEUT DIRE, en une phrase — la matière de la légende.
 *
 * Trois mots sur une ligne de file ne s'expliquent pas eux-mêmes : « chaud » ne
 * dit pas d'où vient la chaleur, et « jamais rappelé » se lit comme un reproche
 * alors que c'est une occasion. Ces phrases vivent ICI, à côté des libellés
 * qu'elles expliquent, pour qu'un signal ajouté sans son explication se voie —
 * le `Record` ne compile pas sans.
 */
export const SIGNAL_AIDE: Record<DemarchageSignal, string> = {
  missed:
    "Il est venu voir sa démo et personne ne l'a rappelé depuis. C'est le meilleur moment d'un fichier, et il se périme.",
  conversation:
    "Il a répondu au moins une fois : la discussion est ouverte, on ne repart pas d'une accroche.",
  hot: "Sa visite sur la démo est mesurée (GA4) : plusieurs sessions, du temps passé, une intention.",
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

/* ── Le TRI : remonter une catégorie en tête ─────────────────────────────── */

/**
 * Sur quoi on remonte la file. `passage` est l'ordre du jour — signaux d'abord,
 * puis échéance — et c'est le défaut : il ne se choisit pas, il se retrouve.
 *
 * Les trois autres reprennent EXACTEMENT ce que la ligne montre déjà : le
 * liseré de démo, le badge 06/07, l'étiquette de site. Un tri sur un critère
 * qu'on ne voit pas sur la ligne rendrait une liste dont on ne peut pas
 * vérifier l'ordre à l'œil.
 */
export type TriFile = "passage" | "demo" | "mobile";

export const TRI_ORDER: readonly TriFile[] = ["passage", "demo", "mobile"] as const;

export const TRI_LABEL: Record<TriFile, string> = {
  passage: "Ordre du jour",
  demo: "Démo prête",
  mobile: "Mobile",
};

export const TRI_AIDE: Record<TriFile, string> = {
  passage: "L'ordre de travail : les signaux d'abord, puis l'échéance la plus ancienne.",
  demo: "Ceux dont la démo est prête en tête — il y a quelque chose à leur montrer.",
  mobile: "Ceux joignables sur un 06/07 en tête — WhatsApp possible.",
};

/**
 * ⚠️ PAS DE TRI « SANS SITE », ET C'EST DÉLIBÉRÉ.
 *
 * Le filtre Site fait déjà ce travail, et mieux : il RETIRE le bruit au lieu de
 * le repousser plus bas. Doubler un filtre par un tri sur le même axe ajoute une
 * pastille qui ne décide de rien.
 *
 * Et il n'aurait pas eu de couleur à lui : l'étiquette « absence vérifiée » est
 * déjà en `--ok`, comme le liseré « démo prête ». Deux pastilles vertes côte à
 * côte pour deux questions différentes se relisent une fois de trop.
 */

/** Le rang d'une tâche pour un tri donné. Plus petit = plus haut. */
function rangDuTri(tri: TriFile): (t: DemarchageTaskLike) => number {
  switch (tri) {
    case "demo":
      return (t) => (t.demo_etat === "prete" ? 0 : t.demo_etat === "chantier" ? 1 : 2);
    case "mobile":
      return (t) => (t.a_mobile ? 0 : 1);
    default:
      return () => 0;
  }
}

/**
 * Remonte une catégorie en tête, SANS défaire l'ordre du jour à l'intérieur.
 *
 * ⚠️ LA STABILITÉ DU TRI EST LA RÈGLE, PAS UN DÉTAIL D'IMPLÉMENTATION.
 * `Array.prototype.sort` est stable depuis ES2019, et c'est ce qui fait que
 * « démo prête en tête » ne mélange pas les prospects chauds avec les tièdes à
 * l'intérieur du groupe : la liste reçue est DÉJÀ dans `ordreDePassage` (posé
 * par `repartirLaJournee`), et un tri stable la préserve. Trier sur deux clés
 * ici recopierait cet ordre — donc le ferait diverger le jour où l'un des deux
 * change.
 *
 * Ne retire rien : c'est un tri, pas un filtre.
 */
export function trierLaFile<T extends DemarchageTaskLike>(
  tasks: readonly T[],
  tri: TriFile,
): T[] {
  if (tri === "passage") return [...tasks];
  const rang = rangDuTri(tri);
  return [...tasks].sort((a, b) => rang(a) - rang(b));
}

/** Combien de lignes ce tri remonterait en tête — le compte de la pastille. */
export function compteDuTri(tasks: readonly DemarchageTaskLike[], tri: TriFile): number {
  if (tri === "passage") return tasks.length;
  const rang = rangDuTri(tri);
  return tasks.reduce((n, t) => n + (rang(t) === 0 ? 1 : 0), 0);
}

/* ── La journée, en TROIS files ─────────────────────────────────────────── */

/**
 * Le décalage en jours entre aujourd'hui et l'échéance — 0 si elle est passée.
 *
 * L'échu est replié sur aujourd'hui plutôt que rendu négatif : une relance en
 * retard est du travail du jour, pas une case dans le passé où personne n'irait
 * regarder.
 */
function offsetDe(task: DemarchageTaskLike, now: Date, timeZone: string): number {
  const ms = dueMs(task);
  if (!Number.isFinite(ms)) return 0;
  const debut = new Date(dayStartIso(now, timeZone)).getTime();
  return Math.max(0, Math.floor((ms - debut) / DAY_MS));
}

/** Laquelle des trois files on travaille. */
export type FileDeTravail = "premiers" | "relances" | "attentes";

/** Ce que porte la journée, une fois rangé. */
export type RepartitionJournee<T> = {
  /** Jamais abordées par personne — un stock, rien ne les date. */
  premiers: T[];
  /** Déjà touchées, dues aujourd'hui ou en retard — la journée elle-même. */
  relances: T[];
  /** Déjà touchées, dues plus tard. Hors de la journée, mais pas perdues. */
  aVenir: T[];
  /** Rien à envoyer : une réponse à déclarer pour que la séquence reparte. */
  attentes: T[];
};

/**
 * LA JOURNÉE EN TROIS FILES — ce qui remplace le calendrier.
 *
 * Une frise de sept jours a vécu ici. Elle a été retirée, et c'est un choix
 * assumé : personne ne travaille jeudi prochain un mardi matin. Ce que la frise
 * apportait — savoir qu'une relance est prévue plus tard — tient dans un
 * compteur (`aVenir`), et ce qu'elle coûtait — un clic de plus pour atteindre
 * la seule case qui serve, un tiers de la hauteur du rail — était payé tous les
 * jours.
 *
 * LES ATTENTES SORTENT DES RELANCES, et c'est le vrai correctif. Une attente
 * de réponse n'est pas une relance : il n'y a rien à envoyer, seulement à dire
 * « il a répondu » pour que la séquence reparte. Mélangée aux relances et
 * répartie sur sept jours, elle était invisible — et une séquence qui attend
 * quelqu'un qui a déjà répondu ne repart jamais toute seule.
 *
 * L'ordre à l'intérieur de chaque file reste celui des signaux puis de
 * l'échéance (`ordreDePassage`) — sauf « à venir », qui est chronologique : ce
 * n'est pas une file de travail, c'est un aperçu.
 */
export function repartirLaJournee<T extends DemarchageTaskLike>(
  tasks: readonly T[],
  { now = new Date(), timeZone = AGENT_TIMEZONE }: { now?: Date; timeZone?: string } = {},
): RepartitionJournee<T> {
  const premiers: T[] = [];
  const relances: T[] = [];
  const aVenir: T[] = [];
  const attentes: T[] = [];

  for (const t of tasks) {
    if (t.kind === "wait") {
      attentes.push(t);
      continue;
    }
    if (estPremierContact(t)) {
      premiers.push(t);
      continue;
    }
    (offsetDe(t, now, timeZone) > 0 ? aVenir : relances).push(t);
  }

  return {
    premiers: ordreDePassage(premiers),
    relances: ordreDePassage(relances),
    aVenir: [...aVenir].sort((a, b) => dueMs(a) - dueMs(b)),
    attentes: ordreDePassage(attentes),
  };
}

/**
 * La liste d'une file, à partir d'une répartition — « à venir » compris quand
 * l'agent a demandé à le voir.
 *
 * Vit ici et non dans l'écran parce que c'est la même question que se posent le
 * rail (qu'est-ce que j'affiche) et la page (sur quoi j'atterris après un
 * geste) : deux réponses différentes feraient sauter la sélection.
 */
export function fileDeLaJournee<T extends DemarchageTaskLike>(
  rep: RepartitionJournee<T>,
  file: FileDeTravail,
  avecAVenir = false,
): T[] {
  if (file === "premiers") return rep.premiers;
  if (file === "attentes") return rep.attentes;
  return avecAVenir ? [...rep.relances, ...rep.aVenir] : rep.relances;
}

/** Dans quelle file cette tâche est-elle rangée ? */
export function fileDe<T extends DemarchageTaskLike>(
  rep: RepartitionJournee<T>,
  task: T,
): FileDeTravail {
  if (rep.attentes.includes(task)) return "attentes";
  if (rep.premiers.includes(task)) return "premiers";
  return "relances";
}

/**
 * L'échéance prévue est-elle déjà passée ?
 *
 * Une relance due depuis six jours dit que le rythme ne suit pas — et la file
 * la range de toute façon dans la journée, donc c'est la ligne qui doit le
 * dire. L'attente de réponse est exclue, son `due_at` n'est qu'une date de mise
 * en pause.
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
