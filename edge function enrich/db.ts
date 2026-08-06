// =====================================================================
// Couche DB : lectures, locks, écritures
// =====================================================================
// Toutes les règles métier sont ici :
//  - ne pas écraser les champs déjà remplis (COALESCE-like)
//  - merge des services_tags (union sans doublon)
//  - reviews : max 4 actives, ne pas réinsérer si déjà présentes
//  - calculs satisfied_clients / installations
//  - gestion du statut / lock / pipeline "sans site web"
// =====================================================================

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import type { ProjectContext, LLMExtraction, GooglePlaceData, EnrichResult, LlmConfig, LlmProvider, LlmUsage } from "./types.ts";
import { serviceTagKey } from "./types.ts";
import {
  extractLatLngFromUrl,
  fetchGooglePlace,
  isV1PlaceId,
  resolvePlaceId,
  searchPlaceId,
} from "./google.ts";
import { parisRegionFor, pickSeoCity, type LatLng } from "./geo.ts";
import {
  loadBigCityCandidates,
  loadGeoSettings,
  loadOriginCommune,
  loadSurroundingCities,
  loadVilleSeoOverride,
} from "./communes.ts";

// Pipeline "Entreprises sans site web" — UUID constant dans ce projet
const NO_WEBSITE_PIPELINE_ID = "1bbf2933-3c91-4494-9ab9-c582369d25eb";
const NO_WEBSITE_STAGE_ID = 56; // "Qualifié" dans ce pipeline

// Pipeline "Site en construction" — pour les sites accessibles mais pas encore actifs
const UNDER_CONSTRUCTION_PIPELINE_ID = "946481c4-00cc-43f4-a386-8f30382cb9a4";
const UNDER_CONSTRUCTION_STAGE_ID = 66; // "Qualifié" dans ce pipeline

// Raisons qui doivent router vers "Site en construction" plutôt que "Sans site web"
// Le LLM peut retourner ces codes dans extraction.site_accessible_reason
const CONSTRUCTION_REASONS = [
  "site_en_construction",
  "en_construction",
  "under_construction",
  "coming_soon",
  "bientot_disponible",
];

function isUnderConstruction(reason: string | null | undefined): boolean {
  if (!reason) return false;
  const r = reason.toLowerCase();
  return CONSTRUCTION_REASONS.some((c) => r.includes(c));
}

// Lock: si un run est 'processing' depuis plus de 10 min, on considère qu'il est mort
const PROCESSING_STALE_MINUTES = 10;

