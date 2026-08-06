// =====================================================================
// Edge Function: enrich-lead-magnet
// =====================================================================
// Déclenchement:
//   - Trigger DB via pg_net quand pret_pour_lm passe à true
//   - Appel manuel POST { project_ids: ["uuid", ...] } ou { project_id: "uuid" }
//
// Pour chaque project_id:
//   1. Load context (lmp + entreprise + opportunite + reviews count)
//   2. Valide (pret_pour_lm, lead_magnet=false, statut)
//   3. Acquire lock (statut = 'processing')
//   4. Scrape site web (Jina Reader)
//      → si inaccessible: déplace vers pipeline "sans site web" + status='failed'
//   5. Fetch Google Places (si place_id disponible)
//   6. 1 seul appel LLM (GPT-4o) → extraction structurée
//   7. Apply extraction (écritures non-destructives)
//   8. status = 'framer' + opportunites.lead_magnet = true
// =====================================================================

import type { EnrichRequest, EnrichResponse, EnrichResult } from "./types.ts";
import { scrapeWebsite, buildSiteContext } from "./scraper.ts";
import { sameOrigin } from "./url-variants.ts";
import { fetchGooglePlace, resolvePlaceId, isV1PlaceId, searchPlaceId, extractLatLngFromUrl } from "./google.ts";
import { extractWithLLM } from "./llm.ts";
import {
  makeSupabaseClient,
  loadProjectContext,
  shouldProcess,
  acquireLock,
  markProjectStatus,
  moveOpportunityToFallbackPipeline,
  applyExtraction,
  loadLlmConfig,
  recomputeVilleSeo,
  refreshGoogleStats,
  type RecomputeResult,
  type GoogleStatsResult,
} from "./db.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY") ?? "";
const GOOGLE_PLACES_API_KEY = Deno.env.get("GOOGLE_PLACES_API_KEY") ?? "";

/**
 * Budget de temps d'une invocation, sous la limite murale de la plateforme.
 *
 * Un projet peut coûter jusqu'à ~100 s (Jina jusqu'à 20 s par page, puis un
 * modèle de raisonnement jusqu'à 90 s). Un lot de 20 traité en séquentiel dépasse
 * donc largement la limite, et une expiration ne rendait AUCUNE réponse : on ne
 * savait pas lesquels avaient abouti, et les projets non traités restaient bloqués
 * en `processing` jusqu'à la péremption de 10 minutes.
 *
 * Épuisé, on s'arrête proprement et on rend les identifiants restants, que
 * l'appelant renvoie pour continuer.
 */
const BUDGET_MS = 200_000;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Seule la clé `service_role` peut déclencher cette fonction.
 *
 * `verify_jwt: true` ne suffit PAS : la clé anon est un JWT parfaitement valide,
 * et elle est publique par conception (elle est dans le JS du front). Sans ce
 * contrôle, quiconque l'a lue peut lancer des lots de 20 scrapings et 20 appels
 * LLM sur notre compte, autant de fois qu'il veut.
 *
 * Les deux appelants légitimes portent déjà cette clé : les routes du CRM
 * (`SUPABASE_SERVICE_ROLE_KEY` côté serveur) et le trigger `pg_net`.
 *
 * Comparaison à longueur constante : une comparaison `===` sur des chaînes
 * s'arrête au premier octet différent, ce qui laisse fuir la clé octet par octet
 * à qui sait mesurer. Le coût est nul ici, autant ne pas ouvrir la porte.
 */
function isServiceRoleRequest(req: Request): boolean {
  if (!SERVICE_ROLE_KEY) return false;
  const header = req.headers.get("Authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (token.length !== SERVICE_ROLE_KEY.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) {
    diff |= token.charCodeAt(i) ^ SERVICE_ROLE_KEY.charCodeAt(i);
  }
  return diff === 0;
}

