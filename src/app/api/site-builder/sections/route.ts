import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";

export const dynamic = "force-dynamic";

export const GET = withAuth({}, async ({ req }) => {
  const supabase = getServiceClient();
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
  if (error) return jsonError(error.message, 500);

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
    code: row.code,
    theme_slug: row.theme_slug,
    theme_section_id: row.section_id,
    is_tag_adaptive: row.is_tag_adaptive ?? false,
    schema: row.schema ?? undefined,
  }));

  return json(sections);
});
