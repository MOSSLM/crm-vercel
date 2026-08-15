/**
 * Géométrie de la carte : chargement des contours, projection, et
 * rattachement d'une fiche à son département.
 */
import { geoConicConformal, geoPath, geoContains, geoBounds } from "d3-geo";
import type { GeoPermissibleObjects } from "d3-geo";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";

export type DeptFeature = Feature<Polygon | MultiPolygon, { code: string }>;
export type DeptCollection = FeatureCollection<Polygon | MultiPolygon, { code: string }>;

export type Bbox = [minLon: number, minLat: number, maxLon: number, maxLat: number];

/** Contour + sa boîte englobante, pré-calculée pour le rattachement des points. */
export type DeptGeometry = {
  code: string;
  feature: DeptFeature;
  bbox: Bbox;
};

export async function fetchContours(url: string, signal?: AbortSignal): Promise<DeptGeometry[]> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`contours indisponibles (HTTP ${res.status})`);
  const collection = (await res.json()) as DeptCollection;
  return collection.features.map((feature) => {
    const [[minLon, minLat], [maxLon, maxLat]] = geoBounds(feature);
    return { code: feature.properties.code, feature, bbox: [minLon, minLat, maxLon, maxLat] };
  });
}

/**
 * Projection Lambert conique conforme cadrée sur la métropole — la projection
 * officielle de l'IGN pour la France, celle qui ne déforme ni la Bretagne ni la
 * Côte d'Azur.
 */
export function projeter(geometries: DeptGeometry[], width: number, height: number, pad = 26) {
  const collection: GeoPermissibleObjects = {
    type: "FeatureCollection",
    features: geometries.map((g) => g.feature),
  } as GeoPermissibleObjects;

  const projection = geoConicConformal()
    .parallels([44, 49])
    .rotate([-3, 0])
    .fitExtent(
      [
        [pad, pad],
        [Math.max(pad + 1, width - pad), Math.max(pad + 1, height - pad)],
      ],
      collection,
    );

  return { projection, path: geoPath(projection) };
}

/**
 * Simplification de Douglas-Peucker sur un anneau de coordonnées.
 *
 * Les contours de communes sont détaillés au mètre : le seul département de la
 * Haute-Vienne pèse 2,8 Mo. À l'échelle où on les affiche, l'essentiel de ces
 * sommets tombe sous le pixel. On les retire avant de les envoyer au navigateur.
 */
export function simplifierAnneau(points: number[][], tolerance: number): number[][] {
  if (points.length < 3) return points;
  const distance2 = (p: number[], a: number[], b: number[]) => {
    let x = a[0];
    let y = a[1];
    let dx = b[0] - x;
    let dy = b[1] - y;
    if (dx || dy) {
      const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) {
        x = b[0];
        y = b[1];
      } else if (t > 0) {
        x += dx * t;
        y += dy * t;
      }
    }
    dx = p[0] - x;
    dy = p[1] - y;
    return dx * dx + dy * dy;
  };
  const garde = new Array(points.length).fill(false);
  garde[0] = true;
  garde[points.length - 1] = true;
  // Pile explicite : un contour peut avoir des milliers de sommets, et une
  // récursion de cette profondeur n'a rien à faire dans une route serveur.
  const pile: Array<[number, number]> = [[0, points.length - 1]];
  while (pile.length) {
    const [i, j] = pile.pop()!;
    let max = 0;
    let index = -1;
    for (let k = i + 1; k < j; k++) {
      const d = distance2(points[k], points[i], points[j]);
      if (d > max) {
        max = d;
        index = k;
      }
    }
    if (max > tolerance * tolerance && index > 0) {
      garde[index] = true;
      pile.push([i, index], [index, j]);
    }
  }
  const retenus = points.filter((_, i) => garde[i]);
  // Un anneau a besoin d'au moins quatre points pour rester une surface.
  return retenus.length >= 4 ? retenus : points;
}

