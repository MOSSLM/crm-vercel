import { z } from "zod";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { logPipelineStep } from "../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = (req: Request) => preflight(req);

const bodySchema = z.object({
  project_ids: z.array(z.string().uuid()).min(1).max(100),
});
type Body = z.infer<typeof bodySchema>;

/**
 * POST /api/agent/marketing-pipeline/validate-enrichment
 *
 * Étape 2 du pipeline, côté agent. Côté admin cette validation est une écriture
 * Supabase directe depuis le navigateur (`validateEnrichment` dans
 * MarketingWebPipeline) ; la RLS la refuserait pour un agent, d'où cette route.
 *
 * La propriété est revérifiée ici et non côté client : on résout l'entreprise
 * de chaque projet et on n'accepte que celles attribuées à l'agent.
 */
export const POST = withAuth<Body>(
  { role: "freelance", capability: "marketing_pipeline", body: bodySchema },
  async ({ body, user, cors }) => {
    const sc = getServiceClient();

    const { data: projects, error: projErr } = await sc
      .from("lead_magnet_projects")
      .select("id, entreprise_id")
      .in("id", body.project_ids);
    if (projErr) return jsonError(projErr.message, 500, {}, cors);
    if (!projects || projects.length === 0) {
      return jsonError("projet_introuvable", 404, {}, cors);
    }

    const entIds = [...new Set(projects.map((p) => Number(p.entreprise_id)).filter(Number.isFinite))];
    const { data: owned } = await sc
      .from("entreprises")
      .select("id")
      .in("id", entIds)
      .eq("owner_id", user.id);
    const ownedIds = new Set((owned ?? []).map((e) => Number(e.id)));

    const allowed = projects.filter((p) => ownedIds.has(Number(p.entreprise_id)));
    if (allowed.length === 0) return jsonError("entreprise_non_attribuee", 403, {}, cors);

    const allowedIds = allowed.map((p) => p.id as string);

    // `enrichment_validated` vient d'une migration postérieure : on retombe sur
    // `pret_pour_lm` quand elle n'est pas appliquée, comme le fait le board.
    let { error } = await sc
      .from("lead_magnet_projects")
      .update({ enrichment_validated: true })
      .in("id", allowedIds);

    if (error) {
      ({ error } = await sc
        .from("lead_magnet_projects")
        .update({ pret_pour_lm: true })
        .in("id", allowedIds));
    }
    if (error) return jsonError(error.message, 500, {}, cors);

    await Promise.all(
      allowed.map((p) =>
        logPipelineStep({
          agentId: user.id,
          entrepriseId: Number(p.entreprise_id),
          action: "validate_enrich",
          metadata: { project_id: p.id },
        }),
      ),
    );

    return json(
      { ok: true, validated: allowedIds.length, skipped: projects.length - allowed.length },
      { headers: cors },
    );
  },
);
