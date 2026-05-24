import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";

export const dynamic = "force-dynamic";

type Params = { siteId: string };

interface LibraryRef {
  theme_slug: string;
  section_id: string;
}

export const GET = withAuth<undefined, Params>({}, async ({ params }) => {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from("site_section_instances")
    .select(`*, section_def:site_sections (*)`)
    .eq("site_id", params.siteId)
    .order("page_slug")
    .order("sort_order");

  if (error) return jsonError(error.message, 500);

  const instances = (data ?? []) as Array<Record<string, unknown>>;

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
      (themeSections ?? []).map((ts) => [`${ts.theme_slug}:${ts.section_id}`, ts]),
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
            is_tag_adaptive: ts.is_tag_adaptive ?? false,
            schema: ts.schema ?? null,
          };
        }
      }
    }
  }

  return json(instances);
});

export const PUT = withAuth<undefined, Params>({}, async ({ req, params }) => {
  const supabase = getServiceClient();
  const body = await req.json();
  const instances = body.instances as Array<{
    id: string;
    section_id?: string | null;
    page_slug: string;
    sort_order: number;
    content: Record<string, unknown>;
    blocks?: Array<{ id: string; type: string; settings: Record<string, unknown>; service_tag?: string | null }>;
    custom_style?: Record<string, unknown>;
    is_hidden?: boolean;
  }>;

  if (!Array.isArray(instances)) return jsonError("instances[] requis", 400);

  const { error: deleteError } = await supabase
    .from("site_section_instances")
    .delete()
    .eq("site_id", params.siteId);

  if (deleteError) return jsonError(deleteError.message, 500);

  if (instances.length === 0) return json({ count: 0 });

  const toInsert = instances.map((inst) => ({
    id: inst.id,
    site_id: params.siteId,
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

  if (insertError) return jsonError(insertError.message, 500);

  return json({ count: toInsert.length });
});

export const PATCH = withAuth<undefined, Params>({}, async ({ req, params }) => {
  const supabase = getServiceClient();
  const { instanceId, content, blocks, custom_style, is_hidden, sort_order } = await req.json();

  if (!instanceId) return jsonError("instanceId requis", 400);

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
    .eq("site_id", params.siteId)
    .select()
    .single();

  if (error) return jsonError(error.message, 500);
  return json(data);
});
