import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { resolveEnterpriseVariables } from "@/lib/site-builder/resolve-variables";

export const dynamic = "force-dynamic";

interface BackfillResult {
  siteId: string;
  name: string | null;
  status: "backfilled" | "skipped" | "error";
  reason?: string;
}

export const POST = withAuth({ role: "admin" }, async ({ req }) => {
  const expected = process.env.ADMIN_BACKFILL_SECRET;
  if (!expected) return jsonError("ADMIN_BACKFILL_SECRET not configured on server", 500);
  const provided = req.headers.get("x-admin-secret");
  if (provided !== expected) return jsonError("unauthorized", 401);

  const supabase = getServiceClient();

  const { data: sites, error } = await supabase
    .from("sites")
    .select("id, name, enterprise_id, lead_magnet_project_id, content_overrides, site_config, published_variables, published_instances, published_reviews, published_site_config")
    .eq("is_published", true);

  if (error) return jsonError(error.message, 500);

  const targets = (sites ?? []).filter((s) => {
    const vars = s.published_variables as Record<string, unknown> | null;
    const insts = s.published_instances as unknown[] | null;
    const cfg = s.published_site_config as Record<string, unknown> | null;
    return !vars || Object.keys(vars).length === 0 || !insts || !cfg;
  });

  const results: BackfillResult[] = [];

  for (const site of targets) {
    try {
      const needsVars = !site.published_variables || Object.keys(site.published_variables as object).length === 0;
      const needsInstances = !site.published_instances;
      const needsConfig = !site.published_site_config;

      const updatePayload: Record<string, unknown> = {};

      if (needsConfig) updatePayload.published_site_config = site.site_config ?? null;

      if (needsVars) {
        const { variables, reviews } = await resolveEnterpriseVariables(supabase, {
          id: site.id,
          enterprise_id: (site as { enterprise_id: number | null }).enterprise_id ?? null,
          lead_magnet_project_id: (site as { lead_magnet_project_id: string | null }).lead_magnet_project_id ?? null,
          content_overrides: (site as { content_overrides: { stats?: Array<{ label: string; value: string; display_order?: number }> } | null }).content_overrides ?? null,
        });
        updatePayload.published_variables = variables;
        updatePayload.published_reviews = reviews;
      }

      if (needsInstances) {
        const { data: instances, error: instErr } = await supabase
          .from("site_section_instances")
          .select("*, section_def:site_sections (*)")
          .eq("site_id", site.id)
          .order("page_slug")
          .order("sort_order");
        if (instErr) throw new Error(instErr.message);
        updatePayload.published_instances = instances ?? [];
      }

      if (Object.keys(updatePayload).length === 0) {
        results.push({ siteId: site.id, name: site.name, status: "skipped", reason: "nothing to backfill" });
        continue;
      }

      const { error: updateErr } = await supabase
        .from("sites")
        .update(updatePayload)
        .eq("id", site.id);
      if (updateErr) throw new Error(updateErr.message);

      results.push({ siteId: site.id, name: site.name, status: "backfilled" });
    } catch (err) {
      results.push({
        siteId: site.id,
        name: site.name,
        status: "error",
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return json({
    ok: true,
    scanned: sites?.length ?? 0,
    candidates: targets.length,
    results,
  });
});
