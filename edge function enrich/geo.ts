// =====================================================================
// Ville SEO : arbitrage géographique (pur, sans I/O)
// =====================================================================
// La ville SEO est la grande ville mise en avant partout sur le site d'une
// entreprise (Quetigny → Dijon).
//
// Ce module ne fait AUCUN accès réseau ni base : il reçoit un point d'origine et
// une liste de communes candidates, et applique la règle d'arbitrage. Les
// lectures Supabase sont dans `communes.ts`. Ce découpage rend la règle —
// la partie qu'on veut pouvoir contester et ajuster — entièrement testable.
//
// Pourquoi pas une table département → ville : un département a souvent
// plusieurs pôles. En Saône-et-Loire, Chalon-sur-Saône (~45k hab) est plus
// peuplée que Mâcon (~34k) et structure une agglomération comparable ; renvoyer
// Mâcon pour tout le 71 est faux pour une commune à 15 km de Chalon. Même
// problème dans le 62 (Arras/Calais/Boulogne), le 76 (Rouen/Le Havre), le 83,
// le 06… D'où un calcul sur la distance réelle.
// =====================================================================

export interface LatLng {
  lat: number;
  lon: number;
}

export interface CommuneCandidate extends LatLng {
  nom: string;
  population: number;
}

/** Seuils de l'arbitrage, lus depuis `enrichment_geo_settings`. */
export interface GeoSettings {
  /** Population à partir de laquelle une ville est traitée comme une métropole. */
  metroPopulation: number;
  /** Rayon dans lequel une métropole l'emporte sur tout le reste (km). */
  metroRadiusKm: number;
  /** Population minimale pour être candidate. */
  bigCityPopulation: number;
  /** Rayon confortable : dedans, c'est la plus peuplée qui gagne (km). */
  preferredRadiusKm: number;
  /** Rayon maximal : au-delà, on ne propose plus rien (km). */
  maxRadiusKm: number;
}

export const DEFAULT_GEO_SETTINGS: GeoSettings = {
  metroPopulation: 100000,
  metroRadiusKm: 30,
  bigCityPopulation: 20000,
  preferredRadiusKm: 35,
  maxRadiusKm: 60,
};

export interface SeoCityPick {
  nom: string;
  distanceKm: number;
  population: number;
  /** Palier qui a décidé — utile pour expliquer un choix contesté dans les logs. */
  rule: "metro" | "largest_nearby" | "closest";
}

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Distance orthodromique entre deux points, en kilomètres. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Demi-côtés d'une boîte englobante couvrant `radiusKm` autour d'un point.
 * Sert à pré-filtrer les candidates en SQL sur des colonnes indexées avant le
 * calcul exact. Volontairement large : un faux positif est écarté ensuite par
 * la distance réelle, un faux négatif serait invisible.
 */
export function boundingBox(origin: LatLng, radiusKm: number): { dLat: number; dLon: number } {
  const dLat = radiusKm / 111;
  // Aux latitudes françaises cos(φ) ne descend pas sous ~0.6 ; le garde-fou
  // évite juste une division par ~0 si une coordonnée aberrante remonte.
  const cos = Math.max(0.1, Math.cos(toRad(origin.lat)));
  return { dLat, dLon: radiusKm / (111 * cos) };
}

/**
 * Choisit la ville SEO parmi les candidates, par paliers :
 *
 *  1. Une métropole (>= metroPopulation) à portée (<= metroRadiusKm) l'emporte —
 *     une commune de banlieue vise la métropole, pas la sous-préfecture voisine.
 *  2. Sinon, dans le rayon confortable (<= preferredRadiusKm), c'est la PLUS
 *     PEUPLÉE qui gagne. C'est ce palier qui tranche le cas Chalon / Mâcon : à
 *     distances comparables, la ville la plus importante l'emporte.
 *  3. Sinon, jusqu'à maxRadiusKm, la PLUS PROCHE.
 *  4. Sinon null : rien de crédible à proposer, l'appelant enchaîne sur ses replis.
 *
 * La commune de l'entreprise fait partie des candidates : si elle est elle-même
 * une grande ville, elle gagne à distance 0 — « si c'est déjà dans une grande
 * ville, on laisse ».
 *
 * À égalité (deux villes de même population au palier 2, ou strictement
 * équidistantes au palier 3) on départage par l'autre critère puis par le nom,
 * pour que deux runs sur les mêmes données donnent le même résultat.
 */
export function pickSeoCity(
  origin: LatLng,
  candidates: CommuneCandidate[],
  settings: GeoSettings = DEFAULT_GEO_SETTINGS,
): SeoCityPick | null {
  const scored = candidates
    .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lon))
    .filter((c) => c.population >= settings.bigCityPopulation)
    .map((c) => ({ nom: c.nom, population: c.population, distanceKm: haversineKm(origin, c) }))
    .filter((c) => c.distanceKm <= settings.maxRadiusKm);

  if (scored.length === 0) return null;

  const byDistance = (a: typeof scored[number], b: typeof scored[number]) =>
    a.distanceKm - b.distanceKm || b.population - a.population || a.nom.localeCompare(b.nom);
  const byPopulation = (a: typeof scored[number], b: typeof scored[number]) =>
    b.population - a.population || a.distanceKm - b.distanceKm || a.nom.localeCompare(b.nom);

  const metros = scored.filter(
    (c) => c.population >= settings.metroPopulation && c.distanceKm <= settings.metroRadiusKm,
  );
  if (metros.length > 0) {
    return { ...metros.sort(byDistance)[0], rule: "metro" };
  }

  const nearby = scored.filter((c) => c.distanceKm <= settings.preferredRadiusKm);
  if (nearby.length > 0) {
    return { ...nearby.sort(byPopulation)[0], rule: "largest_nearby" };
  }

  return { ...scored.sort(byDistance)[0], rule: "closest" };
}
