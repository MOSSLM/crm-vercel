import { randomUUID } from "node:crypto";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { wrapRawHtml } from "@/lib/site-builder/wrap-raw-html";
import { addImageLoadingHints } from "@/lib/site-builder/claude-design/add-image-loading-hints";
import { remapOverrides } from "@/lib/site-builder/claude-design/remap-overrides";
import { pushBackup, nextExampleData } from "@/lib/site-builder/claude-design/override-backups";
import { assetPathMap } from "@/lib/site-builder/claude-design/asset-path-map";
import { CLAUDE_DESIGN_THEME_SLUG } from "@/lib/site-builder/create-claude-design";
import type { SitemapPage } from "@/types";
import { invalidateSiteCache } from "@/lib/site-builder/site-cache";

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

/** Per-page outcome for the operator: what survives the overwrite, what doesn't. */
interface PageReport {
  slug: string;
  kept: number;
  /** Placed by a weaker matcher — worth eyeballing in the editor. */
  uncertain: number;
  dropped: string[];
  /** True when the previous markup was unknown, so paths were kept as-is. */
  unverified: boolean;
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
 * The photos an operator placed live in `content.__overrides`, keyed by DOM
 * path, so new markup means re-keying them (`remapOverrides`). Three rules make
 * that safe, because nothing else in the stack archives those overrides:
 *
 *  1. the previous overrides are BACKED UP on the instance before every write,
 *     and the replaced markup is kept on the section — together they make a
 *     later, accurate restore possible (see override-backups.ts);
 *  2. when the previous markup is unknown, the overrides are KEPT AS-IS and
 *     flagged `unverified` — never wiped. Deleting used to be the fallback,
 *     which is how a whole template lost its photos;
 *  3. `dryRun` computes the same report without writing, so the UI can show
 *     what an import would cost before it costs it.
 *
 * A slug not yet present is added (section + instance + sitemap entry). Shared
 * CSS/JS/theme are only touched when `updateShared` is set.
 *
 * Body: {
 *   pages: [{ slug, title, serviceTag, html, sourceHtml, js }],
 *   dryRun?: boolean,
 *   updateShared?: boolean, sharedCss?, sharedJs?, scriptLinks?, fontLinks?,
 *   tweaksSchema?, themeSets?, tweaks? (only with resetTweaks), resetTweaks?
 * }
 */
export const POST = withAuth<undefined, Params>({}, async ({ req, params }) => {
  const siteId = params.siteId?.trim();
  if (!siteId) return jsonError("siteId requis.", 400);

  let body: {
    pages?: IncomingPage[];
    dryRun?: boolean;
    updateShared?: boolean;
    sharedCss?: string;
    sharedJs?: string;
    scriptLinks?: string[];
    fontLinks?: string[];
    tweaksSchema?: Record<string, unknown>;
    themeSets?: Record<string, unknown>;
    tweaks?: Record<string, unknown>;
    resetTweaks?: boolean;
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
  const dryRun = body.dryRun === true;

  const supabase = getServiceClient();

  // Load the target template site + its page instances in one round-trip.
  const [{ data: site, error: sErr }, { data: instances, error: iErr }] = await Promise.all([
    supabase.from("sites").select("sitemap, shared_assets, tweaks, is_claude_design").eq("id", siteId).single(),
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
    if (ref?.theme_slug !== CLAUDE_DESIGN_THEME_SLUG) continue;
    // A reference with no section id would silently update zero rows below.
    if (typeof ref.section_id !== "string" || !ref.section_id) {
      return jsonError(`Page « ${inst.page_slug} » : référence de section manquante. Import annulé.`, 409);
    }
    bySlug.set(inst.page_slug, { instanceId: inst.id, sectionId: ref.section_id, content: inst.content ?? {} });
  }

  // The markup those overrides were written against, so they can be re-keyed.
  const targets = pages.map((p) => bySlug.get(p.slug)?.sectionId).filter((id): id is string => !!id);
  const exampleBySectionId = new Map<string, Record<string, unknown>>();
  if (targets.length > 0) {
    const { data: sections, error: secErr } = await supabase
      .from("theme_sections")
      .select("section_id, example_data")
      .eq("theme_slug", CLAUDE_DESIGN_THEME_SLUG)
      .in("section_id", targets);
    if (secErr) return jsonError(`theme_sections: ${secErr.message}`, 500);
    for (const s of (sections ?? []) as Array<{ section_id: string; example_data: Record<string, unknown> | null }>) {
      exampleBySectionId.set(s.section_id, s.example_data ?? {});
    }
    // A page pointing at a section row that no longer exists means the overwrite
    // would land nowhere while its overrides were rewritten. Refuse the whole
    // import rather than corrupt half of it.
    const missing = targets.filter((id) => !exampleBySectionId.has(id));
    if (missing.length > 0) {
      return jsonError(`Section(s) introuvable(s) pour ce template (${missing.length}). Import annulé.`, 409);
    }
  }

  // Same image under a different URL in each template: `original_path` is the
  // stable key the `asset` matcher uses to recognise a slot after a redesign.
  const assetPathByUrl = await assetPathMap(supabase, [siteId]);

  const sitemap = ((site as { sitemap?: SitemapPage[] | null }).sitemap ?? []) as SitemapPage[];
  let sitemapChanged = false;
  let updated = 0;
  let created = 0;
  const reports: PageReport[] = [];

  for (const page of pages) {
    // Mirror createClaudeDesignMultiPage exactly so a re-imported page is stored
    // identically to a freshly-imported one (loading hints in code + token html).
    const withHints = addImageLoadingHints(page.html);
    const code = wrapRawHtml(withHints);
    const incoming = { __source_html: page.sourceHtml, __token_html: withHints, __page_js: page.js ?? "" };
    const existing = bySlug.get(page.slug);

    if (existing) {
      const prevExample = exampleBySectionId.get(existing.sectionId) ?? {};
      const prevOverrides = (existing.content.__overrides as Record<string, unknown> | undefined) ?? {};
      const prevHtmlRaw = prevExample.__token_html;
      const prevHtml = typeof prevHtmlRaw === "string" && prevHtmlRaw.length > 0 ? prevHtmlRaw : null;

      // Unknown previous markup → keep the overrides untouched. Their paths are
      // usually still valid, and a photo in the wrong box is recoverable while a
      // deleted one is not.
      const remapped = prevHtml
        ? remapOverrides(prevHtml, withHints, prevOverrides, { assetPathByUrl })
        : { overrides: prevOverrides, dropped: [] as string[], uncertain: Object.keys(prevOverrides) };

      reports.push({
        slug: page.slug,
        kept: Object.keys(remapped.overrides).length,
        uncertain: remapped.uncertain.length,
        dropped: remapped.dropped,
        unverified: !prevHtml,
      });
      if (dryRun) { updated++; continue; }

      // Snapshot BEFORE touching anything, so a bad remap stays undoable.
      const backedUp = pushBackup(existing.content, {
        at: new Date().toISOString(),
        reason: "import-pages",
        label: page.title || page.slug,
        overrides: prevOverrides,
      });

      const { error: tsErr } = await supabase
        .from("theme_sections")
        .update({ code, example_data: nextExampleData(prevExample, incoming, prevHtml) })
        .eq("theme_slug", CLAUDE_DESIGN_THEME_SLUG)
        .eq("section_id", existing.sectionId);
      if (tsErr) return jsonError(`theme_sections: ${tsErr.message}`, 500);

      const { error: instErr } = await supabase
        .from("site_section_instances")
        .update({ content: { ...backedUp, __overrides: remapped.overrides } })
        .eq("id", existing.instanceId);
      if (instErr) return jsonError(instErr.message, 500);
      updated++;
    } else {
      reports.push({ slug: page.slug, kept: 0, uncertain: 0, dropped: [], unverified: false });
      if (dryRun) { created++; continue; }

      // New page for this template: section + instance + sitemap entry.
      const sectionId = `d-${randomUUID()}`;
      const { error: tsErr } = await supabase.from("theme_sections").insert({
        theme_slug: CLAUDE_DESIGN_THEME_SLUG,
        section_id: sectionId,
        category: "misc",
        name: page.title,
        code,
        example_data: incoming,
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

  const summary = {
    updated,
    created,
    keptOverrides: reports.reduce((n, r) => n + r.kept, 0),
    uncertainOverrides: reports.reduce((n, r) => n + r.uncertain, 0),
    droppedOverrides: reports.filter((r) => r.dropped.length > 0).map((r) => ({ slug: r.slug, keys: r.dropped })),
    unverifiedPages: reports.filter((r) => r.unverified).map((r) => r.slug),
  };
  if (dryRun) return json({ ok: true, dryRun: true, ...summary });

  if (sitemapChanged) {
    const { error: upErr } = await supabase.from("sites").update({ sitemap }).eq("id", siteId);
    if (upErr) return jsonError(upErr.message, 500);
  }

  // Optional: refresh the shared assets + theme too (opt-in — every page uses them).
  if (body.updateShared) {
    const shared = ((site as { shared_assets?: Record<string, unknown> | null }).shared_assets ?? {}) as Record<string, unknown>;
    const merged: Record<string, unknown> = { ...shared };
    if (typeof body.sharedCss === "string") merged.css = body.sharedCss;
    if (typeof body.sharedJs === "string") merged.js = body.sharedJs;
    // Replace, don't union: a variant ships its OWN fonts and libs. Unioning
    // kept every previously imported skin's Google Fonts loading forever.
    if (Array.isArray(body.scriptLinks)) merged.scriptLinks = body.scriptLinks;
    if (Array.isArray(body.fontLinks)) merged.fonts = body.fontLinks;
    // The Tweaks panel is built from the schema, and the theme sets translate a
    // tweak value into CSS vars. Both belong to the incoming design: a stale
    // schema hides the new variant's options, stale sets apply the old fonts.
    if (body.tweaksSchema && typeof body.tweaksSchema === "object") merged.tweaksSchema = body.tweaksSchema;
    if (body.themeSets && typeof body.themeSets === "object") merged.themeSets = body.themeSets;

    const update: Record<string, unknown> = { shared_assets: merged };
    // The operator's colour choices are theirs; only wipe them on request.
    if (body.resetTweaks && body.tweaks && typeof body.tweaks === "object") update.tweaks = body.tweaks;

    const { error: upErr } = await supabase.from("sites").update(update).eq("id", siteId);
    if (upErr) return jsonError(upErr.message, 500);
  }

  if (!dryRun) invalidateSiteCache(siteId);
  return json({ ok: true, ...summary });
});
