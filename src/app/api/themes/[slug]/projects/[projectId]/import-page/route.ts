import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { slugify } from "@/lib/site-builder/slug";
import { convertHtmlToSections } from "@/lib/ai/import-page-sections";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Params = { slug: string; projectId: string };

function normalizePageSlug(raw: string): string {
  const t = (raw || "").trim();
  if (!t || t === "/") return "/";
  return "/" + slugify(t.replace(/^\/+/, ""));
}

/**
 * POST /api/themes/[slug]/projects/[projectId]/import-page
 * Body: { page_title, page_slug, html, service_tag?, model? }
 *
 * Converts a Claude/Figma-designed HTML page into faithful (raw) library
 * sections and attaches them, in order, to a project page.
 */
export const POST = withAuth<undefined, Params>({}, async ({ req, params }) => {
  const body = await req.json();
  const { page_title, page_slug, html, service_tag, model, css, links } = body as {
    page_title?: string;
    page_slug?: string;
    html?: string;
    service_tag?: string | null;
    model?: string;
    css?: string;
    links?: string[];
  };

  if (!html?.trim()) return jsonError("html requis", 400);
  if (!page_title?.trim()) return jsonError("page_title requis", 400);

  const supabase = getServiceClient();

  // Load the project to get its theme + slug (used for section ids).
  const { data: project, error: projErr } = await supabase
    .from("section_projects")
    .select("id, theme_slug, slug")
    .eq("id", params.projectId)
    .eq("theme_slug", params.slug)
    .single();
  if (projErr || !project) return jsonError("Projet introuvable", 404);

  const pageSlug = normalizePageSlug(page_slug || page_title);
  const pageSan = pageSlug === "/" ? "home" : slugify(pageSlug.replace(/^\/+/, ""));

  // AI conversion (segment + adapt to faithful TSX). Streamed + bounded so a
  // stuck or over-long generation returns a clear error instead of hanging.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 290_000);
  let sections;
  try {
    sections = await convertHtmlToSections(html, { model, signal: controller.signal, css, links });
  } catch (err: unknown) {
    const name = err instanceof Error ? err.name : "";
    if (name === "APIUserAbortError" || name === "AbortError") {
      return jsonError(
        "La conversion IA a expiré (page trop longue). Réessaie avec une page plus courte, découpe-la en plusieurs imports, ou choisis un modèle plus rapide.",
        504,
      );
    }
    return jsonError(err instanceof Error ? err.message : "Erreur IA", 502);
  } finally {
    clearTimeout(timeout);
  }
  if (sections.length === 0) {
    return jsonError(
      "L'IA n'a pas pu segmenter cette page (aucune section détectée). Vérifie que le HTML est complet, ou encadre chaque section avec data-section.",
      422,
    );
  }

  // Re-import: drop the previous version of this page (and its sections) so the
  // page is rebuilt cleanly and section ids stay deterministic.
  const { data: existingPage } = await supabase
    .from("section_project_pages")
    .select("id, sections")
    .eq("project_id", project.id)
    .eq("slug", pageSlug)
    .maybeSingle();
  if (existingPage) {
    const oldIds = Array.isArray(existingPage.sections)
      ? (existingPage.sections as Array<{ section_id?: string }>)
          .map((r) => r.section_id)
          .filter((s): s is string => !!s)
      : [];
    if (oldIds.length > 0) {
      await supabase
        .from("theme_sections")
        .delete()
        .eq("theme_slug", project.theme_slug)
        .eq("project_id", project.id)
        .in("section_id", oldIds);
    }
    await supabase.from("section_project_pages").delete().eq("id", existingPage.id);
  }

  // Insert each converted section into the library (render_mode='raw'), with a
  // deterministic, theme-unique id. Retry once with a suffix on a rare clash.
  const refs: Array<{ section_id: string; service_tag: string | null }> = [];
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    let sectionId = `${project.slug}-${pageSan}-${String(i + 1).padStart(2, "0")}`;
    const row = {
      theme_slug: project.theme_slug,
      section_id: sectionId,
      category: s.category,
      name: s.name,
      code: s.code,
      example_data: {},
      schema: null,
      is_tag_adaptive: false,
      render_mode: "raw",
      project_id: project.id,
    };

    let insertErr = (await supabase.from("theme_sections").insert(row)).error;
    if (insertErr?.code === "23505") {
      sectionId = `${sectionId}-${Math.random().toString(36).slice(2, 7)}`;
      insertErr = (await supabase.from("theme_sections").insert({ ...row, section_id: sectionId })).error;
    }
    if (insertErr) return jsonError(`Section "${s.name}": ${insertErr.message}`, 500);

    refs.push({ section_id: sectionId, service_tag: s.service_tag ?? service_tag ?? null });
  }

  // Append the page at the end of the project's page order.
  const { count } = await supabase
    .from("section_project_pages")
    .select("id", { count: "exact", head: true })
    .eq("project_id", project.id);

  const { data: page, error: pageErr } = await supabase
    .from("section_project_pages")
    .insert({
      project_id: project.id,
      slug: pageSlug,
      title: page_title.trim(),
      sort_order: count ?? 0,
      sections: refs,
    })
    .select()
    .single();

  if (pageErr) return jsonError(pageErr.message, 500);

  return json({ page, sections_created: refs.length }, { status: 201 });
});
