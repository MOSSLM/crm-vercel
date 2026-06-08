import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { slugify } from "@/lib/site-builder/slug";

export const dynamic = "force-dynamic";

type Params = { slug: string; projectId: string };

// GET /api/themes/[slug]/projects/[projectId] — project with ordered pages.
export const GET = withAuth<undefined, Params>({}, async ({ params }) => {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from("section_projects")
    .select("*, pages:section_project_pages(*)")
    .eq("id", params.projectId)
    .eq("theme_slug", params.slug)
    .single();

  if (error) return jsonError(error.message, 404);

  const pages = Array.isArray(data.pages)
    ? [...data.pages].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    : [];

  return json({ ...data, pages });
});

// PATCH — update name / description / slug / style_guide.
export const PATCH = withAuth<undefined, Params>({}, async ({ req, params }) => {
  const supabase = getServiceClient();
  const body = await req.json();

  const updates: Record<string, unknown> = {};
  if (typeof body.name === "string") updates.name = body.name.trim();
  if ("description" in body) updates.description = body.description?.trim() || null;
  if (typeof body.slug === "string") updates.slug = slugify(body.slug);
  if ("style_guide" in body) updates.style_guide = body.style_guide ?? null;

  if (Object.keys(updates).length === 0) return jsonError("Rien à mettre à jour", 400);

  const { data, error } = await supabase
    .from("section_projects")
    .update(updates)
    .eq("id", params.projectId)
    .eq("theme_slug", params.slug)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return jsonError("Ce slug de projet est déjà pris", 409);
    return jsonError(error.message, 500);
  }
  return json(data);
});

// DELETE — removes the project and its pages (cascade). Sections created by the
// project are KEPT (theme_sections.project_id is set to null) so they remain
// reusable in the library.
export const DELETE = withAuth<undefined, Params>({}, async ({ params }) => {
  const supabase = getServiceClient();

  const { error } = await supabase
    .from("section_projects")
    .delete()
    .eq("id", params.projectId)
    .eq("theme_slug", params.slug);

  if (error) return jsonError(error.message, 500);
  return new Response(null, { status: 204 });
});
