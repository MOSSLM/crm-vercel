import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { listThemes } from "@/templates/index";
import type { ManagedTheme } from "@/types";

const supabase = createClient(
  (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// GET /api/themes — list all themes (builtin + custom from DB)
export async function GET() {
  const builtinThemes = listThemes();

  const { data: dbThemes, error } = await supabase
    .from("site_themes")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Merge: builtin themes enrich DB records with live config
  const merged: ManagedTheme[] = (dbThemes ?? []).map((row: ManagedTheme) => {
    const builtin = builtinThemes.find((t) => t.slug === row.slug);
    return {
      ...row,
      config: builtin ?? row.config,
    };
  });

  // Add any builtin themes not yet in DB (in case of missing seed)
  for (const bt of builtinThemes) {
    if (!merged.find((m) => m.slug === bt.slug)) {
      merged.unshift({
        id: `builtin-${bt.slug}`,
        slug: bt.slug,
        name: bt.name,
        description: bt.description ?? "",
        preview_image_url: bt.previewImageUrl ?? undefined,
        config: bt,
        is_enabled: true,
        is_builtin: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  }

  return NextResponse.json(merged);
}

// POST /api/themes — create a custom theme
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { slug, name, description, preview_image_url, config } = body as {
      slug: string;
      name: string;
      description?: string;
      preview_image_url?: string;
      config?: object;
    };

    if (!slug || !name) {
      return NextResponse.json({ error: "slug et name requis" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("site_themes")
      .insert({
        slug,
        name,
        description: description ?? null,
        preview_image_url: preview_image_url ?? null,
        config: config ?? {},
        is_builtin: false,
        is_enabled: true,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