async function processOne(projectId: string): Promise<EnrichResult> {
  const sb = makeSupabaseClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // 1. Load context
  const ctxOrErr = await loadProjectContext(sb, projectId);
  if ("error" in ctxOrErr) {
    return { project_id: projectId, status: "failed", error: ctxOrErr.error };
  }
  const ctx = ctxOrErr;

  // 2. Re-read minimal flags pour validation (acquireLock fera son propre check aussi)
  const { data: lmpFull } = await sb
    .from("lead_magnet_projects")
    .select("pret_pour_lm, statut, enrichment_started_at")
    .eq("id", projectId)
    .maybeSingle();
  if (!lmpFull) {
    return { project_id: projectId, status: "failed", error: "lmp_not_found_on_validate" };
  }
  const check = shouldProcess(
    {
      pret_pour_lm: !!lmpFull.pret_pour_lm,
      statut: lmpFull.statut,
      enrichment_started_at: lmpFull.enrichment_started_at,
    },
    { lead_magnet: ctx.opportunite.lead_magnet },
  );
  if (!check.ok) {
    return { project_id: projectId, status: "skipped", error: check.reason };
  }

  // 3. Acquire lock
  const locked = await acquireLock(sb, projectId);
  if (!locked) {
    return { project_id: projectId, status: "skipped", error: "lock_not_acquired" };
  }

  try {
    // 4. Scrape site
    const siteUrl = ctx.entreprise.site_web_canonique || ctx.entreprise.canonical_url;
    console.log(`[${projectId}] scraping site: ${siteUrl}`);
    const scraped = await scrapeWebsite(siteUrl);

    if (!scraped.accessible) {
      console.log(`[${projectId}] site inaccessible (${scraped.error}) — move to fallback pipeline`);
      // Pas de LLM ici, donc pas de raison "site_en_construction" détectable ;
      // on route vers "sans site web" par défaut.
      await moveOpportunityToFallbackPipeline(sb, ctx.opportunite_id, null);
      await markProjectStatus(sb, projectId, "failed", `no_website: ${scraped.error}`);
      return {
        project_id: projectId,
        status: "no_website",
        error: scraped.error,
      };
    }

    // 4 bis. L'URL stockée était fausse mais le site répond ailleurs (www en
    //        trop, http au lieu de https, redirection) : on corrige la fiche.
    //        Sans ça, chaque relance repart de l'URL morte, et l'audit comme le
    //        site démo continuent de pointer vers un hôte injoignable.
    if (scraped.base_url && siteUrl && !sameOrigin(scraped.base_url, siteUrl)) {
      console.log(`[${projectId}] URL corrigée : ${siteUrl} → ${scraped.base_url}`);
      await sb
        .from("entreprises")
        .update({ site_web_canonique: scraped.base_url, updated_at: new Date().toISOString() })
        .eq("id", ctx.entreprise_id);
    }

    // 5. Google Places (best-effort)
    let googleData = null;
    if (!GOOGLE_PLACES_API_KEY) {
      console.warn(`[${projectId}] GOOGLE_PLACES_API_KEY missing in secrets`);
    } else {
      const rawPlaceId = resolvePlaceId(
        ctx.entreprise.google_place_id,
        ctx.entreprise.google_url,
        ctx.entreprise.google_maps_url,
      );
      // L'ancien format "ftid" (0x...:0x...) est rejeté par l'API v1 : on le
      // re-résout par une recherche texte nom + ville (match vérifié).
      let placeId = rawPlaceId && isV1PlaceId(rawPlaceId) ? rawPlaceId : null;
      if (!placeId) {
        if (rawPlaceId) {
          console.log(`[${projectId}] place_id hérité (${rawPlaceId}) non exploitable par l'API v1 → recherche par nom`);
        }
        // On biaise la recherche avec les coordonnées de l'URL Google si dispo.
        const latLng =
          extractLatLngFromUrl(ctx.entreprise.google_url) ??
          extractLatLngFromUrl(ctx.entreprise.google_maps_url);
        placeId = await searchPlaceId(ctx.entreprise.name, ctx.entreprise.ville, GOOGLE_PLACES_API_KEY, latLng);
        // La recherche texte est FACTURÉE. Sans cette écriture, chaque run la
        // repayait pour retrouver le même identifiant — indéfiniment, sur toutes
        // les fiches dont le place_id stocké est un « ftid » hérité.
        if (placeId) {
          console.log(`[${projectId}] place_id résolu et mémorisé : ${placeId}`);
          await sb
            .from("entreprises")
            .update({ google_place_id: placeId, updated_at: new Date().toISOString() })
            .eq("id", ctx.entreprise_id);
        }
      }
      if (placeId) {
        console.log(`[${projectId}] fetching google place: ${placeId}`);
        googleData = await fetchGooglePlace(placeId, GOOGLE_PLACES_API_KEY);
        if (!googleData) {
          console.warn(`[${projectId}] google place fetch returned null (api error or no data)`);
        }
      } else {
        const hasFallbackReviews = Array.isArray(ctx.entreprise.google_reviews_5star) && ctx.entreprise.google_reviews_5star.length > 0;
        console.log(`[${projectId}] pas de place_id exploitable → skip Google (fallback: nombre_avis=${ctx.entreprise.nombre_avis}, reviews_stored=${hasFallbackReviews})`);
      }
    }

    // 6. LLM extraction (provider/modèle configurables via enrichment_llm_settings)
    const llmConfig = await loadLlmConfig(sb);
    const llmKey = llmConfig.provider === "deepseek" ? DEEPSEEK_API_KEY : OPENAI_API_KEY;
    console.log(`[${projectId}] LLM extraction ${llmConfig.provider}/${llmConfig.model} (${scraped.pages.length} pages, ${scraped.total_chars} chars)`);
    const siteMarkdown = buildSiteContext(scraped);
    const { extraction, usage } = await extractWithLLM(
      {
        site_markdown: siteMarkdown,
        google_data: googleData,
        current_name: ctx.entreprise.name,
        current_address: ctx.entreprise.adresse,
        current_city: ctx.entreprise.ville,
        current_postal: ctx.entreprise.code_postal,
        current_email: ctx.lmp.override_email,
      },
      llmConfig,
      llmKey,
    );
    if (usage) {
      console.log(
        `[${projectId}] tokens ${usage.provider}/${usage.model}: ${usage.prompt_tokens ?? "?"} + ${usage.completion_tokens ?? "?"}`,
      );
    }

    if (!extraction) {
      await markProjectStatus(sb, projectId, "failed", "llm_extraction_failed");
      return { project_id: projectId, status: "failed", error: "llm_extraction_failed" };
    }

    // Si le LLM confirme que le site n'est pas accessible utilement
    if (!extraction.site_accessible) {
      const reason = extraction.site_accessible_reason ?? null;
      console.log(`[${projectId}] LLM dit site non-utile: ${reason} — routing selon raison`);
      // Si LLM a identifié "site_en_construction", on route vers ce pipeline spécifique
      await moveOpportunityToFallbackPipeline(sb, ctx.opportunite_id, reason);
      await markProjectStatus(sb, projectId, "failed", `no_website_content: ${reason ?? "unknown"}`);
      return {
        project_id: projectId,
        status: "no_website",
        error: reason ?? "site_not_useful",
      };
    }

    // 7. Apply extraction
    const applyRes = await applyExtraction(sb, ctx, extraction, googleData, usage);
    console.log(`[${projectId}] applied: ${applyRes.updated_fields.join(", ")}`);

    // 8. Mark as framer
    await markProjectStatus(sb, projectId, "framer");

    return {
      project_id: projectId,
      status: "success",
      updated_fields: applyRes.updated_fields,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[${projectId}] error: ${msg}`);
    try {
      await markProjectStatus(sb, projectId, "failed", msg.slice(0, 500));
    } catch (_) { /* ignore */ }
    return { project_id: projectId, status: "failed", error: msg };
  }
}

// ---------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------
Deno.serve(async (req: Request) => {
  // Plus de préflight permissif : la fonction n'est appelée que de serveur à
  // serveur, jamais depuis un navigateur. Répondre `*` à OPTIONS invitait
  // justement à l'appeler depuis le front avec la clé anon.
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { "Access-Control-Allow-Methods": "POST" } });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  // Validation des env vars AVANT le contrôle d'accès : sans
  // `SUPABASE_SERVICE_ROLE_KEY`, `isServiceRoleRequest` refuse tout le monde, et
  // un 403 laisserait croire à un problème d'appelant plutôt qu'à une fonction
  // mal configurée.
  // La clé LLM (OPENAI_API_KEY / DEEPSEEK_API_KEY) est validée par run selon le
  // provider choisi dans enrichment_llm_settings : extractWithLLM renvoie null
  // (→ statut failed) si la clé du provider manque.
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "missing_env_vars", hint: "SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY requis" }, 500);
  }

  if (!isServiceRoleRequest(req)) {
    console.warn("appel refusé : clé service_role absente ou invalide");
    return jsonResponse({ error: "forbidden", hint: "service_role key required" }, 403);
  }

  let body: EnrichRequest;
  try {
    body = await req.json() as EnrichRequest;
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  // Rafraîchissement de la note + du nombre d'avis Google : un appel Places par
  // entreprise, ni scraping ni LLM. Indexé sur les ENTREPRISES et non sur les
  // projets — les fiches à rattraper n'en ont pas — donc traité avant la
  // résolution des `project_ids`, qui ne s'applique pas ici.
  if (body.action === "refresh_google_stats") {
    const entIds = [...new Set((body.entreprise_ids ?? []).filter((n) => Number.isInteger(n) && n > 0))];
    if (entIds.length === 0) return jsonResponse({ error: "no_entreprise_ids" }, 400);
    if (entIds.length > 200) return jsonResponse({ error: "too_many_entreprises", max: 200 }, 400);
    if (!GOOGLE_PLACES_API_KEY) {
      return jsonResponse({ error: "missing_google_places_api_key" }, 500);
    }
    const sb = makeSupabaseClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    console.log(`Refreshing Google stats for ${entIds.length} entreprise(s)`);
    const startedAt = Date.now();
    const results: GoogleStatsResult[] = [];
    const remaining: number[] = [];
    // Séquentiel : on évite de bombarder l'API Places, comme l'enrichissement. Et
    // borné par le même budget : 200 entreprises × un appel Places (doublé par la
    // recherche par nom quand le place_id est hérité) dépasse aussi la limite.
    for (let i = 0; i < entIds.length; i++) {
      if (Date.now() - startedAt >= BUDGET_MS) {
        remaining.push(...entIds.slice(i));
        break;
      }
      results.push(await refreshGoogleStats(sb, entIds[i], GOOGLE_PLACES_API_KEY));
    }
    return jsonResponse({
      results,
      summary: {
        total: results.length,
        updated: results.filter((r) => r.status === "updated").length,
        unchanged: results.filter((r) => r.status === "unchanged").length,
        skipped: results.filter((r) => r.status === "skipped").length,
        failed: results.filter((r) => r.status === "failed").length,
      },
      done: remaining.length === 0,
      remaining_entreprise_ids: remaining,
      elapsed_ms: Date.now() - startedAt,
    }, 200);
  }

  const ids: string[] = [];
  if (body.project_id) ids.push(body.project_id);
  if (Array.isArray(body.project_ids)) ids.push(...body.project_ids);
  const uniq = [...new Set(ids.filter((s) => typeof s === "string" && s.length >= 8))];

  if (uniq.length === 0) {
    return jsonResponse({ error: "no_project_ids" }, 400);
  }

  // Recalcul de la ville SEO : ni scraping, ni Google, ni LLM — donc pas de
  // raison de plafonner à 20 comme l'enrichissement, et pas de lock à prendre.
  if (body.action === "recompute_ville_seo") {
    if (uniq.length > 500) {
      return jsonResponse({ error: "too_many_projects", max: 500 }, 400);
    }
    const sb = makeSupabaseClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    console.log(`Recomputing ville SEO for ${uniq.length} project(s)`);
    const results: RecomputeResult[] = [];
    for (const id of uniq) {
      results.push(await recomputeVilleSeo(sb, id));
    }
    return jsonResponse({
      results,
      summary: {
        total: results.length,
        updated: results.filter((r) => r.status === "updated").length,
        unchanged: results.filter((r) => r.status === "unchanged").length,
        skipped: results.filter((r) => r.status === "skipped").length,
        failed: results.filter((r) => r.status === "failed").length,
      },
    }, 200);
  }

  if (uniq.length > 20) {
    return jsonResponse({ error: "too_many_projects", max: 20 }, 400);
  }

  console.log(`Processing ${uniq.length} project(s)`);

  // Traitement séquentiel (on évite de bombarder APIs externes en parallèle),
  // borné par le budget de temps : mieux vaut un résultat partiel explicite qu'une
  // expiration muette qui laisse des projets verrouillés.
  const startedAt = Date.now();
  const results: EnrichResult[] = [];
  const remaining: string[] = [];
  for (let i = 0; i < uniq.length; i++) {
    if (Date.now() - startedAt >= BUDGET_MS) {
      remaining.push(...uniq.slice(i));
      console.log(`budget épuisé après ${results.length} projet(s) — ${remaining.length} restant(s)`);
      break;
    }
    results.push(await processOne(uniq[i]));
  }

  const summary = {
    total: results.length,
    success: results.filter((r) => r.status === "success").length,
    failed: results.filter((r) => r.status === "failed").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    no_website: results.filter((r) => r.status === "no_website").length,
  };
  const response: EnrichResponse = {
    results,
    summary,
    done: remaining.length === 0,
    remaining_project_ids: remaining,
    elapsed_ms: Date.now() - startedAt,
  };
  return jsonResponse(response, 200);
});