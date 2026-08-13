// globe-scale.ts — l'échelle du globe (hauteur du relief + nuances de bleu),
// isolée du rendu three.js pour être testable sans WebGL et pour que la
// légende affichée dans radar-tab.tsx lise EXACTEMENT les mêmes constantes que
// le moteur de rendu. Une légende qui annonce une échelle que le rendu
// n'applique pas est une information fabriquée : ce module est ce qui empêche
// les deux de diverger.

/** Relief de fond des terres émergées, sans aucune visite (km). */
export const BASE_KM = 26;

/**
 * Relief ajouté par visite, en km — LINÉAIRE et volontairement exact : la
 * légende annonce « +100 km par visite », donc 3 visites font exactement
 * 300 km de plus. Toute courbe d'atténuation rendrait cette légende fausse.
 */
export const PER_VISIT_KM = 100;

/** Plafond de sécurité (~30 visites) : au-delà, le cube dépasserait l'échelle du globe. */
export const MAX_KM = 3000;

/** Hauteur de relief, en km, pour un poids de visites donné. */
export function reliefKm(visits: number): number {
  return Math.min(MAX_KM, BASE_KM + PER_VISIT_KM * Math.max(0, visits));
}

/**
 * Six nuances de bleu, de la plus claire à la plus foncée.
 *
 * La nuance d'une ville vient de sa PART des visites totales — pas d'une
 * normalisation relative à la ville la plus active. Deux villes à 5 % gardent
 * donc la même nuance, que la première ville soit à 10 % ou à 60 %, et une
 * ville ne pâlit pas juste parce qu'une autre a décollé.
 */
export const SHADES = ["#CFE0F6", "#A8C8EF", "#7FADE8", "#5590DF", "#2F7AE0", "#123E86"];

/**
 * Bornes de part de visites entre deux nuances. 10 % et plus = nuance la plus
 * foncée. Il y a SHADES.length - 1 bornes pour SHADES.length nuances.
 */
export const SHARE_STOPS = [0.01, 0.02, 0.035, 0.06, 0.1];

/**
 * En dessous de ce total, répartir six nuances n'a aucun sens statistique
 * (avec 3 visites, une ville « pèse » 33 % par accident). Tant qu'on est sous
 * ce seuil, tout ce qui a reçu une visite s'affiche à la nuance la plus
 * foncée, et la légende le dit explicitement.
 */
export const LOW_VOLUME_TOTAL = 25;

/** Index de nuance (0 = plus clair, SHADES.length - 1 = plus foncé). */
export function shadeIndex(share: number, lowVolume: boolean): number {
  if (lowVolume) return SHADES.length - 1;
  let i = 0;
  while (i < SHARE_STOPS.length && share >= SHARE_STOPS[i]) i++;
  return i;
}
