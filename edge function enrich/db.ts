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
import type { ProjectContext, LLMExtraction, GooglePlaceData, EnrichResult } from "./types.ts";

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

  // Étape 2 : update conditionnel. On re-vérifie le statut pour éviter une race.
  // Si statut était 'processing' stale, on n'a pas de garantie atomique parfaite
  // mais c'est acceptable vu la rareté du cas.
  const { data: updated, error: updErr } = await sb
    .from("lead_magnet_projects")
    .update({
      statut: "processing",
      enrichment_started_at: new Date().toISOString(),
      enrichment_error: null,
    })
    .eq("id", projectId)
    .eq("statut", current.statut) // guard: le statut n'a pas changé entre-temps
    .select("id");

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
    if (typeof row.tag === "string") blocked.add(row.tag.trim().toLowerCase());
  }
  return blocked;
}

// ---------------------------------------------------------------------
// Application des résultats d'extraction (cœur de la logique)
// ---------------------------------------------------------------------
export interface ApplyResult {
  updated_fields: string[];
  reviews_inserted: number;
}

export async function applyExtraction(
  sb: SupabaseClient,
  ctx: ProjectContext,
  extraction: LLMExtraction,
  google: GooglePlaceData | null,
  detectedIssues: string[] = [],
): Promise<ApplyResult> {
  const updatedFields: string[] = [];
  const lmpUpdate: Record<string, unknown> = {};
  const entrepriseUpdate: Record<string, unknown> = {};

  // --- services_tags : filtrage allowlist + merge sans doublons ---
  // Seuls les tags autorisés (config globale enrichment_tag_settings) sont
  // utilisés par l'enrichissement. On ne supprime jamais un tag déjà présent
  // sur l'entreprise : le filtrage est non destructif côté source de vérité.
  {
    const blockedTags = await fetchBlockedServiceTags(sb);
    const isAllowed = (tag: string) => !blockedTags.has(tag.trim().toLowerCase());

    const newTags = extraction.services_tags
      .filter((t) => t && t.trim().length > 0)
      .filter(isAllowed);

    // Snapshot du lead magnet : ne doit contenir que des tags autorisés
    // (on purge aussi les tags devenus interdits depuis sa création).
    const finalSnapshot = dedupeCaseInsensitive([
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
      const finalEntreprise = dedupeCaseInsensitive([...ctx.entreprise.service_tags, ...newTags]);
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

  // --- override_location : la grande ville la plus proche ---
  if (!ctx.lmp.override_location && extraction.closest_big_city) {
    lmpUpdate.override_location = extraction.closest_big_city;
    updatedFields.push("override_location");
  }

  // --- villes autour : stockées dans variables (jsonb) ---
  if (extraction.surrounding_cities.length > 0) {
    const currentVars = ctx.lmp.variables ?? {};
    const currentSurrounding = currentVars["surrounding_cities"];
    if (!currentSurrounding || (Array.isArray(currentSurrounding) && currentSurrounding.length === 0)) {
      const joined = extraction.surrounding_cities.join("; ");
      lmpUpdate.variables = {
        ...currentVars,
        surrounding_cities: extraction.surrounding_cities,
        surrounding_cities_text: joined,
      };
      updatedFields.push("variables.surrounding_cities");
    }
  }

  // --- problèmes d'audit pré-détectés : stockés dans variables (jsonb) ---
  // Lus côté CRM (page d'audit) pour pré-cocher les cases. On écrase toujours
  // avec la dernière détection, sans toucher aux autres clés de variables.
  if (detectedIssues.length > 0) {
    const baseVars = (lmpUpdate.variables as Record<string, unknown> | undefined) ?? ctx.lmp.variables ?? {};
    lmpUpdate.variables = { ...baseVars, audit_detected_issues: detectedIssues };
    updatedFields.push("variables.audit_detected_issues");
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

  // ===== Écriture lmp =====
  if (Object.keys(lmpUpdate).length > 0) {
    lmpUpdate.updated_at = new Date().toISOString();
    const { error } = await sb
      .from("lead_magnet_projects")
      .update(lmpUpdate)
      .eq("id", ctx.project_id);
    if (error) throw new Error(`lmp_update: ${error.message}`);
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

  return { updated_fields: updatedFields, reviews_inserted: reviewsInserted };
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
function dedupeCaseInsensitive(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of arr) {
    if (!s || typeof s !== "string") continue;
    const key = s.trim().toLowerCase();
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