import { randomUUID } from "node:crypto";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { wrapRawHtml } from "@/lib/site-builder/wrap-raw-html";
import { addImageLoadingHints } from "@/lib/site-builder/claude-design/add-image-loading-hints";
import { CLAUDE_DESIGN_THEME_SLUG } from "@/lib/site-builder/create-claude-design";
import type { SitemapPage } from "@/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { siteId: string };
interface LibraryRef { theme_slug: string; section_id: string }

interface IncomingPage {
  slug: string;
  title: string;
  serviceTag: string | null;
  html: string;
  sourceHtml: string;
  js?: string;
}

/** Union two string lists, preserving first-seen order. */
function unionArr(existing: unknown, incoming: string[]): string[] {
  const base = Array.isArray(existing) ? (existing as string[]) : [];
  return [...new Set([...base, ...incoming])];
}

/**
 * POST /api/site-builder/designs/[siteId]/import-pages   (JSON)
 *
 * Partial import: replaces ONLY the given pages of an EXISTING multi-page
 * Claude Design template, leaving every other page (and the photos already
 * assigned to them) untouched. The browser does the heavy lifting — unzip,
 * parse, upload the selected pages' images, rewrite paths/links and tokenise
 * brackets (see UpdateTemplatePagesDialog / build-import-pages) — and posts the
 * small processed result here.
 *
 * For a slug that already exists on the site the page's `theme_sections` markup
 * + JS are overwritten (and that page's now-stale inline `__overrides` cleared);
 * a slug not yet present is added (section + instance + sitemap entry). Shared
 * CSS/JS are only touched when `updateShared` is set.
 *
 * Body: {
 *   pages: [{ slug, title, serviceTag, html, sourceHtml, js }],
 *   updateShared?: boolean, sharedCss?, sharedJs?, scriptLinks?, fontLinks?
 * }
 */
