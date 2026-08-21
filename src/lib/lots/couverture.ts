/**
 * La couverture d'un lot : ce qui manque à ces entreprises, et le geste qui le
 * comble.
 *
 * LE PROBLÈME. On sait travailler une fiche à la fois — le marketing pipeline
 * le fait très bien. On ne sait pas répondre à « j'ai cinq cents entreprises,
 * qu'est-ce qui leur manque et par quoi je commence ». C'est pourtant la seule
 * question qui compte quand on prépare une campagne, et elle est comparative :
 * lequel de mes lots est le plus près d'être attaquable.
 *
 * UN LOT, PAS UN SEGMENT — la distinction est la doctrine du projet, et elle
 * n'est pas théorique. Un segment est une requête vivante : son effectif bouge
 * à mesure que l'enrichissement travaille, et c'est même le signe qu'il a
 * marché. Lancer un traitement de trois heures sur une population qui change en
 * cours de route donne un résultat que personne ne peut reproduire, et un
 * dénominateur qui bouge sous la mesure. Le segment sert à FABRIQUER le lot ;
 * c'est le lot qu'on mesure et qu'on traite.
 *
 * L'ORDRE DES AXES EST L'ORDRE DU PLAN DE LISSAGE, et ce n'est pas cosmétique :
 * sans SIRET on ne sait pas qui c'est, sans identité on ne cherche pas son
 * site, sans constat on ne sait pas quoi lui promettre — l'accroche « création »
 * et l'accroche « refonte » ne s'envoient pas au même monde —, sans démo on n'a
 * rien à lui montrer. C'est cet ordre qui permet de désigner LE prochain geste
 * plutôt que d'afficher sept trous côte à côte.
 *
 * Module pur : aucun accès base, aucun React. C'est ce qui permet de tester
 * l'ordre des gestes sans monter un écran ni peupler un lot.
 */

export type CleAxe =
  | "siret"
  | "donnees"
  | "constat"
  | "demo"
  | "audit"
  | "proprietaire"
  | "sequence";

export interface AxeCouverture {
  cle: CleAxe;
  /** L'en-tête de colonne. Court : il y en a sept côte à côte. */
  colonne: string;
  /** Ce que la colonne compte, en une phrase. */
  aide: string;
  /** Le geste qui comble le trou, tel qu'il s'écrit sur un bouton. */
  geste: string;
  /** Où ce geste se lance dans le CRM. */
  ou: string;
}

/** Les sept axes, dans l'ordre où ils doivent être comblés. */
export const AXES: readonly AxeCouverture[] = [
  {
    cle: "siret",
    colonne: "SIRET",
    aide: "L'entreprise est rapprochée du registre. Sans lui, on ne sait pas de qui on parle.",
    geste: "Rapprocher au registre",
    ou: "Lissage — passe 1",
  },
  {
    cle: "donnees",
    colonne: "Données",
    aide: "Chiffre d'affaires, effectif, dirigeants — lus des données publiques, jamais des colonnes libres.",
    geste: "Charger les données publiques",
    ou: "Lissage — passe 1",
  },
  {
    cle: "constat",
    colonne: "Site constaté",
    aide: "On a REGARDÉ si elle a un site. « Vérifié sans site » et « on ne sait pas » sont deux populations, jamais le même vide.",
    geste: "Chercher sa présence web",
    ou: "Lissage — passes 2 et 3",
  },
  {
    cle: "demo",
    colonne: "Démo",
    aide: "Un site de démonstration publié, avec sa capture. C'est ce que la plaquette montre.",
    geste: "Fabriquer les démos",
    ou: "Production",
  },
  {
    cle: "audit",
    colonne: "Audit",
    aide: "Un audit validé. Ne concerne que les entreprises qui ont déjà un site à mesurer.",
    geste: "Préparer les audits",
    ou: "Marketing pipeline",
  },
  {
    cle: "proprietaire",
    colonne: "Attribuée",
    aide: "Un agent la porte. Sans propriétaire, elle ne remonte dans la journée de personne.",
    geste: "Attribuer à un agent",
    ou: "Pipeline commercial",
  },
  {
    cle: "sequence",
    colonne: "En séquence",
    aide: "Inscrite à une séquence. Hors séquence, elle ne produit aucune tâche — c'est la règle.",
    geste: "Mettre en séquence",
    ou: "Campagnes",
  },
] as const;

