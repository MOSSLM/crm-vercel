import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ siteId: string }>;
}

interface LibraryRef {
  theme_slug: string;
  section_id: string;
}

/** GET /api/site-builder/sites/[siteId]/instances
 *  Returns all section instances for a site.
 *  For library sections (section_def is null), enriches with theme_sections data. */
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

  const instances = (data ?? []) as Array<Record<string, unknown>>;

  // Collect library refs for instances that have no section_def (library sections)
  const libRefs: LibraryRef[] = [];
  for (const inst of instances) {
    const content = inst.content as Record<string, unknown> | null;
    if (!inst.section_def && content?.__library) {
      libRefs.push(content.__library as LibraryRef);
    }
  }

  if (libRefs.length > 0) {
    const themeSlugs = [...new Set(libRefs.map((r) => r.theme_slug))];
    const { data: themeSections } = await supabase
      .from("theme_sections")
      .select("*")
      .in("theme_slug", themeSlugs);

    const tsMap = new Map(
      (themeSections ?? []).map((ts) => [`${ts.theme_slug}:${ts.section_id}`, ts])
    );

    for (const inst of instances) {
      const content = inst.content as Record<string, unknown> | null;
      if (!inst.section_def && content?.__library) {
        const ref = content.__library as LibraryRef;
        const ts = tsMap.get(`${ref.theme_slug}:${ref.section_id}`);
        if (ts) {
          inst.section_def = {
            id: ts.id,
            name: ts.name,
            type: ts.section_id,
            category: ts.category,
            preview_image_url: null,
            structure: { snippets: [], layout: { type: "stack" } },
            default_content: ts.example_data ?? {},
            is_builtin: false,
            tags: [ts.category],
            created_at: ts.created_at,
            updated_at: ts.updated_at,
            code: ts.code,
            theme_slug: ts.theme_slug,
            theme_section_id: ts.section_id,
            schema: ts.schema ?? null,
          };
        }
      }
    }
  }

  return NextResponse.json(instances);
}

/** PUT /api/site-builder/sites/[siteId]/instances
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
    blocks?: Array<{ id: string; type: string; settings: Record<string, unknown> }>;
    custom_style?: Record<string, unknown>;
    is_hidden?: boolean;
  }>;

  if (!Array.isArray(instances)) {
    return NextResponse.json({ error: "instances[] requis" }, { status: 400 });
  }

  const { error: deleteError } = await supabase
    .from("site_section_instances")
    .delete()
    .eq("site_id", siteId);

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  if (instances.length === 0) {
    return NextResponse.json({ count: 0 });
  }

  const toInsert = instances.map((inst) => ({
    id: inst.id,
    site_id: siteId,
    section_id: inst.section_id ?? null,
    page_slug: inst.page_slug,
    sort_order: inst.sort_order,
    content: inst.content ?? {},
    blocks: inst.blocks ?? [],
    custom_style: inst.custom_style ?? {},
    is_hidden: inst.is_hidden ?? false,
  }));

  const { error: insertError } = await supabase
    .from("site_section_instances")
    .insert(toInsert);

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  return NextResponse.json({ count: toInsert.length });
}

/** PATCH /api/site-builder/sites/[siteId]/instances
 *  Update a single instance's content or style */
export async function PATCH(req: Request, { params }: RouteContext) {
  const supabase = getSupabaseServiceClient();
  const { siteId } = await params;
  const { instanceId, content, blocks, custom_style, is_hidden, sort_order } = await req.json();

  if (!instanceId) return NextResponse.json({ error: "instanceId requis" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (content !== undefined) updates.content = content;
  if (blocks !== undefined) updates.blocks = blocks;
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
