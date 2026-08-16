/**
 * Sprint commercial : un objectif en euros, une échéance, et les compteurs
 * qui disent où on en est — aujourd'hui et depuis le début.
 *
 * La logique de classement des étapes vit ici, pure et testée, parce qu'elle
 * décide de ce qui compte comme « encaissé » et comme « vente ». Se tromper
 * là-dessus, c'est afficher un chiffre d'affaires qui n'existe pas.
 */

import { normaliseQuotas } from "@/lib/agent-portal/demarchage-buckets";

/** Étapes où l'argent est réellement rentré. */
const ENCAISSE = /acompte/i;
/** Étapes où l'affaire est gagnée (signée), encaissée ou non. */
const GAGNE = /signature|signé|signe/i;
/** Étapes où le prospect décide : proposition envoyée, pas encore tranchée. */
const EN_DECISION = /devis|signature/i;
/** Étapes terminales négatives, à ne jamais compter comme en cours. */
const PERDU = /lost|perdu/i;

export type EtapeKind = "encaisse" | "gagne" | "en_decision" | "perdu" | "en_cours";

/**
 * Classe une étape de pipeline par son nom. Les pipelines de ce CRM ont des
 * intitulés proches mais pas identiques (« Acompte », « Signature »,
 * « Client signé », « Perdu », « Lost »), d'où la reconnaissance par motif
 * plutôt qu'une liste d'identifiants qui deviendrait fausse au prochain
 * pipeline créé.
 *
 * L'ordre des tests compte : « Perdu » d'abord, puis l'argent encaissé, puis
 * la signature — une étape « Signature » ne doit pas être lue comme encaissée.
 */
export function classifyEtape(nom: string): EtapeKind {
  if (PERDU.test(nom)) return "perdu";
  if (ENCAISSE.test(nom)) return "encaisse";
  if (GAGNE.test(nom)) return "gagne";
  if (EN_DECISION.test(nom)) return "en_decision";
  return "en_cours";
}

/* ── Le cadre du sprint : ce qui change d'une campagne à l'autre ─────────── */

/**
 * Objectif, dates et cible quotidienne du sprint en cours.
 *
 * POURQUOI CE N'EST PLUS DANS LE CODE
 * Les quatre valeurs étaient écrites en dur dans `/api/agent/sprint`, avec le
 * commentaire « volontairement en dur : c'est un sprint daté ». Un sprint daté,
 * justement, PÉRIME : l'échéance codée au 20 août est dépassée le 21, et l'écran
 * de l'agent annonce alors « terminé » au beau milieu d'une campagne qui court
 * jusqu'au 26 — avec un rythme requis calculé sur zéro jour restant. Déployer
 * pour déplacer une date, personne ne le fait un mardi matin ; l'écran ment donc
 * jusqu'à ce que quelqu'un s'en aperçoive.
 *
 * D'OÙ VIENNENT LES VALEURS, DANS L'ORDRE
 *   1. `agent_settings.quotas_demarchage` pour la cible du jour — voir
 *      `cibleContactsDepuisQuotas` ;
 *   2. les variables d'environnement ci-dessous ;
 *   3. les défauts, qui sont ceux de la campagne du 17 au 26 août 2026.
 * Une valeur illisible (date mal formée, nombre négatif) est IGNORÉE plutôt que
 * propagée : une faute de frappe dans une variable Vercel ne doit pas remettre
 * l'objectif à zéro ni faire disparaître l'échéance.
 */
export interface CadreSprint {
  objectifCents: number;
  /** Début du sprint, ISO (YYYY-MM-DD) — origine des cumuls. */
  debut: string;
  /** Fin du sprint, ISO (YYYY-MM-DD). */
  deadline: string;
  cibleContactsJour: number;
}

/** La campagne réelle : 100 nouvelles entreprises par jour, du 17 au 26 août. */
export const CADRE_PAR_DEFAUT: CadreSprint = {
  objectifCents: 200_000,
  debut: "2026-08-17",
  deadline: "2026-08-26",
  cibleContactsJour: 100,
};

/** Les noms des quatre variables, réunis pour qu'on puisse les documenter d'un bloc. */
export const VARIABLES_SPRINT = {
  objectifCents: "SPRINT_OBJECTIF_CENTS",
  debut: "SPRINT_DEBUT",
  deadline: "SPRINT_DEADLINE",
  cibleContactsJour: "SPRINT_CIBLE_CONTACTS_JOUR",
} as const;

