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
  /** Sur une ligne de file, dans 286 px : deux mots au maximum. */
  court: string;
  /** En toutes lettres — infobulles et en-tête de fiche. */
  long: string;
  /** Ce qui change dans l'approche, et le document qui va avec. */
  argument: string;
};

/** L'ordre d'affichage : A puis B, comme la campagne les a démarchées. */
export const COHORTE_ORDER: readonly DemCohorte[] = ["A_site_faible", "B_sans_site"] as const;

export const COHORTE_INFO: Record<DemCohorte, CohorteInfo> = {
  A_site_faible: {
    court: "site faible",
    long: "Cohorte A — a un site, mais faible",
    argument:
      "Il a déjà un site : on ne lui vend pas l'idée d'en avoir un, on lui montre ce que le sien lui coûte. Le document, c'est l'audit.",
  },
  B_sans_site: {
    court: "sans site",
    long: "Cohorte B — aucun site",
    argument:
      "Il n'a rien en ligne : rien à comparer, donc rien à critiquer. On lui montre le sien, déjà debout. Le document, c'est le site démo.",
  },
};

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
