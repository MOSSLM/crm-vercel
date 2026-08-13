/**
 * Sprint commercial : un objectif en euros, une échéance, et les compteurs
 * qui disent où on en est — aujourd'hui et depuis le début.
 *
 * La logique de classement des étapes vit ici, pure et testée, parce qu'elle
 * décide de ce qui compte comme « encaissé » et comme « vente ». Se tromper
 * là-dessus, c'est afficher un chiffre d'affaires qui n'existe pas.
 */

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
