/**
 * Géométrie de la grille de tuiles d'une recherche.
 *
 * Séparé du composant pour être testable sans DOM : c'est ici que se joue la
 * seule chose qui puisse rendre la carte fausse — la correspondance entre le
 * numéro de tuile publié par le scraper et le rectangle dessiné à l'écran. Une
 * inversion rangée/colonne ne casserait rien, ne lèverait rien, et afficherait
 * simplement une progression qui balaie l'écran dans le mauvais sens.
 */
import type { Grille } from "./contract";

export type CadreTuile = {
  /** Numéro publié par le scraper, 1-indexé. */
  index: number;
  rangee: number;
  colonne: number;
  nord: number;
  sud: number;
  ouest: number;
  est: number;
};

/**
 * Rectangle géographique de la tuile `index`.
 *
 * Le crawler parcourt ses rangées du nord au sud et, dans chaque rangée, ses
 * colonnes d'ouest en est, en incrémentant un compteur unique — d'où cette
 * division euclidienne. Renvoie `null` hors des bornes plutôt qu'un rectangle
 * dégénéré : un index inconnu ne doit rien peindre.
 */
export function cadreDeTuile(grille: Grille, index: number): CadreTuile | null {
  if (!Number.isInteger(index) || index < 1 || index > grille.total) return null;
  const rangee = Math.floor((index - 1) / grille.colonnes);
  const colonne = (index - 1) % grille.colonnes;
  const nord = grille.latitudes[rangee];
  const sud = grille.latitudes[rangee + 1];
  const ouest = grille.longitudes[colonne];
  const est = grille.longitudes[colonne + 1];
  if (![nord, sud, ouest, est].every(Number.isFinite)) return null;
  return { index, rangee, colonne, nord, sud, ouest, est };
}

/** Tous les rectangles de la grille, dans l'ordre de parcours. */
export function cadresDeGrille(grille: Grille): CadreTuile[] {
  const cadres: CadreTuile[] = [];
  for (let i = 1; i <= grille.total; i++) {
    const cadre = cadreDeTuile(grille, i);
    if (cadre) cadres.push(cadre);
  }
  return cadres;
}

/** Boîte englobante de la zone explorée. */
export function cadreGlobal(grille: Grille) {
  const lats = grille.latitudes;
  const lons = grille.longitudes;
  return {
    nord: Math.max(lats[0], lats[lats.length - 1]),
    sud: Math.min(lats[0], lats[lats.length - 1]),
    ouest: Math.min(lons[0], lons[lons.length - 1]),
    est: Math.max(lons[0], lons[lons.length - 1]),
  };
}

/**
 * Boîte englobant la grille ET les entreprises trouvées.
 *
 * Google ne rend pas que des fiches situées dans la tuile interrogée : sur le
 * crawl de Limoges, une bonne part des 49 points tombait hors du cadre de la
 * ville. Cadrer sur la seule grille les faisait flotter hors de l'écran — ou,
 * pire, disparaître sans que rien ne le signale. Ce sont pourtant des résultats
 * de CETTE recherche : ils doivent se voir, quitte à ce que la grille occupe
 * une part plus modeste de la scène.
 */
export type Cadre = { nord: number; sud: number; ouest: number; est: number };

/**
 * Jusqu'où le cadre accepte de s'étendre pour rattraper un point, en fraction
 * de la taille de la grille. Mesuré sur Limoges : sans plafond, deux fiches
 * isolées à 20 km faisaient tripler le cadre et réduisaient la grille — le
 * sujet de l'écran — au tiers de la scène. Le plafond garde la grille lisible ;
 * les points au-delà sont comptés et annoncés, pas silencieusement perdus.
 */
export const EXTENSION_MAX = 0.45;

export function cadreAvecPoints(
  grille: Grille,
  points: Array<{ lat: number; lng: number }>,
  extensionMax = EXTENSION_MAX,
): Cadre {
  const base = cadreGlobal(grille);
  const margeLat = (base.nord - base.sud) * extensionMax;
  const margeLon = (base.est - base.ouest) * extensionMax;
  let { nord, sud, ouest, est } = base;
  for (const p of points) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
    if (p.lat > base.nord + margeLat || p.lat < base.sud - margeLat) continue;
    if (p.lng < base.ouest - margeLon || p.lng > base.est + margeLon) continue;
    if (p.lat > nord) nord = p.lat;
    if (p.lat < sud) sud = p.lat;
    if (p.lng < ouest) ouest = p.lng;
    if (p.lng > est) est = p.lng;
  }
  return { nord, sud, ouest, est };
}

/**
 * Entreprises trouvées mais situées hors du cadre affiché. Un chiffre à
 * annoncer, pas à taire : sans lui, la carte montrerait 40 points là où la
 * recherche en a ramené 45, et rien ne dirait où sont passés les cinq autres.
 */
export function compterHorsCadre(
  cadre: Cadre,
  points: Array<{ lat: number; lng: number }>,
): number {
  return points.filter(
    (p) =>
      Number.isFinite(p.lat) &&
      Number.isFinite(p.lng) &&
      (p.lat > cadre.nord || p.lat < cadre.sud || p.lng < cadre.ouest || p.lng > cadre.est),
  ).length;
}

/**
 * Seuils par quantile sur les tuiles NON VIDES, pour teinter la grille.
 *
 * Même méthode que la carte du territoire, et pour la même raison : sur une
 * ville, deux ou trois tuiles de centre-ville concentrent l'essentiel des
 * fiches. Une échelle linéaire les peindrait seules et laisserait tout le
 * reste au ton le plus pâle, ce qui ne dit plus rien de la couverture.
 */
export function seuilsQuantile(valeurs: number[], classes: number): number[] {
  const tries = valeurs.filter((n) => n > 0).sort((a, b) => a - b);
  if (tries.length === 0) return [];
  const seuils: number[] = [];
  for (let i = 1; i < classes; i++) {
    seuils.push(tries[Math.floor((i / classes) * tries.length)] ?? tries[tries.length - 1]);
  }
  return seuils;
}

/**
 * Avancement en fraction de 0 à 1, ou `null` quand le dénominateur est inconnu.
 *
 * `null` n'est pas un détail : c'est ce qui empêche d'afficher une barre pleine
 * pendant tout le crawl, ce que faisait le suivi tant que le scraper publiait
 * `tuiles_total = 0`.
 */
export function avancement(faites: number, total: number): number | null {
  if (!Number.isFinite(total) || total <= 0) return null;
  return Math.min(1, Math.max(0, faites / total));
}