/** Un jour ISO réel, ou `null`. `2026-08-32` a la bonne forme mais n'existe pas. */
const jourIso = (v: string | undefined): string | null => {
  const s = (v ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s;
};

/** Un entier strictement positif, ou `null` — un objectif nul ferait 100 % dès le départ. */
const entierPositif = (v: string | undefined): number | null => {
  const n = Number((v ?? "").trim());
  return Number.isFinite(n) && Number.isInteger(n) && n > 0 ? n : null;
};

export function lireCadreSprint(env: Record<string, string | undefined>): CadreSprint {
  const debut = jourIso(env[VARIABLES_SPRINT.debut]) ?? CADRE_PAR_DEFAUT.debut;
  const deadline = jourIso(env[VARIABLES_SPRINT.deadline]) ?? CADRE_PAR_DEFAUT.deadline;
  return {
    objectifCents: entierPositif(env[VARIABLES_SPRINT.objectifCents]) ?? CADRE_PAR_DEFAUT.objectifCents,
    debut,
    // Une échéance ANTÉRIEURE au début n'est pas un sprint : on garde la date de
    // début, `joursRestants` rendra 0 et l'écran dira « terminé » — ce qui est
    // vrai — au lieu d'afficher un intervalle à l'envers.
    deadline: deadline < debut ? debut : deadline,
    cibleContactsJour:
      entierPositif(env[VARIABLES_SPRINT.cibleContactsJour]) ?? CADRE_PAR_DEFAUT.cibleContactsJour,
  };
}

/**
 * La cible de contacts du jour, lue dans les quotas de l'agent.
 *
 * `agent_settings.quotas_demarchage` porte déjà les quotas par canal
 * (`{"call":20,"whatsapp":60,"linkedin":20}`) : leur SOMME est le nombre de
 * prospects que l'agent doit toucher dans la journée. La lire là plutôt que de
 * la redéclarer garantit que l'écran sprint et la file de tâches ne peuvent pas
 * annoncer deux chiffres différents — c'est le même réglage, pas une copie.
 *
 * ET C'EST `normaliseQuotas` QUI LE LIT, pas une somme maison. Une somme brute
 * additionnait ce que la file, elle, refuse : un canal hors des trois canaux
 * plafonnés, une valeur au-delà du plafond de saisie. Surtout, elle ignorait la
 * fusion sur le défaut — `{"whatsapp":60}` donnait « cible 60 » ici pendant que
 * la file en planifiait 100 (60 WhatsApp + les 20 appels et 20 LinkedIn restés
 * au défaut). Deux écrans, deux chiffres, un seul réglage : exactement ce que
 * cette fonction prétendait empêcher.
 *
 * Renvoie `null` (et non 0) quand rien n'est réglé : l'appelant retombe alors
 * sur la variable d'environnement. Un total nul serait un quota de zéro appel,
 * pas une absence de réglage.
 */
export function cibleContactsDepuisQuotas(quotas: unknown): number | null {
  const cadence = normaliseQuotas(quotas);
  if (!cadence) return null;
  const total = Object.values(cadence).reduce((somme, n) => somme + n, 0);
  return total > 0 ? total : null;
}

export interface SprintCounter {
  /** Réalisé aujourd'hui. */
  today: number;
  /** Cumul depuis le début du sprint. */
  total: number;
  /** Cible quotidienne, quand il y en a une. */
  targetToday?: number;
}

export interface SprintState {
  objectifCents: number;
  encaisseCents: number;
  /** Date de fin du sprint, ISO (YYYY-MM-DD). */
  deadline: string;
  joursRestants: number;
  compteurs: Record<string, SprintCounter>;
}

/** Part de l'objectif atteinte, bornée à 1 — jamais au-delà de 100 %. */
export function progression(encaisseCents: number, objectifCents: number): number {
  if (objectifCents <= 0) return 0;
  return Math.max(0, Math.min(1, encaisseCents / objectifCents));
}

/**
 * Jours pleins restants avant l'échéance incluse. 0 le dernier jour, jamais
 * négatif : un sprint dépassé affiche « terminé », pas « -3 jours ».
 */
export function joursRestants(deadlineIso: string, now: Date): number {
  const end = Date.parse(`${deadlineIso}T23:59:59Z`);
  if (Number.isNaN(end)) return 0;
  const diff = end - now.getTime();
  return diff <= 0 ? 0 : Math.ceil(diff / 86400000);
}

/**
 * Ce qu'il reste à encaisser par jour pour tenir l'objectif. Renvoie null
 * quand l'objectif est atteint (il n'y a plus de rythme à tenir) — l'écran
 * doit féliciter, pas continuer à réclamer.
 */
export function rythmeRequisCents(encaisseCents: number, objectifCents: number, jours: number): number | null {
  const reste = objectifCents - encaisseCents;
  if (reste <= 0) return null;
  return Math.ceil(reste / Math.max(1, jours));
}
