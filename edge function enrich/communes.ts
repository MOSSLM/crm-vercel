// =====================================================================
// Lectures Supabase pour la ville SEO
// =====================================================================
// Trois lectures, toutes tolérantes : si la migration `20260727_ville_seo_geo`
// n'a pas encore été appliquée, ou si `communes_fr` n'a pas encore été chargée
// depuis les Paramètres, ces fonctions renvoient null / [] / les valeurs par
// défaut au lieu de lever. L'enrichissement continue alors de fonctionner en
// retombant sur l'extraction du LLM.
//
// L'arbitrage lui-même est dans `geo.ts` (pur, testé) : ici, uniquement de l'I/O.
// =====================================================================

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import {
  boundingBox,
  DEFAULT_GEO_SETTINGS,
  type CommuneCandidate,
  type GeoSettings,
  type LatLng,
} from "./geo.ts";

export interface OriginCommune extends LatLng {
  nom: string;
  population: number;
}

/** `true` quand la table/colonne n'existe pas encore (migration non appliquée). */
function isMissingRelation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST205" ||
    error.code === "PGRST204" ||
    /does not exist|could not find the (table|column)/i.test(error.message ?? "")
  );
}

/** Normalise un nom de commune pour comparaison : accents, tirets, casse. */
function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------
// Seuils d'arbitrage
// ---------------------------------------------------------------------
export async function loadGeoSettings(sb: SupabaseClient): Promise<GeoSettings> {
  const { data, error } = await sb
    .from("enrichment_geo_settings")
    .select("metro_population, metro_radius_km, big_city_population, preferred_radius_km, max_radius_km")
    .eq("id", "default")
    .maybeSingle();

  if (error || !data) {
    if (error && !isMissingRelation(error)) {
      console.warn(`loadGeoSettings: ${error.message} — seuils par défaut`);
    }
    return DEFAULT_GEO_SETTINGS;
  }

  const num = (v: unknown, fallback: number): number =>
    typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fallback;

  return {
    metroPopulation: num(data.metro_population, DEFAULT_GEO_SETTINGS.metroPopulation),
    metroRadiusKm: num(data.metro_radius_km, DEFAULT_GEO_SETTINGS.metroRadiusKm),
    bigCityPopulation: num(data.big_city_population, DEFAULT_GEO_SETTINGS.bigCityPopulation),
    preferredRadiusKm: num(data.preferred_radius_km, DEFAULT_GEO_SETTINGS.preferredRadiusKm),
    maxRadiusKm: num(data.max_radius_km, DEFAULT_GEO_SETTINGS.maxRadiusKm),
  };
}

// ---------------------------------------------------------------------
// Correction manuelle
// ---------------------------------------------------------------------
/**
 * Ville SEO imposée pour ce code postal, ou null. La règle la plus spécifique
 * gagne : (code_postal, commune) avant (code_postal, NULL).
 */
export async function loadVilleSeoOverride(
  sb: SupabaseClient,
  codePostal: string | null,
  ville: string | null,
): Promise<string | null> {
  const cp = (codePostal ?? "").trim();
  if (!cp) return null;

  const { data, error } = await sb
    .from("ville_seo_overrides")
    .select("commune, ville_seo")
    .eq("code_postal", cp);

  if (error) {
    if (!isMissingRelation(error)) console.warn(`loadVilleSeoOverride: ${error.message}`);
    return null;
  }
  const rows = (data ?? []) as Array<{ commune: string | null; ville_seo: string | null }>;
  if (rows.length === 0) return null;

  const target = normalizeName(ville ?? "");
  const exact = target
    ? rows.find((r) => r.commune && normalizeName(r.commune) === target)
    : undefined;
  const chosen = exact ?? rows.find((r) => !r.commune);
  const value = (chosen?.ville_seo ?? "").trim();
  return value.length > 0 ? value : null;
}

// ---------------------------------------------------------------------
// Commune d'origine
// ---------------------------------------------------------------------
/**
 * La commune de l'entreprise et son centre, à partir du code postal.
 *
 * Un code postal couvre souvent plusieurs communes : on désambiguïse par le nom
 * remonté de `entreprises.ville`, et à défaut on prend la plus peuplée — le
 * centre d'une commune voisine du même code postal reste à quelques kilomètres,
 * ce qui est sans effet sur un arbitrage à l'échelle de 30-60 km.
 */
export async function loadOriginCommune(
  sb: SupabaseClient,
  codePostal: string | null,
  ville: string | null,
): Promise<OriginCommune | null> {
  const cp = (codePostal ?? "").trim();
  if (!/^\d{5}$/.test(cp)) return null;

  const { data, error } = await sb
    .from("communes_fr")
    .select("nom, population, lat, lon")
    .contains("codes_postaux", [cp]);

  if (error) {
    if (!isMissingRelation(error)) console.warn(`loadOriginCommune: ${error.message}`);
    return null;
  }

  const rows = ((data ?? []) as Array<{
    nom: string | null;
    population: number | null;
    lat: number | null;
    lon: number | null;
  }>).filter((r): r is { nom: string; population: number | null; lat: number; lon: number } =>
    typeof r.nom === "string" && typeof r.lat === "number" && typeof r.lon === "number"
  );
  if (rows.length === 0) return null;

  const target = normalizeName(ville ?? "");
  const exact = target ? rows.find((r) => normalizeName(r.nom) === target) : undefined;
  const chosen = exact ?? rows.slice().sort((a, b) => (b.population ?? 0) - (a.population ?? 0))[0];

  return {
    nom: chosen.nom,
    population: chosen.population ?? 0,
    lat: chosen.lat,
    lon: chosen.lon,
  };
}

// ---------------------------------------------------------------------
// Grandes villes candidates
// ---------------------------------------------------------------------
/**
 * Communes d'au moins `minPopulation` habitants dans la boîte englobante du
 * rayon demandé. Le filtrage exact au rayon est fait par `pickSeoCity` sur la
 * distance orthodromique — ici on ne cherche qu'à réduire le balayage à ce que
 * l'index partiel `communes_fr_big_cities_idx` sait servir.
 */
export async function loadBigCityCandidates(
  sb: SupabaseClient,
  origin: LatLng,
  radiusKm: number,
  minPopulation: number,
): Promise<CommuneCandidate[]> {
  const { dLat, dLon } = boundingBox(origin, radiusKm);

  const { data, error } = await sb
    .from("communes_fr")
    .select("nom, population, lat, lon")
    .gte("population", minPopulation)
    .gte("lat", origin.lat - dLat)
    .lte("lat", origin.lat + dLat)
    .gte("lon", origin.lon - dLon)
    .lte("lon", origin.lon + dLon)
    .limit(500);

  if (error) {
    if (!isMissingRelation(error)) console.warn(`loadBigCityCandidates: ${error.message}`);
    return [];
  }

  return ((data ?? []) as Array<{
    nom: string | null;
    population: number | null;
    lat: number | null;
    lon: number | null;
  }>)
    .filter((r): r is { nom: string; population: number; lat: number; lon: number } =>
      typeof r.nom === "string" &&
      typeof r.lat === "number" &&
      typeof r.lon === "number" &&
      typeof r.population === "number"
    )
    .map((r) => ({ nom: r.nom, population: r.population, lat: r.lat, lon: r.lon }));
}
