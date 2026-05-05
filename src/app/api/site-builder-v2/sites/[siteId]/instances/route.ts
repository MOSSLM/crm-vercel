import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ siteId: string }>;
}

/** GET /api/site-builder-v2/sites/[siteId]/instances
 *  Returns all section instances for a site, with joined section_def */
export async function GET(_req: Request, { params }: RouteContext) {
  const supabase = getSupabaseServiceClient();
  const { siteId } = await params;

  const { data, error } = await supabase
    .from("site_section_instances")
    .select(`
      *,
      section_def:site_sections (*)
    `)
    .eq("site_id", siteId)
    .order("page_slug")
    .order("sort_order");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

/** PUT /api/site-builder-v2/sites/[siteId]/instances
 *  Full replace: delete all existing and insert new ones */
export async function PUT(req: Request, { params }: RouteContext) {
  const supabase = getSupabaseServiceClient();
  const { siteId } = await params;
  const body = await req.json();
  const instances = body.instances as Array<{
    id: string;
    section_id?: string | null;
    page_slug: string;
    sort_order: number;
    content: Record<string, unknown>;
    custom_style?: Record<string, unknown>;
    is_hidden?: boolean;
  }>;

  if (!Array.isArray(instances)) {
    return NextResponse.json({ error: "instances[] requis" }, { status: 400 });
  }

  // Delete all existing instances for this site
  const { error: deleteError } = await supabase
    .from("site_section_instances")
    .delete()
    .eq("site_id", siteId);

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  if (instances.length === 0) {
    return NextResponse.json({ count: 0 });
  }

  // Insert all new instances
  const toInsert = instances.map((inst) => ({
    id: inst.id,
    site_id: siteId,
    section_id: inst.section_id ?? null,
    page_slug: inst.page_slug,
    sort_order: inst.sort_order,
    content: inst.content ?? {},
    custom_style: inst.custom_style ?? {},
    is_hidden: inst.is_hidden ?? false,
  }));

  const { error: insertError } = await supabase
    .from("site_section_instances")
    .insert(toInsert);

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  return NextResponse.json({ count: toInsert.length });
}

/** PATCH /api/site-builder-v2/sites/[siteId]/instances
 *  Update a single instance's content or style */
export async function PATCH(req: Request, { params }: RouteContext) {
  const supabase = getSupabaseServiceClient();
  const { siteId } = await params;
  const { instanceId, content, custom_style, is_hidden, sort_order } = await req.json();

  if (!instanceId) return NextResponse.json({ error: "instanceId requis" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (content !== undefined) updates.content = content;
  if (custom_style !== undefined) updates.custom_style = custom_style;
  if (is_hidden !== undefined) updates.is_hidden = is_hidden;
  if (sort_order !== undefined) updates.sort_order = sort_order;

  const { data, error } = await supabase
    .from("site_section_instances")
    .update(updates)
    .eq("id", instanceId)
    .eq("site_id", siteId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
