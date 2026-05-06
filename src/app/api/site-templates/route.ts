import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("site_templates")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const body = await req.json();
  const { name, description, preview_image_url, category, site_config } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "Nom requis" }, { status: 400 });
  }
  if (!site_config) {
    return NextResponse.json({ error: "Configuration requise" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("site_templates")
    .insert({
      name: name.trim(),
      description: description?.trim() || null,
      preview_image_url: preview_image_url?.trim() || null,
      category: category?.trim() || "general",
      site_config,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
