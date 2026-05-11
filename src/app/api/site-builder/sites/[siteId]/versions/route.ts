import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-service";
import type { SiteVersion } from "@/types";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ siteId: string }>;
}

// GET /api/site-builder/sites/[siteId]/versions — liste les versions
export async function GET(_request: Request, context: RouteContext) {
  const supabase = getSupabaseServiceClient();
  const { siteId } = await context.params;

  const { data, error } = await supabase
    .from("site_versions")
    .select("id, site_id, version_number, created_at, created_by, change_description")
    .eq("site_id", siteId)
    .order("version_number", { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/site-builder/sites/[siteId]/versions — crée une nouvelle version
export async function POST(request: Request, context: RouteContext) {
  const supabase = getSupabaseServiceClient();
  const { siteId } = await context.params;
  const body = await request.json() as {
    style_guide?: unknown;
    sitemap?: unknown;
    change_description?: string;
    created_by?: string;
  };

  // Calcule le prochain numéro de version
  const { data: last } = await supabase
    .from("site_versions")
    .select("version_number")
    .eq("site_id", siteId)
    .order("version_number", { ascending: false })
    .limit(1)
    .single();

  const nextVersion = (last?.version_number ?? 0) + 1;

  const { data, error } = await supabase
    .from("site_versions")
    .insert({
      site_id: siteId,
      version_number: nextVersion,
      style_guide: body.style_guide ?? null,
      sitemap: body.sitemap ?? null,
      change_description: body.change_description ?? null,
      created_by: body.created_by ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
