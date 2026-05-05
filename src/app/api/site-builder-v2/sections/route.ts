import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

/** GET /api/site-builder-v2/sections — list all available sections */
export async function GET(req: Request) {
  const supabase = getSupabaseServiceClient();
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const search = searchParams.get("q");

  let query = supabase
    .from("site_sections")
    .select("*")
    .order("is_builtin", { ascending: false })
    .order("name");

  if (category) query = query.eq("category", category);
  if (search) query = query.ilike("name", `%${search}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

/** POST /api/site-builder-v2/sections — create a custom section */
export async function POST(req: Request) {
  const supabase = getSupabaseServiceClient();
  try {
    const body = await req.json();
    const { name, type, category, structure, default_content, tags } = body;

    if (!name || !type || !structure) {
      return NextResponse.json({ error: "name, type, structure requis" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("site_sections")
      .insert({ name, type, category, structure, default_content: default_content ?? {}, tags: tags ?? [], is_builtin: false })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
