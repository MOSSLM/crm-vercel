import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-service";
import type { SiteConfig } from "@/types";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ siteId: string }>;
}

// GET /api/site-builder/sites/[siteId]
export async function GET(_request: Request, context: RouteContext) {
  const supabase = getSupabaseServiceClient();
  const { siteId } = await context.params;
  const { data, error } = await supabase
    .from("sites")
    .select("*")
    .eq("id", siteId)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "PGRST116" ? 404 : 500 });
  return NextResponse.json(data);
}

// PATCH /api/site-builder/sites/[siteId] — update name, description, site_config
export async function PATCH(request: Request, context: RouteContext) {
  const supabase = getSupabaseServiceClient();
  const { siteId } = await context.params;
  try {
    const body = await request.json();
    const { name, description, site_config, enterprise_id } = body as {
      name?: string;
      description?: string;
      site_config?: SiteConfig;
      enterprise_id?: number | null;
    };

    const patch: Record<string, unknown> = {};
    if (name !== undefined) patch.name = name;
    if (description !== undefined) patch.description = description;
    if (site_config !== undefined) patch.site_config = site_config;
    if (enterprise_id !== undefined) patch.enterprise_id = enterprise_id;

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Aucun champ à mettre à jour" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("sites")
      .update(patch)
      .eq("id", siteId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// DELETE /api/site-builder/sites/[siteId]
export async function DELETE(_request: Request, context: RouteContext) {
  const supabase = getSupabaseServiceClient();
  const { siteId } = await context.params;
  const { error } = await supabase.from("sites").delete().eq("id", siteId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
