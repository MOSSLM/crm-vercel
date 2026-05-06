import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string; sectionId: string }> };

// GET /api/themes/[slug]/sections/[sectionId]
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { slug, sectionId } = await params;
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from("theme_sections")
    .select("*")
    .eq("theme_slug", slug)
    .eq("section_id", sectionId)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

// PATCH /api/themes/[slug]/sections/[sectionId]
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { slug, sectionId } = await params;
  const body = await req.json();
  const supabase = getSupabaseServiceClient();

  const allowed = ["name", "category", "code", "example_data", "sort_order", "section_id"];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("theme_sections")
    .update(updates)
    .eq("theme_slug", slug)
    .eq("section_id", sectionId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE /api/themes/[slug]/sections/[sectionId]
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { slug, sectionId } = await params;
  const supabase = getSupabaseServiceClient();

  const { error } = await supabase
    .from("theme_sections")
    .delete()
    .eq("theme_slug", slug)
    .eq("section_id", sectionId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
