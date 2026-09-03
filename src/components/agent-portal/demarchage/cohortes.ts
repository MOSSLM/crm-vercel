import type { EtatSite } from "@/lib/agent-portal/etat-site";
import type { DemCohorte } from "./types";

/**
 * Les deux cohortes de la campagne d'août, et ce qu'elles changent au moment
 * de décrocher.
 *
 * UNE TROISIÈME DIMENSION, PAS UN SIGNAL DE PLUS
 * La barre de filtres de la file mélange déjà deux vocabulaires (un canal OU un
 * signal) et le commentaire de la page rappelle qu'ils ne se mélangent pas. La
 * cohorte n'est ni l'un ni l'autre : ce n'est pas une manière de travailler la
 * journée, c'est une propriété de l'ENTREPRISE, décidée le jour où on l'a
 * démarchée et jamais modifiée ensuite. Elle vit donc dans sa propre barre, avec
 * son propre « toutes », et elle se propage au serveur (`?cohorte=…`) là où les
 * deux autres filtrent en mémoire.
 *
 * `argument` n'est pas de la décoration : un menuisier qui a un site pourri et
 * un maçon qui n'a rien ne s'abordent pas pareil, et ce n'est pas le même
 * document qu'on leur envoie. C'est la seule chose qu'on ait besoin de relire
 * en composant le numéro.
 */
export type CohorteInfo = {
  /**
   * Sur une ligne de file, dans 286 px : trois mots au maximum.
   *
   * ⚠️ IL COMMENCE PAR « CLASSÉ », ET CE N'EST PAS DU STYLE. La cohorte porte
   * un nom qui décrit le site du prospect — « sans site » — et la ligne porte
   * juste à côté l'état du site AUJOURD'HUI. Les deux se lisaient comme deux
   * affirmations concurrentes : « a un site » et « sans site » côte à côte, sur
   * la même ligne, sans que rien ne dise que l'une date d'août. Le grief est
   * arrivé tel quel. « classé » ramène l'étiquette à ce qu'elle est — un
   * rangement, pas un constat — et la contradiction redevient lisible.
   */
  court: string;
  /** En toutes lettres — infobulles et en-tête de fiche. */
  long: string;
  /** Ce qui change dans l'approche, et le document qui va avec. */
  argument: string;
  /**
   * L'état du site du jour qui CONTREDIT ce classement. La cohorte est figée au
   * jour du démarchage et n'est jamais reprise ; l'enrichissement, lui, continue
   * de tourner. Mesuré le 03/09/2026 sur la file vivante : **70 des 74 lignes
   * classées « sans site » portent une URL** — dont 63 sur un domaine propre
   * (`3therm-habitat.fr`) et 7 sur une page gratuite. L'étiquette a donc tort
   * dans 94 % des cas où elle s'affiche, et c'est l'URL qui fait foi.
   */
  contreditPar: EtatSite;
};

/** L'ordre d'affichage : A puis B, comme la campagne les a démarchées. */
export const COHORTE_ORDER: readonly DemCohorte[] = ["A_site_faible", "B_sans_site"] as const;

export const COHORTE_INFO: Record<DemCohorte, CohorteInfo> = {
  A_site_faible: {
    court: "classé site faible",
    long: "Cohorte A — classé « a un site, mais faible » au démarchage",
    argument:
      "Il a déjà un site : on ne lui vend pas l'idée d'en avoir un, on lui montre ce que le sien lui coûte. Le document, c'est l'audit.",
    contreditPar: "absent",
  },
  B_sans_site: {
    court: "classé sans site",
    long: "Cohorte B — classé « aucun site » au démarchage",
    argument:
      "Il n'a rien en ligne : rien à comparer, donc rien à critiquer. On lui montre le sien, déjà debout. Le document, c'est le site démo.",
    contreditPar: "present",
  },
};

/**
 * Ce classement est-il DÉMENTI par l'état du site d'aujourd'hui ?
 *
 * `inconnu` ne dément rien : « personne n'a regardé » n'est pas « il a un
 * site », et traiter les 34 244 fiches jamais vérifiées comme des démentis
 * ferait clignoter un avertissement sur toute la file (cf. `etat-site.ts`).
 */
export function cohorteContredite(
  cohorte: DemCohorte | null | undefined,
  etatSite: EtatSite | null | undefined,
): boolean {
  return cohorte != null && etatSite != null && COHORTE_INFO[cohorte].contreditPar === etatSite;
}

/**
 * L'ARGUMENT À RELIRE EN COMPOSANT LE NUMÉRO — corrigé par l'état du jour.
 *
 * L'argument de la cohorte B dit « il n'a rien en ligne, on lui montre le
 * sien ». Sur 70 des 74 lignes qui le portent, c'est faux : le prospect a un
 * site, et l'agent le découvre au téléphone après l'avoir affirmé. Un script
 * qu'on lit à voix haute ne peut pas être plus périmé que la fiche à côté.
 *
 * On ne devine PAS l'autre argument à la place : « il a une URL » ne dit pas
 * que son site est faible, et l'audit qui va avec la cohorte A n'existe pas
 * forcément. On dit ce qu'on sait, et on envoie regarder.
 */
export function argumentDeCohorte(
  cohorte: DemCohorte | null | undefined,
  etatSite: EtatSite | null | undefined,
): string | null {
  if (!cohorte) return null;
  if (!cohorteContredite(cohorte, etatSite)) return COHORTE_INFO[cohorte].argument;
  return cohorte === "B_sans_site"
    ? "⚠ Classé « sans site » en août, mais sa fiche porte une URL aujourd'hui : ne lui dis pas qu'il n'a rien en ligne. Ouvre son site avant d'appeler."
    : "⚠ Classé « site faible » en août, mais l'absence de site a été CONSTATÉE depuis : il n'y a pas de site à auditer.";
}

/** Reconnaît une cohorte dans une valeur venue de la base ou de l'URL. */
export const estCohorte = (v: unknown): v is DemCohorte =>
  typeof v === "string" && (COHORTE_ORDER as readonly string[]).includes(v);

/** Combien de lignes portent chaque cohorte — ce que les pastilles annoncent. */
export function countByCohorte(
  tasks: readonly { cohorte?: DemCohorte | null }[],
): Record<DemCohorte, number> {
  const par: Record<DemCohorte, number> = { A_site_faible: 0, B_sans_site: 0 };
  for (const t of tasks) {
    if (t.cohorte) par[t.cohorte] += 1;
  }
  return par;
}