export const POST = withAuth<undefined, Params>({}, async ({ req, params }) => {
  const siteId = params.siteId?.trim();
  if (!siteId) return jsonError("siteId requis.", 400);

  let body: {
    pages?: IncomingPage[];
    updateShared?: boolean;
    sharedCss?: string;
    sharedJs?: string;
    scriptLinks?: string[];
    fontLinks?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return jsonError("JSON invalide.", 400);
  }

  const pages = Array.isArray(body.pages) ? body.pages : [];
  if (pages.length === 0) return jsonError("Aucune page à importer.", 400);
  for (const p of pages) {
    if (!p || typeof p.slug !== "string" || typeof p.html !== "string" || typeof p.sourceHtml !== "string") {
      return jsonError("Page invalide (slug/html/sourceHtml manquant).", 422);
    }
  }

  const supabase = getServiceClient();

  // Load the target template site + its page instances in one round-trip.
  const [{ data: site, error: sErr }, { data: instances, error: iErr }] = await Promise.all([
    supabase.from("sites").select("sitemap, shared_assets, is_claude_design").eq("id", siteId).single(),
    supabase.from("site_section_instances").select("id, page_slug, content").eq("site_id", siteId),
  ]);
  if (sErr || !site) return jsonError(sErr?.message ?? "Template introuvable.", sErr ? 500 : 404);
  if (iErr) return jsonError(iErr.message, 500);
  if (!(site as { is_claude_design?: boolean | null }).is_claude_design) {
    return jsonError("Ce site n'est pas un design Claude multi-pages.", 400);
  }

  // Map existing Claude-design pages: slug → { instance, its library section }.
  const insts = (instances ?? []) as Array<{ id: string; page_slug: string; content: Record<string, unknown> | null }>;
  const bySlug = new Map<string, { instanceId: string; sectionId: string; content: Record<string, unknown> }>();
  for (const inst of insts) {
    const ref = inst.content?.__library as LibraryRef | undefined;
    if (ref?.theme_slug === CLAUDE_DESIGN_THEME_SLUG) {
      bySlug.set(inst.page_slug, { instanceId: inst.id, sectionId: ref.section_id, content: inst.content ?? {} });
    }
  }

  const sitemap = ((site as { sitemap?: SitemapPage[] | null }).sitemap ?? []) as SitemapPage[];
  let sitemapChanged = false;
  let updated = 0;
  let created = 0;

  for (const page of pages) {
    // Mirror createClaudeDesignMultiPage exactly so a re-imported page is stored
    // identically to a freshly-imported one (loading hints in code + token html).
    const withHints = addImageLoadingHints(page.html);
    const code = wrapRawHtml(withHints);
    const exampleData = { __source_html: page.sourceHtml, __token_html: withHints, __page_js: page.js ?? "" };
    const existing = bySlug.get(page.slug);

    if (existing) {
      // Overwrite this page's markup/JS only. Its sitemap entry, the other pages
      // and the shared assets stay as-is. Inline overrides targeted the OLD
      // markup, so clear them for this page to avoid mis-applied edits.
      const { error: tsErr } = await supabase
        .from("theme_sections")
        .update({ code, example_data: exampleData })
        .eq("theme_slug", CLAUDE_DESIGN_THEME_SLUG)
        .eq("section_id", existing.sectionId);
      if (tsErr) return jsonError(`theme_sections: ${tsErr.message}`, 500);

      const { error: instErr } = await supabase
        .from("site_section_instances")
        .update({ content: { ...existing.content, __overrides: {} } })
        .eq("id", existing.instanceId);
      if (instErr) return jsonError(instErr.message, 500);
      updated++;
    } else {
      // New page for this template: section + instance + sitemap entry.
      const sectionId = `d-${randomUUID()}`;
      const { error: tsErr } = await supabase.from("theme_sections").insert({
        theme_slug: CLAUDE_DESIGN_THEME_SLUG,
        section_id: sectionId,
        category: "misc",
        name: page.title,
        code,
        example_data: exampleData,
        schema: null,
        is_tag_adaptive: false,
        render_mode: "raw",
        project_id: null,
      });
      if (tsErr) return jsonError(`theme_sections: ${tsErr.message}`, 500);

      const { error: instErr } = await supabase.from("site_section_instances").insert({
        site_id: siteId,
        section_id: null,
        page_slug: page.slug,
        sort_order: 0,
        content: {
          __library: { theme_slug: CLAUDE_DESIGN_THEME_SLUG, section_id: sectionId },
          __unmanaged_style: true,
        },
        blocks: [],
        custom_style: {},
        is_hidden: false,
      });
      if (instErr) {
        // Roll back the orphaned section so a retry starts clean.
        await supabase.from("theme_sections").delete().eq("theme_slug", CLAUDE_DESIGN_THEME_SLUG).eq("section_id", sectionId);
        return jsonError(instErr.message, 500);
      }

      sitemap.push({ id: randomUUID(), slug: page.slug, title: page.title, service_tag: page.serviceTag ?? null });
      sitemapChanged = true;
      created++;
    }
  }

  if (sitemapChanged) {
    const { error: upErr } = await supabase.from("sites").update({ sitemap }).eq("id", siteId);
    if (upErr) return jsonError(upErr.message, 500);
  }

  // Optional: refresh the shared CSS/JS too (opt-in — it affects every page).
  if (body.updateShared) {
    const shared = ((site as { shared_assets?: Record<string, unknown> | null }).shared_assets ?? {}) as Record<string, unknown>;
    const merged: Record<string, unknown> = { ...shared };
    if (typeof body.sharedCss === "string") merged.css = body.sharedCss;
    if (typeof body.sharedJs === "string") merged.js = body.sharedJs;
    if (Array.isArray(body.scriptLinks)) merged.scriptLinks = unionArr(shared.scriptLinks, body.scriptLinks);
    if (Array.isArray(body.fontLinks)) merged.fonts = unionArr(shared.fonts, body.fontLinks);
    const { error: upErr } = await supabase.from("sites").update({ shared_assets: merged }).eq("id", siteId);
    if (upErr) return jsonError(upErr.message, 500);
  }

  return json({ ok: true, updated, created });
});
