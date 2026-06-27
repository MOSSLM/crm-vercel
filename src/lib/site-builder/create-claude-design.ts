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

/** One page of a multi-page Claude Design template, already processed. */
export interface ClaudeDesignPageInput {
  /** Public route slug: "/" for index, "/service-climatisation", … */
  slug: string;
  title: string;
  /** Service tag gating this page (service-<tag>.html), or null. */
  serviceTag: string | null;
  /** Body markup with assets rewritten, cross-links cleaned and brackets tokenised. */
  html: string;
  /** Rewritten-but-still-bracketed source, kept so the mapping pass can re-run. */
  sourceHtml: string;
}

export interface CreateClaudeDesignMultiPageInput {
  /** Caller-provided id so images can be uploaded under it before rows exist. */
  siteId: string;
  name: string;
  pages: ClaudeDesignPageInput[];
  /** Concatenated theme-tokens.css + styles.css, image paths rewritten. */
  sharedCss: string;
  /** Remote font/CDN stylesheet hrefs to inject on every page. */
  fontLinks: string[];
  /** Resolved theme (cvc-theme shape) seeded from the EDITMODE defaults. */
  tweaks: Record<string, unknown>;
  /** Controls schema extracted from the template's *-tweaks.jsx (palettes…). */
  tweaksSchema?: Record<string, unknown>;
  enterpriseId?: number | null;
}

/**
 * Stores a MULTI-PAGE Claude Design template: one faithful raw `theme_sections`
 * row per page + one `sites` row (is_template, is_claude_design) carrying the
 * sitemap, shared CSS/fonts and theme + one raw `site_section_instances` per
 * page_slug. Mirrors `createClaudeDesignSite` but for N pages; the design then
 * flows through the EXISTING pipeline (editor, public render, deploy-batch)
 * unchanged.
 *
 * The site id is provided by the caller (the import route) so the template's
 * images can be uploaded under `${siteId}/…` and their paths rewritten in the
 * page HTML BEFORE these rows are written.
 */
export async function createClaudeDesignMultiPage(
  supabase: SupabaseClient,
  input: CreateClaudeDesignMultiPageInput,
): Promise<{ siteId: string; themeSlug: string; pageCount: number }> {
  const themeSlug = CLAUDE_DESIGN_THEME_SLUG;
  const { siteId, pages } = input;

  // 1) One raw library section per page.
  const sectionIdBySlug = new Map<string, string>();
  const sectionRows = pages.map((page) => {
    const sectionId = `d-${randomUUID()}`;
    sectionIdBySlug.set(page.slug, sectionId);
    return {
      theme_slug: themeSlug,
      section_id: sectionId,
      category: "misc",
      name: `${input.name} — ${page.title}`,
      code: wrapRawHtml(page.html),
      // __source_html: rewritten-but-still-bracketed source (mapping re-runs).
      // __token_html: tokenised body the builder loads for preview + inline edit.
      example_data: { __source_html: page.sourceHtml, __token_html: page.html },
      schema: null,
      is_tag_adaptive: false,
      render_mode: "raw",
      project_id: null,
    };
  });
  const { error: tsErr } = await supabase.from("theme_sections").insert(sectionRows);
  if (tsErr) throw new Error(`theme_sections: ${tsErr.message}`);

  const cleanup = async () => {
    for (const row of sectionRows) {
      await supabase.from("theme_sections").delete().eq("theme_slug", themeSlug).eq("section_id", row.section_id);
    }
  };

  // 2) The template site (multi-page sitemap + shared assets + theme).
  const sitemap = pages.map((page) => ({
    id: randomUUID(),
    slug: page.slug,
    title: page.title,
    service_tag: page.serviceTag ?? null,
  }));

  const { error: siteErr } = await supabase.from("sites").insert({
    id: siteId,
    name: input.name,
    enterprise_id: input.enterpriseId ?? null,
    is_template: true,
    is_claude_design: true,
    style_guide: DEFAULT_STYLE_GUIDE,
    sitemap,
    // tweaksSchema rides inside shared_assets (existing JSONB) so no extra column
    // / migration is required.
    shared_assets: { css: input.sharedCss, fonts: input.fontLinks, tweaksSchema: input.tweaksSchema ?? {} },
    tweaks: input.tweaks ?? {},
  });
  if (siteErr) {
    await cleanup();
    throw new Error(siteErr.message);
  }

  // 3) One raw library instance per page.
  const instances = pages.map((page) => ({
    site_id: siteId,
    section_id: null,
    page_slug: page.slug,
    sort_order: 0,
    content: {
      __library: { theme_slug: themeSlug, section_id: sectionIdBySlug.get(page.slug) },
      __unmanaged_style: true,
    },
    blocks: [],
    custom_style: {},
    is_hidden: false,
  }));
  const { error: instErr } = await supabase.from("site_section_instances").insert(instances);
  if (instErr) {
    await supabase.from("sites").delete().eq("id", siteId);
    await cleanup();
    throw new Error(instErr.message);
  }

  return { siteId, themeSlug, pageCount: pages.length };
}
