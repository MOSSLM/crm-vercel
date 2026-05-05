import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

// PATCH /api/themes/[slug] — enable/disable or update a theme
export async function PATCH(request: Request, context: RouteContext) {
  const supabase = getSupabaseServiceClient();
  const { slug } = await context.params;
  try {
    const body = await request.json();
    const { is_enabled, name, description, preview_image_url, config } = body as {
      is_enabled?: boolean;
      name?: string;
      description?: string;
      preview_image_url?: string;
      config?: object;
    };

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (is_enabled !== undefined) patch.is_enabled = is_enabled;
    if (name !== undefined) patch.name = name;
    if (description !== undefined) patch.description = description;
    if (preview_image_url !== undefined) patch.preview_image_url = preview_image_url;
    if (config !== undefined) patch.config = config;

    const { data, error } = await supabase
      .from("site_themes")
      .update(patch)
      .eq("slug", slug)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// DELETE /api/themes/[slug] — delete a custom theme (not builtin)
export async function DELETE(_request: Request, context: RouteContext) {
  const supabase = getSupabaseServiceClient();
  const { slug } = await context.params;

  const { data: existing } = await supabase
    .from("site_themes")
    .select("is_builtin")
    .eq("slug", slug)
    .single();

  if (existing?.is_builtin) {
    return NextResponse.json({ error: "Les thèmes intégrés ne peuvent pas être supprimés" }, { status: 403 });
  }

  const { error } = await supabase.from("site_themes").delete().eq("slug", slug);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
