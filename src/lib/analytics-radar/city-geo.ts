/**
 * Static city-name → coordinates lookup, used ONLY to place a marker on the
 * globe for a city GA4 reports traffic from. This is geographic reference
 * data (no analytics numbers in it) — the numbers plotted on top always come
 * from a live GA4 report. A city GA4 returns that isn't in this table still
 * shows up in the text lists/tables, it just doesn't get a globe marker
 * (no coordinates to place it at). Extend this list as real traffic reveals
 * cities it's missing — it intentionally leans French/European since that's
 * this CRM's prospect base.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { geoFromCodePostal } from "@/lib/site-builder/geo-fr";

export interface CityGeo {
  lat: number;
  lon: number;
  region: string;
}

export const CITY_GEO: Record<string, CityGeo> = {
  Paris: { lat: 48.8566, lon: 2.3522, region: "Île-de-France" },
  Lyon: { lat: 45.764, lon: 4.8357, region: "Auvergne-Rhône-Alpes" },
  Marseille: { lat: 43.2965, lon: 5.3698, region: "PACA" },
  Toulouse: { lat: 43.6047, lon: 1.4442, region: "Occitanie" },
  Bordeaux: { lat: 44.8378, lon: -0.5792, region: "Nouvelle-Aquitaine" },
  Nantes: { lat: 47.2184, lon: -1.5536, region: "Pays de la Loire" },
  Lille: { lat: 50.6292, lon: 3.0573, region: "Hauts-de-France" },
  Strasbourg: { lat: 48.5734, lon: 7.7521, region: "Grand Est" },
  Rennes: { lat: 48.1173, lon: -1.6778, region: "Bretagne" },
  Nice: { lat: 43.7102, lon: 7.262, region: "PACA" },
  Montpellier: { lat: 43.6108, lon: 3.8767, region: "Occitanie" },
  Grenoble: { lat: 45.1885, lon: 5.7245, region: "Auvergne-Rhône-Alpes" },
  Rouen: { lat: 49.4432, lon: 1.0993, region: "Normandie" },
  Reims: { lat: 49.2583, lon: 4.0317, region: "Grand Est" },
  "Clermont-Ferrand": { lat: 45.7772, lon: 3.087, region: "AURA" },
  Tours: { lat: 47.3941, lon: 0.6848, region: "Centre-Val de Loire" },
  Annecy: { lat: 45.8992, lon: 6.1294, region: "AURA" },
  Bayonne: { lat: 43.4929, lon: -1.4748, region: "Nouvelle-Aquitaine" },
  Brest: { lat: 48.3904, lon: -4.4861, region: "Bretagne" },
  Ajaccio: { lat: 41.9192, lon: 8.7386, region: "Corse" },
  Dijon: { lat: 47.322, lon: 5.0415, region: "Bourgogne-Franche-Comté" },
  Angers: { lat: 47.4784, lon: -0.5632, region: "Pays de la Loire" },
  "Le Havre": { lat: 49.4944, lon: 0.1079, region: "Normandie" },
  "Saint-Étienne": { lat: 45.4397, lon: 4.3872, region: "AURA" },
  Toulon: { lat: 43.1242, lon: 5.928, region: "PACA" },
  "Le Mans": { lat: 48.0061, lon: 0.1996, region: "Pays de la Loire" },
  Amiens: { lat: 49.8942, lon: 2.2957, region: "Hauts-de-France" },
  Limoges: { lat: 45.8336, lon: 1.2611, region: "Nouvelle-Aquitaine" },
  Perpignan: { lat: 42.6887, lon: 2.8948, region: "Occitanie" },
  Metz: { lat: 49.1193, lon: 6.1757, region: "Grand Est" },
  Besançon: { lat: 47.2378, lon: 6.0241, region: "Bourgogne-Franche-Comté" },
  Orléans: { lat: 47.9029, lon: 1.9093, region: "Centre-Val de Loire" },
  Caen: { lat: 49.1829, lon: -0.3707, region: "Normandie" },
  Nîmes: { lat: 43.8367, lon: 4.3601, region: "Occitanie" },
  "Genève": { lat: 46.2044, lon: 6.1432, region: "Suisse" },
  "Bruxelles": { lat: 50.8503, lon: 4.3517, region: "Belgique" },
  "Luxembourg": { lat: 49.6116, lon: 6.1319, region: "Luxembourg" },
  Barcelone: { lat: 41.3874, lon: 2.1686, region: "Espagne" },
  Londres: { lat: 51.5072, lon: -0.1276, region: "Royaume-Uni" },
  Casablanca: { lat: 33.5731, lon: -7.5898, region: "Maroc" },
  Dakar: { lat: 14.7167, lon: -17.4677, region: "Sénégal" },
  Montréal: { lat: 45.5019, lon: -73.5674, region: "Québec" },
};

export function geocodeCity(city: string): CityGeo | null {
  return CITY_GEO[city] ?? null;
}

/**
 * Géocode un lot de villes remontées par GA4, en s'appuyant d'abord sur le
 * référentiel réel des communes françaises déjà présent dans le CRM
 * (`communes_fr`, ~34 900 communes chargées depuis geo.api.gouv.fr par
 * /api/settings/communes-fr), puis sur la table statique ci-dessus pour les
 * villes étrangères qu'il ne contient pas.
 *
 * Sans ça le globe ne montrait QUE les ~40 villes écrites en dur : une visite
 * réelle depuis une commune de 6 000 habitants n'apparaissait nulle part, ce
 * qui donnait un globe vide alors que le trafic existait.
 *
 * Homonymes : plusieurs communes portent le même nom (Sainte-Marie, Saint-Paul…).
 * On retient la plus peuplée — c'est le pari le plus probable pour du trafic
 * web, et GA4 ne donne de toute façon pas de quoi trancher (pas de code INSEE).
 */
export async function geocodeCitiesFromCommunes(
  supabase: SupabaseClient,
  cities: string[],
): Promise<Map<string, CityGeo>> {
  const out = new Map<string, CityGeo>();
  const wanted = [...new Set(cities.filter((c) => c && c !== "Inconnue"))];
  if (!wanted.length) return out;

  let rows: CommuneRow[] = [];
  try {
    const res = await supabase.from("communes_fr").select("nom, lat, lon, codes_postaux, population").in("nom", wanted);
    rows = (res.data ?? []) as unknown as CommuneRow[];
  } catch {
    // Table absente (migration non appliquée) → on retombe sur la table
    // statique plus bas, le globe reste fonctionnel en mode dégradé.
    rows = [];
  }

  const best = new Map<string, CommuneRow>();
  rows.forEach((r) => {
    if (r.lat == null || r.lon == null) return;
    const prev = best.get(r.nom);
    if (!prev || (r.population ?? 0) > (prev.population ?? 0)) best.set(r.nom, r);
  });

  best.forEach((r, nom) => {
    const cp = Array.isArray(r.codes_postaux) ? r.codes_postaux[0] : null;
    const geo = cp ? geoFromCodePostal(cp) : null;
    out.set(nom, { lat: r.lat as number, lon: r.lon as number, region: geo?.region ?? "France" });
  });

  // Villes hors référentiel français (visiteurs étrangers) → table statique.
  wanted.forEach((c) => {
    if (!out.has(c) && CITY_GEO[c]) out.set(c, CITY_GEO[c]);
  });

  return out;
}

interface CommuneRow {
  nom: string;
  lat: number | null;
  lon: number | null;
  codes_postaux: string[] | null;
  population: number | null;
}
