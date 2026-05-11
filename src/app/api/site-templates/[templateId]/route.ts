import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

interface Params {
  params: Promise<{ templateId: string }>;
}

export async function GET(_req: Request, { params }: Params) {
  const { templateId } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("site_templates")
    .select("*")
    .eq("id", templateId)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(req: Request, { params }: Params) {
  const { templateId } = await params;
  const supabase = await createClient();
  const body = await req.json();
  const { name, description, preview_image_url, category, site_config } = body;

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name.trim();
  if (description !== undefined) updates.description = description?.trim() || null;
  if (preview_image_url !== undefined) updates.preview_image_url = preview_image_url?.trim() || null;
  if (category !== undefined) updates.category = category?.trim() || "general";
  if (site_config !== undefined) updates.site_config = site_config;

  const { data, error } = await supabase
    .from("site_templates")
    .update(updates)
    .eq("id", templateId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: Request, { params }: Params) {
  const { templateId } = await params;
  const supabase = await createClient();
  const { error } = await supabase
    .from("site_templates")
    .delete()
    .eq("id", templateId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