/** Allège un polygone entier, anneaux et arrondi compris (4 décimales ≈ 11 m). */
export function alleger<T extends { type: string; coordinates: unknown }>(
  geometrie: T,
  tolerance: number,
): T {
  const anneau = (a: unknown) =>
    Array.isArray(a)
      ? simplifierAnneau(a as number[][], tolerance).map((p) => [
          Math.round(p[0] * 1e4) / 1e4,
          Math.round(p[1] * 1e4) / 1e4,
        ])
      : a;
  const polygone = (rings: unknown) => (Array.isArray(rings) ? rings.map(anneau) : rings);
  if (geometrie.type === "Polygon") {
    return { ...geometrie, coordinates: polygone(geometrie.coordinates) };
  }
  if (geometrie.type === "MultiPolygon") {
    return {
      ...geometrie,
      coordinates: (geometrie.coordinates as unknown[]).map(polygone),
    };
  }
  return geometrie;
}

/** Aire signée d'un anneau, dans le plan. Positive = sens anti-horaire. */
function aireSignee(anneau: number[][]): number {
  let aire = 0;
  for (let i = 0, n = anneau.length, j = n - 1; i < n; j = i++) {
    aire += anneau[j][0] * anneau[i][1] - anneau[i][0] * anneau[j][1];
  }
  return aire / 2;
}

/**
 * Réoriente un polygone pour d3-geo.
 *
 * PIÈGE, mesuré : d3-geo raisonne sur la SPHÈRE, où l'enroulement d'un anneau
 * ne décrit pas une forme mais désigne lequel des deux côtés est l'intérieur.
 * Sa convention est l'inverse de celle du GeoJSON (RFC 7946) et de celle que
 * rend OpenStreetMap. Le contour de Limoges, laissé tel quel, se projetait sur
 * 2,4 × 10²⁰ px² — la sphère entière PRIVÉE de la ville — au lieu des
 * 130 066 px² attendus sur une scène de 331 200. À l'écran : un aplat pâle
 * couvrant tout, bordé de diagonales absurdes, et aucune erreur nulle part.
 *
 * On impose donc : enveloppe extérieure en sens horaire (aire négative), trous
 * en sens anti-horaire.
 */
export function orienterPourD3<T extends { type: string; coordinates: unknown }>(
  geometrie: T | null | undefined,
): T | null {
  if (!geometrie || !Array.isArray(geometrie.coordinates)) return null;

  const orienterAnneaux = (anneaux: unknown): unknown => {
    if (!Array.isArray(anneaux)) return anneaux;
    return anneaux.map((anneau, index) => {
      if (!Array.isArray(anneau) || anneau.length < 4) return anneau;
      const points = anneau as number[][];
      const aire = aireSignee(points);
      // Enveloppe (index 0) : horaire. Trous : anti-horaire.
      const doitEtreNegative = index === 0;
      const aBonSens = doitEtreNegative ? aire < 0 : aire > 0;
      return aBonSens ? points : [...points].reverse();
    });
  };

  if (geometrie.type === "Polygon") {
    return { ...geometrie, coordinates: orienterAnneaux(geometrie.coordinates) };
  }
  if (geometrie.type === "MultiPolygon") {
    return {
      ...geometrie,
      coordinates: (geometrie.coordinates as unknown[]).map(orienterAnneaux),
    };
  }
  return null;
}

const inBbox = (bbox: Bbox, lon: number, lat: number) =>
  lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3];

/**
 * Département contenant un point. La boîte englobante élimine 95 des 96
 * candidats avant le test point-dans-polygone, ce qui rend le rattachement de
 * quelques milliers de fiches instantané.
 *
 * Renvoie `null` hors métropole (outre-mer, frontalier, géocodage aberrant) :
 * la fiche est alors comptée « hors carte » plutôt que rattachée au hasard.
 */
export function resolveDepartement(
  geometries: DeptGeometry[],
  lon: number,
  lat: number,
): string | null {
  const candidats = geometries.filter((g) => inBbox(g.bbox, lon, lat));
  for (const g of candidats) {
    if (geoContains(g.feature, [lon, lat])) return g.code;
  }
  return null;
}
