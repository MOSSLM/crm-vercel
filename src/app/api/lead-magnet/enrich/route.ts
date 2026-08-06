import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "@/env";
import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { enrichLeadMagnetSchema } from "@/app/api/_lib/schemas";
import { withAuth } from "@/app/api/_lib/with-auth";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { resolveAgentContext, spentCentsForAgent } from "@/app/api/_lib/require-capability";
import { republishSitesForProjects } from "@/lib/site-builder/republish-after-enrichment";

export const runtime = "nodejs";
export const maxDuration = 300;

export const OPTIONS = (req: Request) => preflight(req);

type EnrichPricing = { provider: string | null; model: string | null; costPerRunCents: number };

/**
 * Prix forfaitaire d'un run, configuré dans Paramètres › Enrichissement.
 * `cost_per_run_cents` peut manquer (migration non appliquée) → coût nul, donc
 * aucun budget ne bloque.
 */
const loadEnrichPricing = async (): Promise<EnrichPricing> => {
  const { data } = await getServiceClient()
    .from("enrichment_llm_settings")
    .select("provider, model, cost_per_run_cents")
    .eq("id", "default")
    .maybeSingle();

  return {
    provider: (data?.provider as string | null) ?? null,
    model: (data?.model as string | null) ?? null,
    costPerRunCents: Number(data?.cost_per_run_cents) || 0,
  };
};

/**
 * POST /api/lead-magnet/enrich
 *
 * Point de passage unique de l'enrichissement côté Next.js : c'est la seule
 * étape payante du marketing pipeline (la création de site démo est un clone
 * SQL, l'audit un insert de contenu templaté). C'est donc ici que le plafond de
 * dépense par agent est appliqué et que la consommation est comptabilisée.
 *
 * Un admin passe sans restriction. Un agent freelance doit avoir la capacité
 * `marketing_pipeline` et rester sous son plafond, sinon 402.
 */
export const POST = withAuth({ body: enrichLeadMagnetSchema }, async ({ body, user, cors }) => {
  const { project_id } = body;

  const ctx = await resolveAgentContext(user.id);
  const isAgent = ctx.role === "freelance";
  let pricing: EnrichPricing = { provider: null, model: null, costPerRunCents: 0 };
  let entrepriseId: number | null = null;

  if (isAgent) {
    if (!ctx.canUseMarketingPipeline) {
      return jsonError("capability_refusee", 403, { capability: "marketing_pipeline" }, cors);
    }

    const sc = getServiceClient();
    const { data: project } = await sc
      .from("lead_magnet_projects")
      .select("id, entreprise_id")
      .eq("id", project_id)
      .maybeSingle();
    if (!project) return jsonError("projet_introuvable", 404, {}, cors);
    entrepriseId = project.entreprise_id == null ? null : Number(project.entreprise_id);

    // Un agent n'enrichit que ses propres entreprises.
    if (entrepriseId == null) return jsonError("entreprise_introuvable", 404, {}, cors);
    const { data: ent } = await sc
      .from("entreprises")
      .select("id, owner_id")
      .eq("id", entrepriseId)
      .maybeSingle();
    if (!ent || ent.owner_id !== user.id) {
      return jsonError("entreprise_non_attribuee", 403, {}, cors);
    }

    pricing = await loadEnrichPricing();

    if (ctx.enrichmentBudgetCents != null && pricing.costPerRunCents > 0) {
      const spent = await spentCentsForAgent(user.id, ctx.budgetPeriod);
      if (spent + pricing.costPerRunCents > ctx.enrichmentBudgetCents) {
        return jsonError(
          "budget_depasse",
          402,
          {
            spent_cents: spent,
            budget_cents: ctx.enrichmentBudgetCents,
            run_cost_cents: pricing.costPerRunCents,
            period: ctx.budgetPeriod,
          },
          cors,
        );
      }
    }
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/enrich-lead-magnet`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
      },
      // `source` alimente le journal des runs (`enrichment_runs`) : une relance
      // manuelle depuis le CRM et un run d'agent freelance ne se comparent pas
      // aux lots déclenchés automatiquement par le trigger.
      body: JSON.stringify({ project_id, source: isAgent ? "agent" : "crm_manual" }),
    });

    const responseText = await response.text();
    let parsedBody: unknown = null;
    if (responseText.length > 0) {
      try {
        parsedBody = JSON.parse(responseText);
      } catch {
        parsedBody = { raw: responseText };
      }
    }

    if (!response.ok) {
      return jsonError(
        "edge_function_request_failed",
        502,
        { upstream_status: response.status, details: parsedBody },
        cors,
      );
    }

    // Run réussi : on comptabilise. Le coût est le forfait configuré, pas le
    // coût réel facturé par le provider — l'edge function lit bien `usage` mais
    // ne le remonte pas encore (les colonnes input_tokens/output_tokens sont
    // prêtes si elle est un jour modifiée pour le faire).
    if (isAgent) {
      const sc = getServiceClient();
      const [{ error: usageErr }, { error: logErr }] = await Promise.all([
        sc.from("agent_usage_events").insert({
          agent_id: user.id,
          entreprise_id: entrepriseId,
          kind: "enrichment",
          provider: pricing.provider,
          model: pricing.model,
          cost_cents: pricing.costPerRunCents,
        }),
        sc.from("agent_activity_events").insert({
          agent_id: user.id,
          entreprise_id: entrepriseId,
          action: "enrich",
          metadata: { project_id, model: pricing.model, cost_cents: pricing.costPerRunCents },
        }),
      ]);
      if (usageErr) console.warn("agent_usage_events insert failed:", usageErr.message);
      if (logErr) console.warn("agent_activity_events insert failed:", logErr.message);
    }

    // Les variables d'un site publié sont figées à la publication : sans
    // republication, le site en ligne garderait les chiffres d'avant
    // l'enrichissement alors que la fiche les affiche. Best-effort.
    await republishSitesForProjects(getServiceClient(), [project_id]);

    return json(parsedBody ?? {}, { headers: cors });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    return jsonError("edge_function_unreachable", 502, { details: message }, cors);
  }
});
