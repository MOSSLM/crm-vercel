import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { slugify } from "@/lib/site-builder/slug";

export const dynamic = "force-dynamic";

type Params = { slug: string };

// GET /api/themes/[slug]/projects — list projects (with their pages) for a theme.
export const GET = withAuth<undefined, Params>({}, async ({ params }) => {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from("section_projects")
    .select("*, pages:section_project_pages(*)")
    .eq("theme_slug", params.slug)
    .order("created_at", { ascending: false });

  if (error) return jsonError(error.message, 500);

  // Sort each project's pages by sort_order (nested order isn't guaranteed).
  const projects = (data ?? []).map((p) => ({
    ...p,
    pages: Array.isArray(p.pages)
      ? [...p.pages].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      : [],
  }));

  return json(projects);
});

// POST /api/themes/[slug]/projects — create an empty project.
export const POST = withAuth<undefined, Params>({}, async ({ req, params }) => {
  const body = await req.json();
  const { name, slug, description } = body as {
    name?: string;
    slug?: string;
    description?: string;
  };

  if (!name?.trim()) return jsonError("name requis", 400);

  const supabase = getServiceClient();
  const resolvedSlug = slugify(slug?.trim() || name);

  const { data, error } = await supabase
    .from("section_projects")
    .insert({
      theme_slug: params.slug,
      slug: resolvedSlug,
      name: name.trim(),
      description: description?.trim() || null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return jsonError(`Un projet "${resolvedSlug}" existe déjà pour ce thème`, 409);
    }
    return jsonError(error.message, 500);
  }

  return json({ ...data, pages: [] }, { status: 201 });
});
