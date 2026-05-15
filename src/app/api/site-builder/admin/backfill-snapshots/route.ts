import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-service";
import { resolveEnterpriseVariables } from "@/lib/site-builder/resolve-variables";

export const dynamic = "force-dynamic";

interface BackfillResult {
  siteId: string;
  name: string | null;
  status: "backfilled" | "skipped" | "error";
  reason?: string;
}

// POST /api/site-builder/admin/backfill-snapshots
//
// One-shot maintenance endpoint. Re-resolves enterprise variables and
// snapshots the live site_section_instances for every site that is
// is_published=true but has null published_variables or null
// published_instances. Protected by ADMIN_BACKFILL_SECRET (header
// x-admin-secret).
export async function POST(request: Request) {
  const expected = process.env.ADMIN_BACKFILL_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "ADMIN_BACKFILL_SECRET not configured on server" },
      { status: 500 }
    );
  }
  const provided = request.headers.get("x-admin-secret");
  if (provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseServiceClient();

  const { data: sites, error } = await supabase
    .from("sites")
    .select("id, name, enterprise_id, lead_magnet_project_id, published_variables, published_instances, published_reviews")
    .eq("is_published", true);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const targets = (sites ?? []).filter((s) => {
    const vars = s.published_variables as Record<string, unknown> | null;
    const insts = s.published_instances as unknown[] | null;
    return !vars || Object.keys(vars).length === 0 || !insts;
  });

  const results: BackfillResult[] = [];

  for (const site of targets) {
    try {
      const needsVars = !site.published_variables || Object.keys(site.published_variables as object).length === 0;
      const needsInstances = !site.published_instances;

      const updatePayload: Record<string, unknown> = {};

      if (needsVars) {
        const { variables, reviews } = await resolveEnterpriseVariables(supabase, {
          enterprise_id: (site as { enterprise_id: number | null }).enterprise_id ?? null,
          lead_magnet_project_id: (site as { lead_magnet_project_id: string | null }).lead_magnet_project_id ?? null,
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

  return NextResponse.json({
    ok: true,
    scanned: sites?.length ?? 0,
    candidates: targets.length,
    results,
  });
}
