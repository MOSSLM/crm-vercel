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
