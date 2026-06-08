import { randomUUID } from "node:crypto";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { DEFAULT_STYLE_GUIDE } from "@/types";
import type { SectionProjectPage, SectionProjectPageRef } from "@/types";

export const dynamic = "force-dynamic";

type Params = { slug: string; projectId: string };

/**
 * POST /api/themes/[slug]/projects/[projectId]/instantiate
 * Body: { name?, enterprise_id? }
 *
 * Creates a real multi-page site from the project: one sitemap page per project
 * page, and one site_section_instance per section reference (placed as a library
 * section via content.__library and rendered raw via __unmanaged_style). The
 * project's sections remain reusable in the library.
 */
export const POST = withAuth<undefined, Params>({}, async ({ req, params }) => {
  const supabase = getServiceClient();
  const body = await req.json().catch(() => ({}));
  const { name, enterprise_id } = body as { name?: string; enterprise_id?: number };

  // Load project + ordered pages.
  const { data: project, error: projErr } = await supabase
    .from("section_projects")
    .select("*, pages:section_project_pages(*)")
    .eq("id", params.projectId)
    .eq("theme_slug", params.slug)
    .single();
  if (projErr || !project) return jsonError("Projet introuvable", 404);

  const pages = ((Array.isArray(project.pages) ? project.pages : []) as SectionProjectPage[])
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  if (pages.length === 0) return jsonError("Le projet n'a aucune page", 400);

  // Build the sitemap (one entry per project page).
  const sitemap = pages.map((p) => ({
    id: randomUUID(),
    slug: p.slug,
    title: p.title,
    ...(p.seo && typeof p.seo === "object" ? (p.seo as Record<string, unknown>) : {}),
  }));

  // Create the site.
  const { data: site, error: siteErr } = await supabase
    .from("sites")
    .insert({
      name: name?.trim() || project.name,
      description: project.description ?? null,
      enterprise_id: enterprise_id ?? null,
      style_guide: project.style_guide ?? DEFAULT_STYLE_GUIDE,
      sitemap,
    })
    .select()
    .single();
  if (siteErr || !site) return jsonError(siteErr?.message ?? "Création du site impossible", 500);

  // Place every section as a raw library instance on its page.
  const instances: Array<Record<string, unknown>> = [];
  for (const p of pages) {
    const refs = (Array.isArray(p.sections) ? p.sections : []) as SectionProjectPageRef[];
    refs.forEach((ref, i) => {
      const content: Record<string, unknown> = {
        __library: { theme_slug: project.theme_slug, section_id: ref.section_id },
        __unmanaged_style: true,
      };
      if (ref.service_tag) content.__service_tag = ref.service_tag;
      instances.push({
        site_id: site.id,
        section_id: null,
        page_slug: p.slug,
        sort_order: i,
        content,
        blocks: [],
        custom_style: {},
        is_hidden: false,
      });
    });
  }

  if (instances.length > 0) {
    const { error: instErr } = await supabase.from("site_section_instances").insert(instances);
    if (instErr) {
      // Roll back the half-created site so a retry starts clean.
      await supabase.from("sites").delete().eq("id", site.id);
      return jsonError(instErr.message, 500);
    }
  }

  return json({ siteId: site.id, pages: pages.length, sections: instances.length }, { status: 201 });
});
