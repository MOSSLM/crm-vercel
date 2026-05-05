import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { SiteConfig } from "@/types";

const supabase = createClient(
  (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

interface RouteContext {
  params: Promise<{ siteId: string }>;
}

// GET /api/site-builder-v2/sites/[siteId]
export async function GET(_request: Request, context: RouteContext) {
  const { siteId } = await context.params;
  const { data, error } = await supabase
    .from("sites")
    .select("*")
    .eq("id", siteId)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "PGRST116" ? 404 : 500 });
  return NextResponse.json(data);
}

// PATCH /api/site-builder-v2/sites/[siteId] — update name, description, site_config
export async function PATCH(request: Request, context: RouteContext) {
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

// DELETE /api/site-builder-v2/sites/[siteId]
export async function DELETE(_request: Request, context: RouteContext) {
  const { siteId } = await context.params;
  const { error } = await supabase.from("sites").delete().eq("id", siteId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
