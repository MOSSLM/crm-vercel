import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { resolveLeadMagnetProjectId } from "@/lib/site-builder/resolve-project-id";

export const dynamic = "force-dynamic";

/**
 * POST /api/site-builder/admin/backfill-project-links
 * Header: x-admin-secret. Body optionnel : { dryRun?: boolean }.
 *
 * Renseigne `sites.lead_magnet_project_id` là où il manque.
 *
 * Une entreprise a UN projet lead magnet par opportunité. Tant que le site
 * n'enregistre pas auquel il appartient, chaque lecture doit deviner — et
 * l'aperçu, la publication et la fiche pouvaient tomber sur trois lignes
 * différentes, d'où des chiffres clés bien saisis mais absents du site. Les
 * créations passent désormais toutes par le résolveur partagé ; ce backfill
 * rattrape les sites créés avant (`sites/route.ts` et `create-claude-design.ts`
 * n'écrivaient pas ce lien).
 *
 * Les sites dont l'entreprise a PLUSIEURS projets sont renseignés avec le mieux
 * classé mais signalés comme `ambiguous` : le choix mérite un œil humain, et
 * mieux vaut le dire que le taire.
 */
interface LinkResult {
  siteId: string;
  name: string | null;
  enterpriseId: number | null;
  status: "linked" | "ambiguous" | "skipped" | "error";
  projectId?: string | null;
  candidates?: number;
  reason?: string;
}

export const POST = withAuth({ role: "admin" }, async ({ req }) => {
  const expected = process.env.ADMIN_BACKFILL_SECRET;
  if (!expected) return jsonError("ADMIN_BACKFILL_SECRET not configured on server", 500);
  if (req.headers.get("x-admin-secret") !== expected) return jsonError("unauthorized", 401);

  const body = (await req.json().catch(() => ({}))) as { dryRun?: boolean };
  const dryRun = body.dryRun === true;

  const supabase = getServiceClient();

  const { data: sites, error } = await supabase
    .from("sites")
    .select("id, name, enterprise_id, lead_magnet_project_id")
    .not("enterprise_id", "is", null)
    .is("lead_magnet_project_id", null);
  if (error) return jsonError(error.message, 500);

  const results: LinkResult[] = [];

  for (const site of (sites ?? []) as Array<{ id: string; name: string | null; enterprise_id: number | null }>) {
    try {
      // `siteId` volontairement omis : le lien est justement celui qui manque,
      // le résolveur doit donc classer les projets de l'entreprise.
      const resolution = await resolveLeadMagnetProjectId(supabase, { enterpriseId: site.enterprise_id });
      if (!resolution.projectId) {
        results.push({
          siteId: site.id,
          name: site.name,
          enterpriseId: site.enterprise_id,
          status: "skipped",
          reason: "aucun projet lead magnet pour cette entreprise",
        });
        continue;
      }

      if (!dryRun) {
        const { error: upErr } = await supabase
          .from("sites")
          .update({ lead_magnet_project_id: resolution.projectId })
          .eq("id", site.id);
        if (upErr) throw new Error(upErr.message);
      }

      results.push({
        siteId: site.id,
        name: site.name,
        enterpriseId: site.enterprise_id,
        status: resolution.candidates > 1 ? "ambiguous" : "linked",
        projectId: resolution.projectId,
        candidates: resolution.candidates,
      });
    } catch (err) {
      results.push({
        siteId: site.id,
        name: site.name,
        enterpriseId: site.enterprise_id,
        status: "error",
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return json({
    ok: true,
    dryRun,
    candidates: sites?.length ?? 0,
    linked: results.filter((r) => r.status === "linked").length,
    ambiguous: results.filter((r) => r.status === "ambiguous").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    errors: results.filter((r) => r.status === "error").length,
    results,
  });
});
