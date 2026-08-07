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
  normalizeCityName,
  pickSurroundingCities,
  SURROUNDING_DEFAULTS,
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
  // `select("*")` et non la liste explicite : une seule colonne absente faisait
  // échouer la requête entière, `isMissingRelation` renvoyait alors true et TOUS
  // les seuils retombaient sur les défauts — les réglages de l'utilisateur étaient
  // silencieusement ignorés. Avec l'étoile, l'ajout d'une colonne ne peut plus
  // provoquer cette régression.
  const { data, error } = await sb
    .from("enrichment_geo_settings")
    .select("*")
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

/** Une ligne de `communes_fr`. Les coordonnées peuvent manquer. */
export interface CommuneRow {
  nom: string;
  population: number;
  lat: number | null;
  lon: number | null;
}

/**
 * Toutes les communes qui portent ce code postal, telles quelles.
 *
 * Rendue publique parce qu'elle sert à deux choses très différentes : situer
 * l'entreprise pour la ville SEO (`loadOriginCommune`, qui exige des
 * coordonnées) et confirmer la commune lue dans l'adresse (`resolveLocality`
 * dans `db.ts`, à qui le seul NOM suffit — et pour qui le NOMBRE de communes
 * compte, puisqu'un code postal partagé par plusieurs communes ne permet pas de
 * deviner laquelle sans un nom en face).
 */
export async function loadCommunesForPostalCode(
  sb: SupabaseClient,
  codePostal: string | null,
): Promise<CommuneRow[]> {
  const cp = (codePostal ?? "").trim();
  if (!/^\d{5}$/.test(cp)) return [];

  const { data, error } = await sb
    .from("communes_fr")
    .select("nom, population, lat, lon")
    .contains("codes_postaux", [cp]);

  if (error) {
    if (!isMissingRelation(error)) console.warn(`loadCommunesForPostalCode: ${error.message}`);
    return [];
  }

  return ((data ?? []) as Array<{
    nom: string | null;
    population: number | null;
    lat: number | null;
    lon: number | null;
  }>)
    .filter((r): r is { nom: string; population: number | null; lat: number | null; lon: number | null } =>
      typeof r.nom === "string" && r.nom.trim().length > 0
    )
    .map((r) => ({
      nom: r.nom,
      population: r.population ?? 0,
      lat: typeof r.lat === "number" ? r.lat : null,
      lon: typeof r.lon === "number" ? r.lon : null,
    }));
}

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
  const rows = (await loadCommunesForPostalCode(sb, codePostal)).filter(
    (r): r is CommuneRow & { lat: number; lon: number } => r.lat !== null && r.lon !== null,
  );
  if (rows.length === 0) return null;

  const target = normalizeName(ville ?? "");
  const exact = target ? rows.find((r) => normalizeName(r.nom) === target) : undefined;
  const chosen = exact ?? rows.slice().sort((a, b) => b.population - a.population)[0];

  return {
    nom: chosen.nom,
    population: chosen.population,
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

// ---------------------------------------------------------------------
// Zones desservies
// ---------------------------------------------------------------------
/**
 * Communes réelles à présenter comme zones desservies, ou `[]`.
 *
 * Remplace la liste que le LLM inventait. Le seuil descend par paliers — 3 000,
 * puis 2 000, puis 1 000 habitants — et s'arrête dès qu'il y a de quoi remplir la
 * liste : en zone dense on reste à 3 000 (ce que le prompt demandait déjà), et le
 * rural profond obtient quand même des voisines crédibles au lieu de rien.
 *
 * Rend `[]` sans lever si `communes_fr` n'est pas chargée : l'appelant retombe
 * alors sur la liste du LLM, comme avant.
 */
export async function loadSurroundingCities(
  sb: SupabaseClient,
  origin: LatLng,
  exclude: readonly string[],
  /** Liste du LLM, utilisée en complément et filtrée par l'existence en base. */
  llmFallback: readonly string[] = [],
): Promise<{ villes: string[]; source: "geo" | "llm_filtre" | "llm_brut" | "aucune" }> {
  const tiers = SURROUNDING_DEFAULTS.populationTiers;
  let lastPool: CommuneCandidate[] = [];

  for (const populationMin of tiers) {
    const candidates = await loadBigCityCandidates(
      sb,
      origin,
      SURROUNDING_DEFAULTS.radiusKm,
      populationMin,
    );
    if (candidates.length > 0) lastPool = candidates;

    const villes = pickSurroundingCities(origin, candidates, {
      radiusKm: SURROUNDING_DEFAULTS.radiusKm,
      count: SURROUNDING_DEFAULTS.count,
      exclude,
    });
    // Assez de voisines à ce palier : inutile de descendre chercher des villages.
    if (villes.length >= SURROUNDING_DEFAULTS.minCount) return { villes, source: "geo" };
    // Dernier palier atteint : on complète avec le LLM plutôt que de rendre une
    // liste maigre, mais on ne garde de lui que ce qui existe VRAIMENT dans le
    // rayon — c'est tout l'objet de la correction.
    if (populationMin === tiers[tiers.length - 1]) {
      if (villes.length > 0 || lastPool.length > 0) {
        const known = new Map(lastPool.map((c) => [normalizeCityName(c.nom), c.nom]));
        const already = new Set(villes.map(normalizeCityName));
        const complements: string[] = [];
        for (const raw of llmFallback) {
          const key = normalizeCityName(raw);
          const real = known.get(key);
          if (!real || already.has(key)) continue;
          already.add(key);
          complements.push(real); // graphie de la base, pas celle du modèle
          if (villes.length + complements.length >= SURROUNDING_DEFAULTS.count) break;
        }
        const merged = [...villes, ...complements];
        if (merged.length > 0) {
          return { villes: merged, source: complements.length > 0 ? "llm_filtre" : "geo" };
        }
      }
      break;
    }
  }

  // `communes_fr` n'est pas chargée (ou aucune commune dans le rayon) : on rend la
  // liste du modèle telle quelle, exactement comme avant cette correction. Mieux
  // vaut le comportement d'hier qu'une page sans zones desservies.
  if (llmFallback.length > 0) return { villes: [...llmFallback], source: "llm_brut" };
  return { villes: [], source: "aucune" };
}
