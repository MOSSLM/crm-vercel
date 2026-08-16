import type { CleEtage } from "@/lib/entonnoir/etages";

/**
 * Les partis pris d'affichage de l'entonnoir, en un seul endroit — les deux
 * blocs de l'écran doivent peindre le même étage de la même façon.
 *
 * UN SEUL BLEU, DE PLUS EN PLUS DENSE
 * Huit couleurs différentes feraient un arc-en-ciel où l'œil chercherait un
 * sens qui n'existe pas : l'ordre des étages EST le sens. On garde donc l'azur
 * de marque et on le densifie à mesure que l'entonnoir se resserre, jusqu'au
 * vert de « Payée » — la seule étape qui change de nature.
 */
const OPACITE: Record<CleEtage, number> = {
  ciblee: 0.35,
  touchee: 0.45,
  repondu: 0.55,
  document_ouvert: 0.65,
  conversation: 0.75,
  offre_envoyee: 0.85,
  decision_attendue: 0.95,
  payee: 1,
};

export const teinteEtage = (cle: CleEtage): string =>
  cle === "payee" ? "var(--ok)" : "var(--primary)";

export const opaciteEtage = (cle: CleEtage): number => OPACITE[cle] ?? 0.6;

/** « 12 % », « 4,5 % », « — ». Le pourcentage se lit à l'unité près, pas au centième. */
export function pourcentage(v: number | null | undefined): string {
  if (v == null) return "—";
  const arrondi = Math.abs(v) >= 10 ? Math.round(v) : Math.round(v * 10) / 10;
  return `${arrondi.toLocaleString("fr-FR")} %`;
}

/** Un entier lisible d'un coup d'œil, jamais `NaN`. */
export const nombre = (v: number | null | undefined): string =>
  v == null ? "—" : v.toLocaleString("fr-FR");
