import { z } from "zod";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { cloneTemplateSite } from "@/lib/site-builder/clone-template-site";
import { logPipelineStep } from "../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = (req: Request) => preflight(req);

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    template_id: z.string().uuid(),
    entreprise_ids: z.array(z.coerce.number().int().positive()).min(1).max(50),
  }),
  z.object({
    action: z.literal("validate"),
    site_ids: z.array(z.string().uuid()).min(1).max(50),
  }),
]);
type Body = z.infer<typeof bodySchema>;

/**
 * POST /api/agent/marketing-pipeline/site
 *
 * Étape 3 du pipeline, côté agent : création du site démo puis validation.
 *
 * Les routes génériques du site builder (`create-demo`, `PATCH sites/[siteId]`)
 * sont partagées par tout l'éditeur ; plutôt que d'y injecter une logique
 * d'agent, on passe par cette route dédiée qui vérifie que l'entreprise est
 * bien attribuée à l'agent et journalise l'action. La création réutilise
 * `cloneTemplateSite`, exactement comme la route admin.
 */
export const POST = withAuth<Body>(
  { role: "freelance", capability: "marketing_pipeline", body: bodySchema },
  async ({ body, user, cors }) => {
    const sc = getServiceClient();

    if (body.action === "create") {
      const { data: owned } = await sc
        .from("entreprises")
        .select("id, name")
        .in("id", body.entreprise_ids)
        .eq("owner_id", user.id);
      if (!owned || owned.length === 0) {
        return jsonError("entreprise_non_attribuee", 403, {}, cors);
      }

      const entIds = owned.map((e) => Number(e.id));
      const { data: projects } = await sc
        .from("lead_magnet_projects")
        .select("id, entreprise_id")
        .in("entreprise_id", entIds);
      const projectByEnt = new Map(
        (projects ?? []).map((p) => [Number(p.entreprise_id), p.id as string]),
      );

      let created = 0;
      const failures: number[] = [];
      for (const ent of owned) {
        const entId = Number(ent.id);
        const clone = await cloneTemplateSite(sc, body.template_id, {
          enterpriseId: entId,
          name: (ent.name as string | null) || `Site ${entId}`,
          leadMagnetProjectId: projectByEnt.get(entId) ?? null,
          buildStage: "a_faire",
        });
        if (!clone.ok || !clone.siteId) {
          failures.push(entId);
          continue;
        }
        created += 1;
        await logPipelineStep({
          agentId: user.id,
          entrepriseId: entId,
          action: "create_site",
          metadata: { site_id: clone.siteId, template_id: body.template_id },
        });
      }

      return json(
        { ok: true, created, failed: failures.length, skipped: body.entreprise_ids.length - owned.length },
        { headers: cors },
      );
    }

    // action === "validate" : passe les sites en "prêt", après contrôle de propriété.
    const { data: sites, error: sitesErr } = await sc
      .from("sites")
      .select("id, enterprise_id")
      .in("id", body.site_ids);
    if (sitesErr) return jsonError(sitesErr.message, 500, {}, cors);
    if (!sites || sites.length === 0) return jsonError("site_introuvable", 404, {}, cors);

    const entIds = [...new Set(sites.map((s) => Number(s.enterprise_id)).filter(Number.isFinite))];
    const { data: owned } = await sc
      .from("entreprises")
      .select("id")
      .in("id", entIds)
      .eq("owner_id", user.id);
    const ownedIds = new Set((owned ?? []).map((e) => Number(e.id)));

    const allowed = sites.filter((s) => ownedIds.has(Number(s.enterprise_id)));
    if (allowed.length === 0) return jsonError("entreprise_non_attribuee", 403, {}, cors);

    const { error } = await sc
      .from("sites")
      .update({ build_stage: "pret" })
      .in(
        "id",
        allowed.map((s) => s.id as string),
      );
    if (error) return jsonError(error.message, 500, {}, cors);

    await Promise.all(
      allowed.map((s) =>
        logPipelineStep({
          agentId: user.id,
          entrepriseId: Number(s.enterprise_id),
          action: "validate_site",
          metadata: { site_id: s.id },
        }),
      ),
    );

    return json(
      { ok: true, validated: allowed.length, skipped: sites.length - allowed.length },
      { headers: cors },
    );
  },
);
