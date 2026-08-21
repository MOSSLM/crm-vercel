/**
 * Le contenu d'un lot : où en est CHAQUE entreprise, et pourquoi elle n'avance
 * pas.
 *
 * POURQUOI CET ÉCRAN EXISTE. La couverture d'un lot dit « 206 sans constat ».
 * Elle ne dit pas laquelle, ni si l'entreprise attend un site à fabriquer, une
 * adresse à vérifier, ou simplement que la séquence est en brouillon. Or ces
 * trois-là ne se corrigent pas du même endroit : la première est du travail de
 * production, la deuxième une donnée à collecter, la troisième un interrupteur.
 * Les afficher pareil, c'est ce qui a laissé 59 inscriptions dormir des
 * semaines sans que personne ne voie la différence.
 *
 * DEUX CAUSES DE BLOCAGE, ET IL FAUT LES DEUX. Le régulateur en connaît une —
 * `hold_reason`, dont `holdReasonLabel` porte déjà les libellés, et il reste la
 * seule source pour ceux-là. L'autre ne s'écrit nulle part : l'entreprise
 * manque d'une pièce qu'aucun garde n'a encore réclamée parce qu'elle n'est pas
 * arrivée à l'étape qui la réclame. Une inscription garée à l'étape 0 sans démo
 * n'a AUCUN motif en base ; elle est pourtant bloquée, et pour trois mois.
 *
 * Module pur : les libellés se testent sans base ni écran.
 */

import { holdReasonLabel, type HoldReason } from "@/lib/automations/regulator";
import { AXES, type CleAxe } from "@/lib/lots/couverture";

/** Une ligne de `contenu_du_lot()`, telle que la base la rend. */
export interface LigneContenu {
  entreprise_id: number;
  nom: string | null;
  ville: string | null;
  a_siret: boolean;
  a_donnees: boolean;
  a_constat: boolean;
  a_demo: boolean;
  a_audit: boolean;
  proprietaire: string | null;
  sequence: string | null;
  etape: string | null;
  etape_genre: string | null;
  rang: number | null;
  inscription_statut: string | null;
  hold_reason: string | null;
  next_run_at: string | null;
  garee: boolean;
  tache_genre: string | null;
  tache_echeance: string | null;
}

/** L'état d'avancement d'une entreprise, en un mot. */
export type Marche = "en_file" | "a_faire" | "attente" | "garee" | "bloquee" | "hors_sequence";

export interface Blocage {
  marche: Marche;
  /** Ce qui se passe, en français, pour un humain qui survole la ligne. */
  libelle: string;
  /** Le geste qui débloque — vide quand il n'y a rien à débloquer. */
  quoiFaire: string;
}

/** Les pièces qui manquent à cette entreprise, dans l'ordre du plan. */
export function piecesManquantes(l: LigneContenu): CleAxe[] {
  const presence: Record<CleAxe, boolean> = {
    siret: l.a_siret,
    donnees: l.a_donnees,
    constat: l.a_constat,
    demo: l.a_demo,
    audit: l.a_audit,
    proprietaire: !!l.proprietaire,
    sequence: !!l.sequence,
  };
  return AXES.filter((a) => !presence[a.cle]).map((a) => a.cle);
}

/**
 * Pourquoi cette entreprise n'avance pas.
 *
 * L'ORDRE DE LECTURE COMPTE. Une tâche ouverte l'emporte sur tout : elle
 * attend un geste d'agent aujourd'hui, et c'est la seule chose à dire. Vient
 * ensuite le motif du régulateur, qui est un FAIT écrit en base. La pièce
 * manquante n'est regardée qu'en dernier, parce qu'elle est une DÉDUCTION : la
 * poser en premier ferait dire « il manque la démo » d'une inscription qui, de
 * toute façon, est retenue par une séquence en brouillon.
 */
export function blocageDe(l: LigneContenu): Blocage {
  if (!l.sequence) {
    return {
      marche: "hors_sequence",
      libelle: "hors séquence",
      quoiFaire: "L'inscrire — hors séquence, elle ne produit aucune tâche.",
    };
  }

  if (l.tache_genre) {
    return {
      marche: "a_faire",
      libelle: `tâche ouverte · ${l.tache_genre}`,
      quoiFaire: "À faire dans Ma journée.",
    };
  }

  if (l.hold_reason) {
    const motif = holdReasonLabel(l.hold_reason as HoldReason);
    return {
      marche: l.hold_reason === "awaiting_reply" ? "attente" : "bloquee",
      libelle: motif,
      quoiFaire: QUOI_FAIRE[l.hold_reason] ?? "",
    };
  }

  if (l.garee) {
    const manquantes = piecesManquantes(l);
    const premiere = manquantes.length ? AXES.find((a) => a.cle === manquantes[0]) : null;
    return {
      marche: "garee",
      libelle: premiere ? `garée — il manque : ${premiere.colonne.toLowerCase()}` : "garée à la main",
      quoiFaire: premiere ? `${premiere.geste} · ${premiere.ou}` : "La remettre en file.",
    };
  }

  return { marche: "en_file", libelle: "en file", quoiFaire: "" };
}

/**
 * Ce qu'un humain peut faire de ce motif — et rien quand il n'y a rien à faire.
 *
 * On ne remplit QUE les motifs sur lesquels un geste existe. Un « plafond du
 * jour atteint » se règle tout seul demain matin ; y écrire un conseil ferait
 * chercher une action là où il faut juste attendre, et noierait les trois
 * motifs qui demandent vraiment quelque chose.
 */
const QUOI_FAIRE: Record<string, string> = {
  sequence_paused: "Activer la séquence — Automatisations → Séquences.",
  global_pause: "Sortir le régulateur de pause — Automatisations → Régulateur.",
  test_hold: "Quitter le mode test — Automatisations → Régulateur.",
  no_email: "Trouver l'adresse, ou basculer ce prospect sur WhatsApp.",
  email_invalid: "Corriger l'adresse sur la fiche.",
  demo_manquante: "Fabriquer et publier sa démo — Production.",
  lien_manquant: "Préparer son audit — Marketing pipeline.",
  awaiting_reply: "Déclarer la réponse si le prospect a répondu ailleurs.",
};

/** Les marches, dans l'ordre où on veut les voir en tête de tableau. */
const RANG: Record<Marche, number> = {
  a_faire: 0,
  bloquee: 1,
  garee: 2,
  attente: 3,
  hors_sequence: 4,
  en_file: 5,
};

/**
 * Ce qui demande une action d'abord, ce qui tourne tout seul ensuite.
 *
 * Un tableau trié par nom d'entreprise oblige à lire cinq cents lignes pour
 * trouver les trois qui coincent. C'est l'inverse de ce qu'on vient y chercher.
 */
export const parUrgence = <T extends { blocage: Blocage; nom: string | null }>(
  lignes: readonly T[],
): T[] =>
  [...lignes].sort(
    (a, b) =>
      RANG[a.blocage.marche] - RANG[b.blocage.marche] ||
      (a.nom ?? "").localeCompare(b.nom ?? "", "fr"),
  );