const PAR_CLE = new Map(AXES.map((a) => [a.cle, a] as const));

/** L'axe portant cette clé, ou `null` — jamais une exception sur une clé libre. */
export const axeDe = (cle: string): AxeCouverture | null => PAR_CLE.get(cle as CleAxe) ?? null;

/** Une ligne de `couverture_des_lots()`, telle que la base la rend. */
export interface LigneCouverture {
  lot_id: number | string;
  nom: string;
  note: string | null;
  cree_le: string;
  total: number | string;
  avec_siret: number | string;
  avec_donnees: number | string;
  avec_constat: number | string;
  avec_demo: number | string;
  avec_audit: number | string;
  avec_proprietaire: number | string;
  en_sequence: number | string;
}

export interface Couverture {
  lotId: number;
  nom: string;
  note: string | null;
  creeLe: string;
  total: number;
  /** Combien d'entreprises du lot sont couvertes, par axe. */
  couverts: Record<CleAxe, number>;
}

/**
 * PostgREST rend les `bigint` en nombre tant qu'ils tiennent, en chaîne
 * au-delà. Un compte lu comme chaîne ferait « 524 - "358" » = NaN, et une
 * colonne vide plutôt qu'un trou signalé.
 */
const nombre = (v: unknown): number => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
};

/** Normalise une ligne de la base. */
export function lireCouverture(l: LigneCouverture): Couverture {
  return {
    lotId: nombre(l.lot_id),
    nom: l.nom,
    note: l.note,
    creeLe: l.cree_le,
    total: nombre(l.total),
    couverts: {
      siret: nombre(l.avec_siret),
      donnees: nombre(l.avec_donnees),
      constat: nombre(l.avec_constat),
      demo: nombre(l.avec_demo),
      audit: nombre(l.avec_audit),
      proprietaire: nombre(l.avec_proprietaire),
      sequence: nombre(l.en_sequence),
    },
  };
}

/** Combien il en manque sur cet axe. Jamais négatif. */
export const manque = (c: Couverture, cle: CleAxe): number =>
  Math.max(0, c.total - (c.couverts[cle] ?? 0));

/**
 * La part couverte, de 0 à 1. Un lot VIDE rend 1 et non 0 : il ne manque rien
 * à personne, et l'afficher en rouge enverrait chercher un travail inexistant.
 */
export const taux = (c: Couverture, cle: CleAxe): number =>
  c.total === 0 ? 1 : (c.couverts[cle] ?? 0) / c.total;

/**
 * Le prochain geste : le PREMIER axe incomplet dans l'ordre du plan.
 *
 * Un seul, jamais sept. Un écran qui montre tous les trous à la fois laisse
 * l'humain choisir par quoi commencer — et il commencera par le plus visible,
 * pas par le plus utile. Chercher la présence web de mille entreprises qu'on
 * n'a pas encore rapprochées du registre, c'est chercher sur des noms faux.
 */
export function prochainGeste(c: Couverture): AxeCouverture | null {
  if (c.total === 0) return null;
  return AXES.find((a) => manque(c, a.cle) > 0) ?? null;
}

/** Les quatre axes qui font qu'un lot est démarchable. */
const PREPARATION = ["siret", "donnees", "constat", "demo"] as const;

/**
 * Le lot est-il prêt à démarcher ? Les quatre premiers axes suffisent :
 * l'audit ne concerne que ceux qui ont déjà un site, et l'attribution comme la
 * mise en séquence sont des gestes de lancement, pas de préparation.
 */
export const pretADemarcher = (c: Couverture): boolean =>
  c.total > 0 && PREPARATION.every((k) => manque(c, k) === 0);

/** L'avancement de préparation, de 0 à 1 — la moyenne des quatre axes. */
export const avancement = (c: Couverture): number =>
  PREPARATION.reduce((s, k) => s + taux(c, k), 0) / PREPARATION.length;

/**
 * Les lots du plus avancé au moins avancé, à égalité le plus gros d'abord.
 *
 * L'avancement est la MOYENNE des quatre axes, pas le nombre d'axes pleins :
 * un lot à qui il manque une seule démo sur cinq cents doit passer devant un
 * lot à qui il manque tout, même si aucun des deux n'a un axe complet.
 */
export const parAvancement = (lots: readonly Couverture[]): Couverture[] =>
  [...lots].sort((a, b) => avancement(b) - avancement(a) || b.total - a.total);