export function makeSupabaseClient(url: string, serviceKey: string): SupabaseClient {
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ---------------------------------------------------------------------
// Lecture du contexte complet d'un lead_magnet_project
// ---------------------------------------------------------------------
export async function loadProjectContext(
  sb: SupabaseClient,
  projectId: string,
): Promise<ProjectContext | { error: string }> {
  const { data: lmp, error: e1 } = await sb
    .from("lead_magnet_projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();
  if (e1) return { error: `lmp_fetch: ${e1.message}` };
  if (!lmp) return { error: "lmp_not_found" };

  const { data: entreprise, error: e2 } = await sb
    .from("entreprises")
    .select("id, name, adresse, ville, code_postal, site_web_canonique, canonical_url, google_url, google_maps_url, google_place_id, nombre_avis, note_moyenne, service_tags, logo_url, google_reviews_5star")
    .eq("id", lmp.entreprise_id)
    .maybeSingle();
  if (e2) return { error: `entreprise_fetch: ${e2.message}` };
  if (!entreprise) return { error: "entreprise_not_found" };

  const { data: opportunite, error: e3 } = await sb
    .from("opportunites")
    .select("id, lead_magnet, pipeline_id, stage_id")
    .eq("id", lmp.opportunite_id)
    .maybeSingle();
  if (e3) return { error: `opportunite_fetch: ${e3.message}` };
  if (!opportunite) return { error: "opportunite_not_found" };

  // Compter les reviews actives existantes pour ce project
  const { count: reviewsCount } = await sb
    .from("lead_magnet_reviews")
    .select("id", { count: "exact", head: true })
    .eq("lead_magnet_project_id", projectId)
    .eq("is_active", true);

  const ctx: ProjectContext = {
    project_id: projectId,
    opportunite_id: lmp.opportunite_id,
    entreprise_id: lmp.entreprise_id,
    lmp: {
      logo_url: lmp.logo_url ?? null,
      override_entreprise_name: lmp.override_entreprise_name ?? null,
      override_city: lmp.override_city ?? null,
      override_email: lmp.override_email ?? null,
      override_address: lmp.override_address ?? null,
      override_location: lmp.override_location ?? null,
      stat_years_experience: lmp.stat_years_experience ?? null,
      stat_satisfied_clients: lmp.stat_satisfied_clients ?? null,
      stat_installations_completed: lmp.stat_installations_completed ?? null,
      stat_rge_count: lmp.stat_rge_count ?? null,
      service_tags_snapshot: Array.isArray(lmp.service_tags_snapshot) ? lmp.service_tags_snapshot : [],
      variables: (lmp.variables as Record<string, unknown>) ?? {},
    },
    entreprise: {
      name: entreprise.name,
      adresse: entreprise.adresse,
      ville: entreprise.ville,
      code_postal: entreprise.code_postal,
      site_web_canonique: entreprise.site_web_canonique,
      canonical_url: entreprise.canonical_url,
      google_url: entreprise.google_url,
      google_maps_url: entreprise.google_maps_url,
      google_place_id: entreprise.google_place_id,
      nombre_avis: entreprise.nombre_avis,
      note_moyenne: entreprise.note_moyenne ? Number(entreprise.note_moyenne) : null,
      service_tags: Array.isArray(entreprise.service_tags) ? entreprise.service_tags : [],
      logo_url: entreprise.logo_url,
      google_reviews_5star: Array.isArray(entreprise.google_reviews_5star) ? entreprise.google_reviews_5star as unknown[] : null,
    },
    opportunite: {
      lead_magnet: !!opportunite.lead_magnet,
      pipeline_id: opportunite.pipeline_id,
      stage_id: opportunite.stage_id,
    },
    existing_reviews_count: reviewsCount ?? 0,
  };

  return ctx;
}

// ---------------------------------------------------------------------
// Validation pré-enrichissement
// ---------------------------------------------------------------------
export function shouldProcess(
  lmp: { pret_pour_lm: boolean; statut: string; enrichment_started_at: string | null },
  _opp: { lead_magnet: boolean }, // conservé pour compatibilité signature mais non utilisé
): { ok: true } | { ok: false; reason: string } {
  if (!lmp.pret_pour_lm) return { ok: false, reason: "not_ready" };
  // On bloque uniquement sur le statut du project lui-même.
  // On ne bloque PAS sur opportunites.lead_magnet car ce flag existait avant
  // la fonction et peut être à true pour des raisons historiques.
  if (lmp.statut === "framer" || lmp.statut === "ready" || lmp.statut === "published") {
    return { ok: false, reason: `already_${lmp.statut}` };
  }
  // Si processing depuis moins de 10min, on skip (une autre invocation est en cours)
  if (lmp.statut === "processing" && lmp.enrichment_started_at) {
    const startedAt = new Date(lmp.enrichment_started_at).getTime();
    const ageMin = (Date.now() - startedAt) / 60000;
    if (ageMin < PROCESSING_STALE_MINUTES) {
      return { ok: false, reason: "already_processing" };
    }
  }
  return { ok: true };
}

// ---------------------------------------------------------------------
// Acquire lock : passe statut à 'processing' de manière atomique
// Retourne true si on a bien acquis le lock
// ---------------------------------------------------------------------
export async function acquireLock(sb: SupabaseClient, projectId: string): Promise<boolean> {
  // Étape 1 : lire l'état courant pour décider si le lock est prenable
  const { data: current, error: readErr } = await sb
    .from("lead_magnet_projects")
    .select("statut, enrichment_started_at")
    .eq("id", projectId)
    .maybeSingle();

  if (readErr || !current) {
    console.error(`acquireLock read error: ${readErr?.message ?? "not_found"}`);
    return false;
  }

  const staleCutoff = Date.now() - PROCESSING_STALE_MINUTES * 60000;
  const startedAt = current.enrichment_started_at
    ? new Date(current.enrichment_started_at).getTime()
    : 0;

  const canLock =
    current.statut === "draft" ||
    current.statut === "failed" ||
    (current.statut === "processing" && startedAt < staleCutoff);

  if (!canLock) {
    console.warn(`acquireLock: statut=${current.statut}, startedAt=${current.enrichment_started_at}, skip`);
    return false;
  }

  // Étape 2 : update conditionnel.
  //
  // Le garde porte sur le statut ET sur `enrichment_started_at`, ce qui en fait un
  // vrai compare-and-swap dans les trois cas.
  //
  // Le statut seul ne suffisait pas pour un `processing` PÉRIMÉ : il vaut
  // « processing » avant comme après l'écriture, donc deux invocations
  // concurrentes passaient toutes les deux le garde et enrichissaient le même
  // projet — deux scrapings, deux appels LLM, deux fois le coût. En incluant le
  // timestamp, la première écriture le change et la seconde ne matche plus rien.
  let query = sb
    .from("lead_magnet_projects")
    .update({
      statut: "processing",
      enrichment_started_at: new Date().toISOString(),
      enrichment_error: null,
    })
    .eq("id", projectId)
    .eq("statut", current.statut);
  query = current.enrichment_started_at
    ? query.eq("enrichment_started_at", current.enrichment_started_at)
    : query.is("enrichment_started_at", null);
  const { data: updated, error: updErr } = await query.select("id");

  if (updErr) {
    console.error(`acquireLock update error: ${updErr.message}`);
    return false;
  }
  return Array.isArray(updated) && updated.length > 0;
}

// ---------------------------------------------------------------------
// Release lock avec statut final
// ---------------------------------------------------------------------
export async function markProjectStatus(
  sb: SupabaseClient,
  projectId: string,
  statut: "framer" | "failed" | "draft",
  error_message?: string,
): Promise<void> {
  const payload: Record<string, unknown> = {
    statut,
    enrichment_completed_at: new Date().toISOString(),
  };
  if (error_message) payload.enrichment_error = error_message;
  if (statut === "failed") {
    // Incrémenter le compteur d'essais
    const { data: cur } = await sb
      .from("lead_magnet_projects")
      .select("enrichment_attempts")
      .eq("id", projectId)
      .maybeSingle();
    payload.enrichment_attempts = (cur?.enrichment_attempts ?? 0) + 1;
  }
  await sb.from("lead_magnet_projects").update(payload).eq("id", projectId);
}

// ---------------------------------------------------------------------
// Cas "pas de site utile" : déplacer l'opportunité vers le bon pipeline
// selon la raison détectée.
//  - site en construction → pipeline "Site en construction"
//  - tout autre cas (inaccessible, vide, placeholder) → "Entreprises sans site web"
// ---------------------------------------------------------------------
export async function moveOpportunityToFallbackPipeline(
  sb: SupabaseClient,
  opportuniteId: string,
  reason: string | null | undefined,
): Promise<void> {
  const underConstruction = isUnderConstruction(reason);
  const targetPipelineId = underConstruction
    ? UNDER_CONSTRUCTION_PIPELINE_ID
    : NO_WEBSITE_PIPELINE_ID;
  const targetStageId = underConstruction
    ? UNDER_CONSTRUCTION_STAGE_ID
    : NO_WEBSITE_STAGE_ID;
  const flagToAdd = underConstruction
    ? "site_en_construction_auto"
    : "site_inaccessible_auto";

  // Lire les flags actuels pour fusionner proprement
  const { data: cur } = await sb
    .from("opportunites")
    .select("flags")
    .eq("id", opportuniteId)
    .maybeSingle();
  const flags = Array.isArray(cur?.flags) ? [...(cur!.flags as string[])] : [];
  if (!flags.includes(flagToAdd)) flags.push(flagToAdd);

  await sb
    .from("opportunites")
    .update({
      pipeline_id: targetPipelineId,
      stage_id: targetStageId,
      flags,
      updated_at: new Date().toISOString(),
    })
    .eq("id", opportuniteId);
}

// Alias rétrocompat pour ne pas casser d'éventuels appels existants
export const moveOpportunityToNoWebsitePipeline = (
  sb: SupabaseClient,
  opportuniteId: string,
) => moveOpportunityToFallbackPipeline(sb, opportuniteId, null);

// ---------------------------------------------------------------------
// Allowlist d'enrichissement : tags interdits (config globale)
// ---------------------------------------------------------------------
// La table `enrichment_tag_settings` est gérée depuis les Paramètres du CRM.
// Un tag absent de la table est autorisé par défaut ; on ne récupère donc
// que les tags explicitement interdits (allowed = false).
export async function fetchBlockedServiceTags(sb: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await sb
    .from("enrichment_tag_settings")
    .select("tag")
    .eq("allowed", false);
  if (error) {
    console.warn(`fetchBlockedServiceTags error: ${error.message}`);
    return new Set();
  }
  const blocked = new Set<string>();
  for (const row of data ?? []) {
    // Clé canonique, comme côté CRM : `trim().toLowerCase()` laissait
    // « bornes-irve » traverser un blocage enregistré sur « Bornes IRVE ».
    if (typeof row.tag === "string") blocked.add(serviceTagKey(row.tag));
  }
  return blocked;
}

// ---------------------------------------------------------------------
// Config LLM globale : table `enrichment_llm_settings` (ligne id='default'),
// gérée depuis les Paramètres du CRM. Repli sur les variables d'env
// ENRICH_LLM_PROVIDER / ENRICH_LLM_MODEL, puis défaut OpenAI / gpt-5.
// ---------------------------------------------------------------------
export async function loadLlmConfig(sb: SupabaseClient): Promise<LlmConfig> {
  const envProvider = Deno.env.get("ENRICH_LLM_PROVIDER");
  const envModel = Deno.env.get("ENRICH_LLM_MODEL");
  const fallbackProvider: LlmProvider = envProvider === "deepseek" ? "deepseek" : "openai";
  const fallback: LlmConfig = {
    provider: fallbackProvider,
    model: envModel && envModel.trim().length > 0
      ? envModel.trim()
      : (fallbackProvider === "deepseek" ? "deepseek-v4-flash" : "gpt-5"),
  };

  const { data, error } = await sb
    .from("enrichment_llm_settings")
    .select("provider, model")
    .eq("id", "default")
    .maybeSingle();

  if (error) {
    console.warn(`loadLlmConfig error: ${error.message} — fallback ${fallback.provider}/${fallback.model}`);
    return fallback;
  }
  if (!data) return fallback;

  const provider: LlmProvider = data.provider === "deepseek" ? "deepseek" : "openai";
  const model = typeof data.model === "string" && data.model.trim().length > 0
    ? data.model.trim()
    : fallback.model;
  return { provider, model };
}

// ---------------------------------------------------------------------
// Application des résultats d'extraction (cœur de la logique)
// ---------------------------------------------------------------------
export interface ApplyResult {
  updated_fields: string[];
  reviews_inserted: number;
  /**
   * Qui a finalement décidé de la ville SEO (`geo`, `llm`, `override`…), et
   * combien de services le modèle a retenus. Deux mesures reportées dans le
   * journal des runs : la ville SEO est la donnée la plus visible du site, et
   * savoir quelle part revient réellement au modèle change le jugement qu'on
   * porte sur lui.
   */
  ville_seo_source: VilleSeoSource | null;
  service_tags_count: number;
}

export async function applyExtraction(
  sb: SupabaseClient,
  ctx: ProjectContext,
  extraction: LLMExtraction,
  google: GooglePlaceData | null,
  /** Consommation de l'appel LLM, stockée pour pouvoir attribuer le coût. */
  usage: LlmUsage | null = null,
): Promise<ApplyResult> {
  const updatedFields: string[] = [];
  const lmpUpdate: Record<string, unknown> = {};
  const entrepriseUpdate: Record<string, unknown> = {};
  // Mesures rendues à l'appelant pour le journal des runs.
  let villeSeoSource: VilleSeoSource | null = null;
  let serviceTagsCount = 0;

  // --- services_tags : filtrage allowlist + merge sans doublons ---
  // Seuls les tags autorisés (config globale enrichment_tag_settings) sont
  // utilisés par l'enrichissement. On ne supprime jamais un tag déjà présent
  // sur l'entreprise : le filtrage est non destructif côté source de vérité.
  {
    const blockedTags = await fetchBlockedServiceTags(sb);
    const isAllowed = (tag: string) => !blockedTags.has(serviceTagKey(tag));

    const newTags = extraction.services_tags
      .filter((t) => t && t.trim().length > 0)
      .filter(isAllowed);
    // Après allowlist : c'est ce que le modèle a réellement apporté d'exploitable.
    serviceTagsCount = newTags.length;

    // Snapshot du lead magnet : ne doit contenir que des tags autorisés
    // (on purge aussi les tags devenus interdits depuis sa création).
    const finalSnapshot = dedupeServiceTags([
      ...ctx.lmp.service_tags_snapshot.filter(isAllowed),
      ...newTags,
    ]);
    if (JSON.stringify(finalSnapshot) !== JSON.stringify(ctx.lmp.service_tags_snapshot)) {
      lmpUpdate.service_tags_snapshot = finalSnapshot;
      updatedFields.push("service_tags_snapshot");
    }

    // Entreprise : merge non destructif — on conserve tous les tags existants
    // et on n'ajoute que les nouveaux tags autorisés.
    if (newTags.length > 0) {
      const finalEntreprise = dedupeServiceTags([...ctx.entreprise.service_tags, ...newTags]);
      if (finalEntreprise.length !== ctx.entreprise.service_tags.length) {
        entrepriseUpdate.service_tags = finalEntreprise;
        updatedFields.push("entreprise.service_tags");
      }
    }
  }

  // --- override_entreprise_name : seulement si vide ET différence notable avec Google ---
  if (!ctx.lmp.override_entreprise_name && extraction.company_name_clean) {
    const currentName = ctx.entreprise.name ?? "";
    // On ne l'applique que si le nom propre est substantiellement plus court (sinon c'est pareil)
    if (extraction.company_name_clean.length < currentName.length - 3) {
      lmpUpdate.override_entreprise_name = extraction.company_name_clean;
      updatedFields.push("override_entreprise_name");
    }
  }

  // --- override_email : uniquement si vide ---
  if (!ctx.lmp.override_email && extraction.email) {
    lmpUpdate.override_email = extraction.email;
    updatedFields.push("override_email");
  }

  // --- override_address : uniquement si actuelle buguée ---
  const currentAddress = ctx.lmp.override_address || ctx.entreprise.adresse || "";
  const isAddressBugged = isBuggedAddress(currentAddress);
  const googleAddress = google?.formatted_address ?? null;
  const finalAddress = extraction.address_clean ?? googleAddress;
  if (isAddressBugged && finalAddress) {
    lmpUpdate.override_address = finalAddress;
    updatedFields.push("override_address");
  }

  // --- logo_url : uniquement si vide dans lmp ET dans entreprises ---
  if (!ctx.lmp.logo_url && extraction.logo_url) {
    lmpUpdate.logo_url = extraction.logo_url;
    updatedFields.push("logo_url");
    // On sync aussi côté entreprise si c'était vide
    if (!ctx.entreprise.logo_url) {
      entrepriseUpdate.logo_url = extraction.logo_url;
      updatedFields.push("entreprise.logo_url");
    }
  }

  // --- note + nombre d'avis Google ---
  //
  // Ces deux champs étaient RÉCUPÉRÉS puis jetés : `google.total_reviews` ne
  // servait qu'à estimer `stat_satisfied_clients` (× 1.4 plus bas), et rien ne
  // les écrivait sur l'entreprise. Leur valeur restait donc celle du scraping
  // initial, d'où 132 fiches avec une note Google et zéro avis — et un site qui
  // affiche « 4,8 (0 avis) ».
  //
  // Écriture autoritaire, contrairement au reste de cette fonction : Google EST
  // la source de ces deux chiffres, et une note périmée n'a aucune valeur. Mais
  // seulement quand Google répond vraiment — un `null` ne doit jamais effacer une
  // valeur existante.
  if (google?.total_reviews != null && google.total_reviews !== ctx.entreprise.nombre_avis) {
    entrepriseUpdate.nombre_avis = google.total_reviews;
    updatedFields.push("entreprise.nombre_avis");
  }
  if (google?.rating != null && Number(ctx.entreprise.note_moyenne) !== google.rating) {
    entrepriseUpdate.note_moyenne = google.rating;
    updatedFields.push("entreprise.note_moyenne");
  }

  // --- ville SEO : la grande ville mise en avant sur le site ---
  // Source de vérité = `override_city`, qui alimente `{{ entreprise.ville_seo }}`.
  // `override_location` est conservé en miroir pour les designs déjà publiés qui
  // utilisent encore `{{ entreprise.location }}`.
  // Écriture fill-only : une valeur saisie à la main n'est jamais écrasée.
  if (!ctx.lmp.override_city || !ctx.lmp.override_location) {
    const decision = await resolveVilleSeo(sb, ctx, extraction, google);
    if (decision) {
      villeSeoSource = decision.source;
      console.log(
        `[${ctx.project_id}] ville SEO = ${decision.ville} — source ${decision.source}` +
          (decision.detail ? ` (${decision.detail})` : ""),
      );
      if (!ctx.lmp.override_city) {
        lmpUpdate.override_city = decision.ville;
        lmpUpdate.override_city_source = "auto";
        updatedFields.push(`override_city(${decision.source})`);
      }
      if (!ctx.lmp.override_location) {
        lmpUpdate.override_location = decision.ville;
        updatedFields.push("override_location");
      }
    } else {
      console.warn(`[${ctx.project_id}] ville SEO indéterminable (aucune source n'a répondu)`);
    }
  }

  // --- villes autour : stockées dans variables (jsonb) ---
  //
  // Ces villes s'affichent sur le site comme secteur d'intervention. Elles venaient
  // du LLM, sans aucune validation, alors que la ville SEO juste à côté était
  // calculée sur des distances réelles : la même page mêlait une donnée vérifiée et
  // une donnée devinée. On les calcule donc depuis `communes_fr`, et la liste du
  // modèle ne sert plus que de repli — filtrée par l'existence en base.
  {
    const currentVars = ctx.lmp.variables ?? {};
    const currentSurrounding = currentVars["surrounding_cities"];
    const alreadySet =
      Array.isArray(currentSurrounding) && currentSurrounding.length > 0;

    if (!alreadySet) {
      // La ville SEO qu'on vient éventuellement de décider, sinon celle déjà en
      // place : on ne veut pas la citer comme « zone desservie » alors qu'elle est
      // mise en avant partout ailleurs sur le site.
      const villeSeo = (lmpUpdate.override_city as string | undefined) ?? ctx.lmp.override_city;
      const villes = await resolveSurroundingCities(sb, ctx, extraction, google, villeSeo);
      if (villes.length > 0) {
        lmpUpdate.variables = {
          ...currentVars,
          surrounding_cities: villes,
          surrounding_cities_text: villes.join("; "),
        };
        updatedFields.push("variables.surrounding_cities");
      }
    }
  }

  // --- stat_years_experience : uniquement si vide/default ---
  if (isEmptyStat(ctx.lmp.stat_years_experience) && extraction.years_experience != null) {
    lmpUpdate.stat_years_experience = String(extraction.years_experience);
    updatedFields.push("stat_years_experience");
  }

  // --- stat_rge_count ---
  if (isEmptyStat(ctx.lmp.stat_rge_count) && extraction.rge_count != null) {
    lmpUpdate.stat_rge_count = String(extraction.rge_count);
    updatedFields.push("stat_rge_count");
  }

  // --- stat_satisfied_clients : priorités ---
  //  1. Valeur extraite du site (LLM)
  //  2. Nb avis Google API (live) × 1.4
  //  3. Nb avis stocké dans entreprises.nombre_avis (fallback, valeurs scrapées initialement) × 1.4
  if (isEmptyStat(ctx.lmp.stat_satisfied_clients)) {
    let satisfied: number | null = null;
    let source: string | null = null;
    if (extraction.satisfied_clients_from_site != null) {
      satisfied = extraction.satisfied_clients_from_site;
      source = "site";
    } else if (google?.total_reviews != null && google.total_reviews > 0) {
      satisfied = Math.round(google.total_reviews * 1.4);
      source = "google_live";
    } else if (ctx.entreprise.nombre_avis != null && ctx.entreprise.nombre_avis > 0) {
      // Fallback: on utilise le nombre d'avis déjà scrapé et stocké en DB
      satisfied = Math.round(ctx.entreprise.nombre_avis * 1.4);
      source = "entreprises_db";
    }
    if (satisfied != null) {
      lmpUpdate.stat_satisfied_clients = String(satisfied);
      updatedFields.push(`stat_satisfied_clients(${source})`);
    }
  }

  // --- stat_installations_completed : site > satisfied × 2 ---
  if (isEmptyStat(ctx.lmp.stat_installations_completed)) {
    let installations: number | null = null;
    if (extraction.installations_from_site != null) {
      installations = extraction.installations_from_site;
    } else {
      // On recalcule à partir de ce qu'on vient éventuellement de mettre
      const satisfiedStr = (lmpUpdate.stat_satisfied_clients as string) ?? ctx.lmp.stat_satisfied_clients;
      const satisfiedNum = satisfiedStr ? parseInt(satisfiedStr, 10) : NaN;
      if (!isNaN(satisfiedNum) && satisfiedNum > 0) {
        installations = satisfiedNum * 2;
      }
    }
    if (installations != null) {
      lmpUpdate.stat_installations_completed = String(installations);
      updatedFields.push("stat_installations_completed");
    }
  }

  // --- consommation LLM : toujours écrite, même quand rien d'autre ne change ---
  // C'est le seul moyen d'attribuer un coût à une fiche. Les colonnes viennent
  // d'une migration appliquée à la main : `updateProject` les retire d'office si
  // elles manquent (cf. OPTIONAL_PROJECT_COLUMNS).
  if (usage) {
    lmpUpdate.enrichment_tokens_prompt = usage.prompt_tokens;
    lmpUpdate.enrichment_tokens_completion = usage.completion_tokens;
    lmpUpdate.enrichment_model = `${usage.provider}/${usage.model}`;
  }

  // ===== Écriture lmp =====
  if (Object.keys(lmpUpdate).length > 0) {
    lmpUpdate.updated_at = new Date().toISOString();
    const error = await updateProject(sb, ctx.project_id, lmpUpdate);
    if (error) throw new Error(`lmp_update: ${error}`);
  }

  // ===== Écriture entreprise =====
  if (Object.keys(entrepriseUpdate).length > 0) {
    entrepriseUpdate.updated_at = new Date().toISOString();
    const { error } = await sb
      .from("entreprises")
      .update(entrepriseUpdate)
      .eq("id", ctx.entreprise_id);
    if (error) throw new Error(`entreprise_update: ${error.message}`);
  }

  // ===== Reviews =====
  const reviewsInserted = await insertReviewsIfNeeded(sb, ctx, google);
  if (reviewsInserted > 0) updatedFields.push(`${reviewsInserted}_reviews`);

  // ===== Marquer l'opportunité comme lead_magnet = true =====
  await sb
    .from("opportunites")
    .update({ lead_magnet: true, updated_at: new Date().toISOString() })
    .eq("id", ctx.opportunite_id);
  updatedFields.push("opportunite.lead_magnet");

  return {
    updated_fields: updatedFields,
    reviews_inserted: reviewsInserted,
    ville_seo_source: villeSeoSource,
    service_tags_count: serviceTagsCount,
  };
}

// ---------------------------------------------------------------------
// Ville SEO
// ---------------------------------------------------------------------

/**
 * Colonnes issues de migrations appliquées à la main, dont l'absence ne doit pas
 * faire échouer tout l'enrichissement — on ne perd qu'une trace, pas la donnée
 * métier.
 *
 * `override_city_source` vient de la migration 20260727 ; les trois colonnes de
 * consommation LLM sont plus récentes encore. Sans ce repli, une edge function
 * déployée avant la migration ferait échouer chaque projet sur une colonne
 * inconnue.
 */
const OPTIONAL_PROJECT_COLUMNS = [
  "override_city_source",
  "enrichment_tokens_prompt",
  "enrichment_tokens_completion",
  "enrichment_model",
] as const;

/**
 * Écrit sur `lead_magnet_projects` en retirant les colonnes optionnelles absentes.
 *
 * Une seule nouvelle tentative, sans TOUTES les colonnes optionnelles présentes
 * dans le payload : l'erreur PostgREST ne nomme pas toujours la colonne fautive,
 * et retirer les quatre d'un coup coûte moins qu'un aller-retour par colonne.
 * Retourne le message d'erreur, ou null si l'écriture a réussi.
 */
async function updateProject(
  sb: SupabaseClient,
  projectId: string,
  payload: Record<string, unknown>,
): Promise<string | null> {
  const { error } = await sb.from("lead_magnet_projects").update(payload).eq("id", projectId);
  if (!error) return null;

  const missingColumn =
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /column .* does not exist|could not find the .* column/i.test(error.message ?? "");
  const optionalInPayload = OPTIONAL_PROJECT_COLUMNS.filter((c) => c in payload);
  if (!missingColumn || optionalInPayload.length === 0) return error.message;

  console.warn(
    `updateProject: colonne optionnelle absente (migration non appliquée) — nouvelle écriture sans ${optionalInPayload.join(", ")}`,
  );
  const rest = { ...payload };
  for (const c of optionalInPayload) delete rest[c];
  if (Object.keys(rest).length === 0) return null; // il ne restait que de l'optionnel
  const retry = await sb.from("lead_magnet_projects").update(rest).eq("id", projectId);
  return retry.error ? retry.error.message : null;
}

export type VilleSeoSource = "override" | "paris_region" | "geo" | "llm" | "entreprise";

export interface VilleSeoDecision {
  ville: string;
  source: VilleSeoSource;
  /** Détail du palier géographique, quand c'est le calcul qui a décidé. */
  detail?: string;
}

/**
 * Coordonnées de l'entreprise, du plus précis au plus large :
 *   1. Google Places (le point du commerce lui-même)
 *   2. les coordonnées lisibles dans l'URL Google stockée
 *   3. le centre de sa commune, via le code postal
 * Les deux premières sont gratuites — on les a déjà en mémoire à ce stade.
 */
async function resolveOrigin(
  sb: SupabaseClient,
  ctx: ProjectContext,
  google: GooglePlaceData | null,
): Promise<{ point: LatLng; from: string } | null> {
  if (typeof google?.lat === "number" && typeof google?.lng === "number") {
    return { point: { lat: google.lat, lon: google.lng }, from: "google_places" };
  }

  const fromUrl =
    extractLatLngFromUrl(ctx.entreprise.google_url) ??
    extractLatLngFromUrl(ctx.entreprise.google_maps_url);
  if (fromUrl) {
    return { point: { lat: fromUrl.lat, lon: fromUrl.lng }, from: "google_url" };
  }

  const commune = await loadOriginCommune(sb, ctx.entreprise.code_postal, ctx.entreprise.ville);
  if (commune) {
    return { point: { lat: commune.lat, lon: commune.lon }, from: `commune:${commune.nom}` };
  }

  return null;
}

/**
 * Zones desservies de l'entreprise, calculées puis complétées par le LLM.
 *
 * Même origine géographique que la ville SEO (`resolveOrigin`) : les deux données
 * s'affichent sur la même page, il serait absurde qu'elles ne partent pas du même
 * point. Sans coordonnées, on retombe sur la liste du modèle — le comportement
 * d'avant la correction.
 */
async function resolveSurroundingCities(
  sb: SupabaseClient,
  ctx: ProjectContext,
  extraction: LLMExtraction,
  google: GooglePlaceData | null,
  villeSeo: string | null,
): Promise<string[]> {
  const origin = await resolveOrigin(sb, ctx, google);
  if (!origin) {
    console.log(`[${ctx.project_id}] zones desservies : aucune coordonnée → liste du LLM telle quelle`);
    return [...extraction.surrounding_cities];
  }

  const exclude = [ctx.entreprise.ville, villeSeo].filter((v): v is string => !!v);
  const { villes, source } = await loadSurroundingCities(
    sb,
    origin.point,
    exclude,
    extraction.surrounding_cities,
  );
  console.log(
    `[${ctx.project_id}] zones desservies : ${villes.length} ville(s), source=${source} (origine ${origin.from})`,
  );
  return villes;
}

/**
 * Détermine la ville SEO, par ordre d'autorité :
 *   1. `ville_seo_overrides` — une correction manuelle gagne toujours
 *   2. Île-de-France → « Région parisienne » (cf. `parisRegionFor`) : dans
 *      l'agglomération, l'arbitrage par distance désigne une commune voisine
 *      sans rapport (Évry → Montreuil)
 *   3. le calcul géographique sur `communes_fr` (distance réelle + paliers)
 *   4. l'extraction du LLM — filet quand le référentiel n'est pas chargé ou
 *      qu'aucune coordonnée n'est trouvable
 *   5. la ville de l'entreprise — dernier recours, toujours une vraie ville
 *
 * Aucune étape ne peut faire échouer l'enrichissement : les lectures de
 * `communes.ts` dégradent en silence si la migration n'est pas appliquée.
 */
export async function resolveVilleSeo(
  sb: SupabaseClient,
  ctx: ProjectContext,
  extraction: LLMExtraction | null,
  google: GooglePlaceData | null,
): Promise<VilleSeoDecision | null> {
  const override = await loadVilleSeoOverride(
    sb,
    ctx.entreprise.code_postal,
    ctx.entreprise.ville,
  );
  if (override) return { ville: override, source: "override" };

  const parisRegion = parisRegionFor(ctx.entreprise.code_postal);
  if (parisRegion) {
    return {
      ville: parisRegion,
      source: "paris_region",
      detail: `département ${(ctx.entreprise.code_postal ?? "").slice(0, 2)}`,
    };
  }

  const origin = await resolveOrigin(sb, ctx, google);
  if (origin) {
    const settings = await loadGeoSettings(sb);
    const candidates = await loadBigCityCandidates(
      sb,
      origin.point,
      settings.maxRadiusKm,
      settings.bigCityPopulation,
    );
    const pick = pickSeoCity(origin.point, candidates, settings);
    if (pick) {
      return {
        ville: pick.nom,
        source: "geo",
        detail: `${pick.rule}, ${pick.distanceKm.toFixed(1)} km, ${pick.population} hab, origine ${origin.from}`,
      };
    }
    console.log(
      `[${ctx.project_id}] aucune grande ville dans ${settings.maxRadiusKm} km (origine ${origin.from}, ${candidates.length} candidates)`,
    );
  }

  if (extraction?.closest_big_city) {
    return { ville: extraction.closest_big_city, source: "llm" };
  }
  if (ctx.entreprise.ville) {
    return { ville: ctx.entreprise.ville, source: "entreprise" };
  }
  return null;
}

export interface RecomputeResult {
  project_id: string;
  status: "updated" | "unchanged" | "skipped" | "failed";
  ville_seo?: string;
  source?: VilleSeoSource;
  reason?: string;
}

export interface GoogleStatsResult {
  entreprise_id: number;
  status: "updated" | "unchanged" | "skipped" | "failed";
  nombre_avis?: number | null;
  note_moyenne?: number | null;
  reason?: string;
}

/**
 * Va chercher la note et le nombre d'avis sur la fiche Google d'une entreprise,
 * sans rien d'autre : un appel Places, ni scraping ni LLM, donc AUCUNE IA — ce
 * sont deux champs d'API (`rating`, `userRatingCount`).
 *
 * Sert à rattraper les fiches dont le scraping initial n'avait relevé que la
 * note : 132 entreprises affichaient une note Google avec zéro avis, ce que le
 * site rendait en « 4,8 (0 avis) ». L'enrichissement complet aurait pu les
 * corriger, mais il coûte un scraping et un appel LLM par fiche, et aucune de ces
 * 132 n'a de projet lead magnet — donc rien à enrichir.
 *
 * Travaille sur l'ENTREPRISE, pas sur un projet : c'est là que vivent les deux
 * colonnes, et c'est la seule clé qui atteint ces fiches.
 */
export async function refreshGoogleStats(
  sb: SupabaseClient,
  entrepriseId: number,
  apiKey: string,
): Promise<GoogleStatsResult> {
  if (!apiKey) return { entreprise_id: entrepriseId, status: "failed", reason: "no_api_key" };

  const { data: ent, error } = await sb
    .from("entreprises")
    .select("id, name, ville, google_place_id, google_url, google_maps_url, nombre_avis, note_moyenne")
    .eq("id", entrepriseId)
    .maybeSingle();
  if (error) return { entreprise_id: entrepriseId, status: "failed", reason: error.message };
  if (!ent) return { entreprise_id: entrepriseId, status: "failed", reason: "entreprise_not_found" };

  // Même résolution que l'enrichissement complet : le place_id stocké s'il est
  // exploitable par l'API v1, sinon une recherche texte biaisée par les
  // coordonnées de l'URL Google. Les anciens « ftid » (0x…:0x…) sont rejetés par
  // v1, d'où le repli.
  const raw = resolvePlaceId(ent.google_place_id, ent.google_url, ent.google_maps_url);
  let placeId = raw && isV1PlaceId(raw) ? raw : null;
  let resolvedBySearch = false;
  if (!placeId) {
    const latLng = extractLatLngFromUrl(ent.google_url) ?? extractLatLngFromUrl(ent.google_maps_url);
    placeId = await searchPlaceId(ent.name, ent.ville, apiKey, latLng);
    resolvedBySearch = placeId !== null;
  }
  if (!placeId) return { entreprise_id: entrepriseId, status: "skipped", reason: "no_place_id" };

  const google = await fetchGooglePlace(placeId, apiKey);
  if (!google) return { entreprise_id: entrepriseId, status: "failed", reason: "places_fetch_failed" };

  // Un `null` de Google ne doit jamais effacer une valeur existante : on écrit
  // seulement ce qui a été effectivement retourné.
  const stats: Record<string, unknown> = {};
  if (google.total_reviews != null && google.total_reviews !== ent.nombre_avis) {
    stats.nombre_avis = google.total_reviews;
  }
  if (google.rating != null && Number(ent.note_moyenne) !== google.rating) {
    stats.note_moyenne = google.rating;
  }

  // La mémorisation du place_id est comptée à part des statistiques : le
  // place_id obtenu par recherche texte est FACTURÉ et doit être écrit pour ne pas
  // repayer la même résolution au prochain passage, mais l'écrire ne veut pas dire
  // que la note ou le nombre d'avis ont changé. Les confondre aurait fait passer
  // toutes les fiches en « mise à jour » dans le rapport.
  const update: Record<string, unknown> = { ...stats };
  if (resolvedBySearch) update.google_place_id = placeId;

  const statsChanged = Object.keys(stats).length > 0;

  if (Object.keys(update).length > 0) {
    update.updated_at = new Date().toISOString();
    const { error: upErr } = await sb.from("entreprises").update(update).eq("id", entrepriseId);
    if (upErr) return { entreprise_id: entrepriseId, status: "failed", reason: upErr.message };
  }

  return {
    entreprise_id: entrepriseId,
    status: statsChanged ? "updated" : "unchanged",
    nombre_avis: (stats.nombre_avis as number | undefined) ?? ent.nombre_avis,
    note_moyenne:
      (stats.note_moyenne as number | undefined) ??
      (ent.note_moyenne == null ? null : Number(ent.note_moyenne)),
  };
}

/**
 * Recalcule la ville SEO d'un projet déjà enrichi, sans rejouer le scraping ni
 * le LLM — donc sans coût. Sert à rattraper les projets remplis par une version
 * antérieure de la règle.
 *
 * Contrairement à l'enrichissement, l'écriture ÉCRASE la valeur en place : c'est
 * tout l'intérêt d'un recalcul. Garde-fou : les projets dont la ville SEO a été
 * saisie à la main (`override_city_source = 'manual'`) sont laissés intacts.
 */
export async function recomputeVilleSeo(
  sb: SupabaseClient,
  projectId: string,
): Promise<RecomputeResult> {
  const ctxOrErr = await loadProjectContext(sb, projectId);
  if ("error" in ctxOrErr) {
    return { project_id: projectId, status: "failed", reason: ctxOrErr.error };
  }
  const ctx = ctxOrErr;

  const { data: row } = await sb
    .from("lead_magnet_projects")
    .select("override_city, override_city_source")
    .eq("id", projectId)
    .maybeSingle();
  if (row?.override_city_source === "manual") {
    return { project_id: projectId, status: "skipped", reason: "manual" };
  }

  // Pas d'appel Google ici : `resolveOrigin` se rabat sur les coordonnées de
  // l'URL Google déjà stockée, puis sur le centre de la commune. Gratuit.
  const decision = await resolveVilleSeo(sb, ctx, null, null);
  if (!decision) {
    return { project_id: projectId, status: "failed", reason: "no_source" };
  }
  if (decision.ville === row?.override_city) {
    return { project_id: projectId, status: "unchanged", ville_seo: decision.ville, source: decision.source };
  }

  const error = await updateProject(sb, projectId, {
    override_city: decision.ville,
    override_location: decision.ville,
    override_city_source: "auto",
    updated_at: new Date().toISOString(),
  });
  if (error) {
    return { project_id: projectId, status: "failed", reason: error };
  }

  return { project_id: projectId, status: "updated", ville_seo: decision.ville, source: decision.source };
}

async function insertReviewsIfNeeded(
  sb: SupabaseClient,
  ctx: ProjectContext,
  google: GooglePlaceData | null,
): Promise<number> {
  const target = 4;
  const needed = Math.max(0, target - ctx.existing_reviews_count);
  if (needed === 0) return 0;

  // Source 1 : Google API (live)
  let candidates: Array<{ author_name: string; text: string }> = [];
  if (google && google.reviews_5star.length > 0) {
    candidates = google.reviews_5star.map((r) => ({
      author_name: r.author_name,
      text: r.text,
    }));
  }

  // Source 2 : fallback sur entreprises.google_reviews_5star (reviews scrapées précédemment)
  // Format attendu: array d'objets avec des clés flexibles (author_name/author/name, text/comment/review, rating)
  if (candidates.length === 0 && Array.isArray(ctx.entreprise.google_reviews_5star)) {
    for (const raw of ctx.entreprise.google_reviews_5star) {
      if (typeof raw !== "object" || raw == null) continue;
      const obj = raw as Record<string, unknown>;
      const author = (obj.author_name ?? obj.author ?? obj.name ?? obj.user) as string | undefined;
      const text = (obj.text ?? obj.comment ?? obj.review ?? obj.review_text) as string | undefined;
      const rating = (obj.rating ?? obj.stars) as number | undefined;
      if (typeof author !== "string" || typeof text !== "string") continue;
      if (text.trim().length < 20) continue;
      // Si rating explicite, on filtre. Sinon on suppose que c'est déjà filtré (la colonne s'appelle google_reviews_5star)
      if (rating != null && rating !== 5) continue;
      candidates.push({ author_name: author.trim(), text: text.trim() });
    }
    if (candidates.length > 0) {
      console.log(`[${ctx.project_id}] reviews fallback depuis entreprises.google_reviews_5star (${candidates.length} candidates)`);
    }
  }

  if (candidates.length === 0) return 0;

  const toInsert = candidates.slice(0, needed).map((r, idx) => ({
    lead_magnet_project_id: ctx.project_id,
    source: "google",
    source_review_idx: ctx.existing_reviews_count + idx,
    author_name: r.author_name,
    review_text: r.text,
    rating: 5.0,
    is_manual: false,
    is_active: true,
    display_order: (ctx.existing_reviews_count + idx) * 10 + 100,
  }));
  if (toInsert.length === 0) return 0;

  const { error } = await sb.from("lead_magnet_reviews").insert(toInsert);
  if (error) {
    console.error(`reviews_insert error: ${error.message}`);
    return 0;
  }
  return toInsert.length;
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------
/**
 * Dédoublonne des service tags par clé canonique.
 *
 * La casse seule ne suffisait pas : « Bornes IRVE » et « bornes-irve » sont le
 * même service pour tout le reste du CRM, mais passaient ici pour deux tags
 * distincts. Une entreprise finissait avec les deux dans `service_tags`, et la
 * fiche affichait le doublon.
 */
function dedupeServiceTags(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of arr) {
    if (!s || typeof s !== "string") continue;
    const key = serviceTagKey(s);
    if (key.length === 0) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s.trim());
  }
  return out;
}

function isEmptyStat(v: string | null): boolean {
  if (v == null) return true;
  const trimmed = v.trim();
  if (trimmed.length === 0) return true;
  if (trimmed === "—" || trimmed === "-" || trimmed === "0") return true;
  return false;
}

/**
 * Détecte une adresse visiblement buguée (ex: "4(9)" issu d'un scrape qui a
 * pris la note Google au lieu de l'adresse).
 */
function isBuggedAddress(addr: string): boolean {
  if (!addr || addr.trim().length === 0) return true;
  const trimmed = addr.trim();
  // Trop courte pour être une adresse
  if (trimmed.length < 10) return true;
  // Match des patterns type "4(9)" ou "4,9(12)" typiques des notes Google
  if (/^\s*\d(?:[,.]\d)?\s*\(\d+\)\s*$/.test(trimmed)) return true;
  // Pas de chiffre du tout ou pas de lettre → probablement invalide
  if (!/\d/.test(trimmed) || !/[a-zA-Zà-üÀ-Ü]/.test(trimmed)) return true;
  return false;
}