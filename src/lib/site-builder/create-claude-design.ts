/**
 * Ingestion core for "Claude design" import.
 *
 * Stores a whole-page design as ONE faithful, raw library section and a
 * template site that points at it — mirroring the proven instantiate flow
 * (src/app/api/themes/[slug]/projects/[projectId]/instantiate/route.ts):
 *
 *  - theme_sections row: render_mode='raw', code = wrapped whole-page component.
 *    (theme_slug has no FK and project_id is nullable, so this is standalone.)
 *  - sites row: is_template, DEFAULT_STYLE_GUIDE, one-page sitemap.
 *  - site_section_instances row: content.__library → the section, plus
 *    __unmanaged_style so the managed coherence layer is bypassed.
 *
 * From here the design flows through the EXISTING pipeline unchanged: the
 * editor opens it (instances GET resolves __library), the public site renders
 * it raw (LibrarySectionInline), and deploy-batch clones + publishes it per
 * company with that company's resolved variables.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_STYLE_GUIDE } from "@/types";
import { wrapRawHtml } from "@/lib/site-builder/wrap-raw-html";

/** Shared theme bucket for imported Claude designs (no themes-table FK). */
export const CLAUDE_DESIGN_THEME_SLUG = "claude-designs";

export interface CreateClaudeDesignInput {
  name: string;
  /** Sanitised whole-page HTML fragment (see sanitize-design-html.ts). */
  html: string;
  enterpriseId?: number | null;
}

export interface CreateClaudeDesignResult {
  siteId: string;
  themeSlug: string;
  sectionId: string;
}

export async function createClaudeDesignSite(
  supabase: SupabaseClient,
  input: CreateClaudeDesignInput,
): Promise<CreateClaudeDesignResult> {
  const themeSlug = CLAUDE_DESIGN_THEME_SLUG;
  const sectionId = `d-${randomUUID()}`;

  // 1) Store the design as a raw library section. Keep the un-tokenised source
  //    in example_data so the tokenize pass can re-run against the original.
  const { error: tsErr } = await supabase.from("theme_sections").insert({
    theme_slug: themeSlug,
    section_id: sectionId,
    category: "misc",
    name: input.name,
    code: wrapRawHtml(input.html),
    example_data: { __source_html: input.html },
    schema: null,
    is_tag_adaptive: false,
    render_mode: "raw",
    project_id: null,
  });
  if (tsErr) throw new Error(`theme_sections: ${tsErr.message}`);

  // 2) Create the template site (one-page sitemap).
  const { data: site, error: siteErr } = await supabase
    .from("sites")
    .insert({
      name: input.name,
      enterprise_id: input.enterpriseId ?? null,
      is_template: true,
      style_guide: DEFAULT_STYLE_GUIDE,
      sitemap: [{ id: randomUUID(), slug: "/", title: "Accueil" }],
    })
    .select("id")
    .single();
  if (siteErr || !site) {
    // Roll back the orphaned section so a retry starts clean.
    await supabase.from("theme_sections").delete().eq("theme_slug", themeSlug).eq("section_id", sectionId);
    throw new Error(siteErr?.message ?? "Création du site impossible");
  }
  const siteId = (site as { id: string }).id;

  // 3) Place the design as a single raw library instance on "/".
  const { error: instErr } = await supabase.from("site_section_instances").insert({
    site_id: siteId,
    section_id: null,
    page_slug: "/",
    sort_order: 0,
    content: {
      __library: { theme_slug: themeSlug, section_id: sectionId },
      __unmanaged_style: true,
    },
    blocks: [],
    custom_style: {},
    is_hidden: false,
  });
  if (instErr) {
    await supabase.from("sites").delete().eq("id", siteId);
    await supabase.from("theme_sections").delete().eq("theme_slug", themeSlug).eq("section_id", sectionId);
    throw new Error(instErr.message);
  }

  return { siteId, themeSlug, sectionId };
}
