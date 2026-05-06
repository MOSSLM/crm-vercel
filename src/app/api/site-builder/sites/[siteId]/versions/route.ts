import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { SiteVersion } from "@/types";

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key);
}

// GET /api/site-builder/sites/[siteId]/versions
export async function GET(_req: NextRequest, { params }: { params: { siteId: string } }) {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("site_versions")
      .select("*")
      .eq("site_id", params.siteId)
      .order("version_number", { ascending: false });

    if (error) throw error;
    return NextResponse.json(data as SiteVersion[]);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST /api/site-builder/sites/[siteId]/versions
// Two uses:
//   1. { snapshot } — save a new version
//   2. { version_id } — restore a version (creates a new version from it)
export async function POST(req: NextRequest, { params }: { params: { siteId: string } }) {
  try {
    const supabase = getSupabase();
    const body = await req.json();

    const getNextVersion = async (): Promise<number> => {
      const { data } = await supabase
        .from("site_versions")
        .select("version_number")
        .eq("site_id", params.siteId)
        .order("version_number", { ascending: false })
        .limit(1)
        .single();
      return (data?.version_number ?? 0) + 1;
    };

    // ── Restore from existing version ───────────────────────────────────────
    if (body.version_id) {
      const { data: versionRow, error: fetchErr } = await supabase
        .from("site_versions")
        .select("site_config")
        .eq("id", body.version_id)
        .eq("site_id", params.siteId)
        .single();

      if (fetchErr || !versionRow) {
        return NextResponse.json({ error: "Version introuvable" }, { status: 404 });
      }

      const snapshot = versionRow.site_config as Record<string, unknown>;

      // Apply style_guide + sitemap to site row
      await supabase
        .from("sites")
        .update({
          style_guide: snapshot.style_guide ?? null,
          sitemap: snapshot.sitemap ?? null,
        })
        .eq("id", params.siteId);

      // Replace section instances if present
      if (Array.isArray(snapshot.instances)) {
        await supabase.from("site_section_instances").delete().eq("site_id", params.siteId);
        if ((snapshot.instances as unknown[]).length > 0) {
          const rows = (snapshot.instances as Record<string, unknown>[]).map((inst) => ({
            ...inst,
            site_id: params.siteId,
          }));
          await supabase.from("site_section_instances").insert(rows);
        }
      }

      // Save as a new "Restauration" version
      const nextVersion = await getNextVersion();
      await supabase.from("site_versions").insert({
        site_id: params.siteId,
        version_number: nextVersion,
        site_config: snapshot,
        change_description: "Restauration",
      });

      return NextResponse.json({ ok: true });
    }

    // ── Save a new snapshot ─────────────────────────────────────────────────
    if (body.snapshot) {
      const nextVersion = await getNextVersion();
      const { error } = await supabase.from("site_versions").insert({
        site_id: params.siteId,
        version_number: nextVersion,
        site_config: body.snapshot,
        change_description: body.description ?? null,
      });
      if (error) throw error;
      return NextResponse.json({ version_number: nextVersion });
    }

    return NextResponse.json({ error: "version_id or snapshot required" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
