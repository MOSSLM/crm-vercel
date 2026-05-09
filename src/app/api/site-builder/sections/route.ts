import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/site-builder/sections
 * Returns sections from the theme_sections library (user-created sections).
 * Each row is mapped to a SiteSectionDef-compatible object with a `code` field.
 */
export async function GET(req: Request) {
  const supabase = getSupabaseServiceClient();
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const search = searchParams.get("q");
  const themeSlug = searchParams.get("theme_slug");

  let query = supabase
    .from("theme_sections")
    .select("*")
    .order("category", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (themeSlug) query = query.eq("theme_slug", themeSlug);
  if (category) query = query.eq("category", category);
  if (search) query = query.ilike("name", `%${search}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Map theme_sections rows to SiteSectionDef-compatible format
  const sections = (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    type: row.section_id,
    category: row.category,
    preview_image_url: null,
    structure: { snippets: [], layout: { type: "stack" } },
    default_content: row.example_data ?? {},
    is_builtin: false,
    tags: [row.category],
    created_at: row.created_at,
    updated_at: row.updated_at,
    // Library-specific fields
    code: row.code,
    theme_slug: row.theme_slug,
    theme_section_id: row.section_id,
    schema: row.schema ?? undefined,
  }));

  return NextResponse.json(sections);
}
