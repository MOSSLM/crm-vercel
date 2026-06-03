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
import { fetchGooglePlace, resolvePlaceId } from "./google.ts";
import { extractWithLLM } from "./llm.ts";
import {
  makeSupabaseClient,
  loadProjectContext,
  shouldProcess,
  acquireLock,
  markProjectStatus,
  moveOpportunityToFallbackPipeline,
  applyExtraction,
} from "./db.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const GOOGLE_PLACES_API_KEY = Deno.env.get("GOOGLE_PLACES_API_KEY") ?? "";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
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

    // 5. Google Places (best-effort)
    const placeId = resolvePlaceId(
      ctx.entreprise.google_place_id,
      ctx.entreprise.google_url,
      ctx.entreprise.google_maps_url,
    );
    let googleData = null;
    if (placeId && GOOGLE_PLACES_API_KEY) {
      console.log(`[${projectId}] fetching google place: ${placeId}`);
      googleData = await fetchGooglePlace(placeId, GOOGLE_PLACES_API_KEY);
      if (!googleData) {
        console.warn(`[${projectId}] google place fetch returned null (api error or no data)`);
      }
    } else if (!placeId) {
      const hasFallbackReviews = Array.isArray(ctx.entreprise.google_reviews_5star) && ctx.entreprise.google_reviews_5star.length > 0;
      const hasFallbackCount = ctx.entreprise.nombre_avis != null && ctx.entreprise.nombre_avis > 0;
      console.log(`[${projectId}] no google_place_id → skip API (fallback: nombre_avis=${ctx.entreprise.nombre_avis}, reviews_stored=${hasFallbackReviews})`);
    } else {
      console.warn(`[${projectId}] GOOGLE_PLACES_API_KEY missing in secrets`);
    }

    // 6. LLM extraction
    console.log(`[${projectId}] LLM extraction (${scraped.pages.length} pages, ${scraped.total_chars} chars)`);
    const siteMarkdown = buildSiteContext(scraped);
    const extraction = await extractWithLLM(
      {
        site_markdown: siteMarkdown,
        google_data: googleData,
        current_name: ctx.entreprise.name,
        current_address: ctx.entreprise.adresse,
        current_city: ctx.entreprise.ville,
        current_postal: ctx.entreprise.code_postal,
        current_email: ctx.lmp.override_email,
      },
      OPENAI_API_KEY,
    );

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
    const applyRes = await applyExtraction(sb, ctx, extraction, googleData);
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
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  // Validation des env vars
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !OPENAI_API_KEY) {
    return jsonResponse({ error: "missing_env_vars", hint: "SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY requis" }, 500);
  }

  let body: EnrichRequest;
  try {
    body = await req.json() as EnrichRequest;
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const ids: string[] = [];
  if (body.project_id) ids.push(body.project_id);
  if (Array.isArray(body.project_ids)) ids.push(...body.project_ids);
  const uniq = [...new Set(ids.filter((s) => typeof s === "string" && s.length >= 8))];

  if (uniq.length === 0) {
    return jsonResponse({ error: "no_project_ids" }, 400);
  }
  if (uniq.length > 20) {
    return jsonResponse({ error: "too_many_projects", max: 20 }, 400);
  }

  console.log(`Processing ${uniq.length} project(s)`);

  // Traitement séquentiel (on évite de bombarder APIs externes en parallèle)
  const results: EnrichResult[] = [];
  for (const id of uniq) {
    const r = await processOne(id);
    results.push(r);
  }

  const summary = {
    total: results.length,
    success: results.filter((r) => r.status === "success").length,
    failed: results.filter((r) => r.status === "failed").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    no_website: results.filter((r) => r.status === "no_website").length,
  };
  const response: EnrichResponse = { results, summary };
  return jsonResponse(response, 200);
});