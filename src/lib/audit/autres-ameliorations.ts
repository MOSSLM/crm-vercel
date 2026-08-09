import { AUDIT_ISSUE_CATALOG } from "@/data/auditIssues";
import type { AuditLu } from "@/lib/audit-site/lecture";

/**
 * « Et 11 autres améliorations possibles » — le décompte, jamais l'estimation.
 *
 * POURQUOI CETTE LIGNE EXISTE. Un audit qui aligne six griefs se lit comme un
 * réquisitoire et dilue son propos ; trois problèmes bien démontrés convainquent.
 * Mais s'arrêter à trois donne l'impression d'un examen superficiel. La ligne
 * résout les deux : on argumente sur trois, on prouve la profondeur par un
 * nombre.
 *
 * POURQUOI CE N'EST PAS UN CHIFFRE D'AMBIANCE. `X` est le nombre de preuves
 * réellement en échec que les cartes retenues ne couvrent pas. Chacune porte son
 * libellé, sa valeur mesurée et son seuil. Si le prospect demande « lesquelles ? »,
 * on les nomme une par une — c'est ce qui sépare cette ligne d'un argument de
 * brochure, et c'est gratuit puisque la mesure est déjà faite.
 */

/**
 * Les deux façons de rendre le même document.
 *
 * `court` part par WhatsApp : trois cartes et un nombre. `complet` se déplie en
 * rendez-vous : les mêmes cartes, et le détail de tout ce que le nombre
 * résumait. Ce n'est PAS deux contenus — c'est une option de rendu sur un seul
 * `audits.content`, pour la même raison que le PDF et le rapport mobile en
 * partagent un : deux documents finissent toujours par diverger.
 */
export type AuditVariante = 'court' | 'complet';

/** Une amélioration non retenue, telle qu'on peut la défendre : chiffrée. */
export interface AmeliorationRestante {
  cle: string;
  libelle: string;
  /** Ce qu'on a constaté, déjà formaté. */
  valeur: string | null;
  /** Le seuil qui juge. `null` sur un signal binaire. */
  seuil: string | null;
}

export interface AutresAmeliorations {
  /** Le nombre à afficher. Zéro ⇒ ne rien afficher du tout. */
  nombre: number;
  /** Le détail — résumé par le nombre en version courte, déplié en complète. */
  entrees: AmeliorationRestante[];
}

const VIDE: AutresAmeliorations = { nombre: 0, entrees: [] };

/**
 * Les preuves en échec qui ne sont derrière aucune des cartes retenues.
 *
 * On part des `declencheurs` du catalogue : une carte « couvre » les preuves qui
 * l'ont déclenchée. Tout le reste est du travail réel, mesuré, et non raconté.
 */
export function autresAmeliorations(
  audit: AuditLu | null | undefined,
  clesRetenues: readonly string[],
): AutresAmeliorations {
  if (!audit || audit.injoignable) return VIDE;

  // Les preuves déjà défendues par une carte affichée.
  const couvertes = new Set<string>();
  for (const cle of clesRetenues) {
    const constat = AUDIT_ISSUE_CATALOG.find((c) => c.key === cle);
    for (const d of constat?.declencheurs ?? []) {
      for (const p of d.preuves) couvertes.add(p);
    }
  }

  const entrees: AmeliorationRestante[] = [];
  const vues = new Set<string>();

  for (const axe of audit.axes) {
    for (const preuve of axe.preuves) {
      // Seules les preuves en échec comptent. Un « moyen » n'est pas une
      // amélioration qu'on peut chiffrer devant quelqu'un, et un « inconnu »
      // n'est rien du tout.
      if (preuve.verdict !== "probleme") continue;
      if (couvertes.has(preuve.cle) || vues.has(preuve.cle)) continue;
      vues.add(preuve.cle);
      entrees.push({
        cle: preuve.cle,
        libelle: preuve.libelle,
        valeur: preuve.valeur,
        seuil: preuve.seuil,
      });
    }
  }

  return { nombre: entrees.length, entrees };
}

/**
 * Ordonne des constats du plus fort au plus faible argument.
 *
 * Une fréquence n'est pas une priorité. Le critère est le POIDS de la preuve la
 * plus lourde qui a déclenché le constat : un serveur à 3,4 secondes face à un
 * seuil de 800 ms passe devant une méta-description trop courte, toujours. À
 * défaut de mesure, on garde l'ordre du catalogue — arbitraire, mais stable.
 */
export function classerParForce(
  cles: readonly string[],
  audit: AuditLu | null | undefined,
): string[] {
  const poids = new Map<string, number>();
  for (const axe of audit?.axes ?? []) {
    for (const p of axe.preuves) {
      if (p.verdict === "probleme") poids.set(p.cle, Math.max(poids.get(p.cle) ?? 0, p.poids));
    }
  }

  const forceDe = (cle: string): number => {
    const constat = AUDIT_ISSUE_CATALOG.find((c) => c.key === cle);
    let max = 0;
    for (const d of constat?.declencheurs ?? []) {
      for (const p of d.preuves) max = Math.max(max, poids.get(p) ?? 0);
    }
    return max;
  };

  const rang = new Map(AUDIT_ISSUE_CATALOG.map((c, i) => [c.key, i]));
  return [...cles].sort(
    (a, b) => forceDe(b) - forceDe(a) || (rang.get(a) ?? 99) - (rang.get(b) ?? 99),
  );
}

/** La phrase telle qu'elle s'affiche, ou `null` s'il n'y a rien à annoncer. */
export function phraseAutresAmeliorations(a: AutresAmeliorations): string | null {
  if (a.nombre <= 0) return null;
  return a.nombre === 1
    ? "Et 1 autre amélioration possible, relevée par l’analyse."
    : `Et ${a.nombre} autres améliorations possibles, relevées par l’analyse.`;
}

/** L'intitulé de l'annexe, en version complète. */
export function titreDetailAmeliorations(a: AutresAmeliorations): string {
  return a.nombre === 1
    ? "Le point restant, en détail"
    : `Les ${a.nombre} points restants, en détail`;
}

/**
 * Une ligne d'annexe : « Adresse canonique déclarée — absente (attendu : présente) ».
 * Le seuil n'est répété que s'il apporte quelque chose : sur un signal binaire
 * il est nul, et « absente (attendu : ) » n'aiderait personne.
 */
export function ligneAmelioration(e: AmeliorationRestante): string {
  const constat = e.valeur ?? "à corriger";
  return e.seuil ? `${e.libelle} — ${constat} (seuil : ${e.seuil})` : `${e.libelle} — ${constat}`;
}
