/**
 * Rôle sémantique d'une étape de pipeline.
 *
 * POURQUOI
 * Le portail agent reconnaissait ses étapes par NOM exact : `"Première
 * approche"`, `"Contacté (appelé)"`, `"RDV calé"`, `"Client signé"`, `"Perdu"`.
 * Ces libellés n'existent que dans le pipeline « Agent SAMA » (créés par
 * `sql/20260603_agent_portal_ownership.sql` et renommés par
 * `sql/20260722_agent_pipeline_premiere_approche.sql`). Depuis qu'une affaire
 * attribuée reste dans SON pipeline d'origine, un deal de « Streak Mars/Avril »
 * ou du pipeline par défaut ne matche plus rien : les avancements automatiques
 * deviennent des no-op silencieux et les KPI tombent à zéro.
 *
 * On raisonne donc par MOTIF, comme le fait déjà `isLostStage` dans
 * `src/lib/sales-pipeline/stages.ts`, et toujours à l'intérieur du pipeline de
 * l'affaire concernée.
 */

export type StageRole =
  | "nouveau"
  | "approche"
  | "contacte"
  | "interesse"
  | "rdv"
  | "propo"
  | "signe"
  | "perdu"
  | "autre";

/** Étape minimale : tout ce dont la classification a besoin. */
export interface StageLike {
  id: number;
  nom: string | null;
  ordre?: number | null;
}

/**
 * L'ordre des tests compte : le plus spécifique gagne. « Client signé » contient
 * « client » et « signé » — c'est bien `signe`. « RDV de vente 2 » est un `rdv`,
 * pas une `propo`.
 */
export function stageRole(nom: string | null | undefined): StageRole {
  const n = (nom ?? "").toLowerCase();
  if (!n) return "autre";
  if (/perdu|abandon|refus|annul/.test(n)) return "perdu";
  if (/sign|gagn|acompte|vendu|closed won/.test(n)) return "signe";
  if (/rdv|rendez/.test(n)) return "rdv";
  if (/propo|devis|offre|estimation/.test(n)) return "propo";
  if (/int[ée]ress|chaud/.test(n)) return "interesse";
  if (/approche|premier contact/.test(n)) return "approche";
  if (/contact|appel|relance|[ée]change|suivi/.test(n)) return "contacte";
  if (/nouveau|lead|qualifi|d[ée]march|entrant/.test(n)) return "nouveau";
  return "autre";
}

/** La première étape (au sens de `ordre`) qui porte l'un des rôles demandés. */
export function findStageByRole<T extends StageLike>(stages: T[], ...roles: StageRole[]): T | null {
  const ordered = [...stages].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
  for (const role of roles) {
    const hit = ordered.find((s) => stageRole(s.nom) === role);
    if (hit) return hit;
  }
  return null;
}

/**
 * Teinte sémantique d'une étape, indépendante du pipeline. Remplace le
 * dictionnaire indexé par les noms d'Agent SAMA, qui renvoyait tout le reste au
 * gris — un « Signature » de Streak était affiché comme une étape neutre.
 */
const ROLE_TINT: Record<StageRole, string> = {
  nouveau: "var(--text-3)",
  approche: "#2B7FB8",
  contacte: "#2A6FDB",
  interesse: "#C8881F",
  rdv: "#A24E86",
  propo: "#E2552B",
  signe: "#1F8A5B",
  perdu: "#B5322F",
  autre: "var(--text-3)",
};

export const roleTint = (nom: string | null | undefined): string => ROLE_TINT[stageRole(nom)];
