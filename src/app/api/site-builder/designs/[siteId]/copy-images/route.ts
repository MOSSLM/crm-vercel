import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { CLAUDE_DESIGN_THEME_SLUG } from "@/lib/site-builder/create-claude-design";
import { parse, type HTMLElement } from "node-html-parser";
import { remapOverrides, splitOverrideKey } from "@/lib/site-builder/claude-design/remap-overrides";
import { clearImageKeys, imageSlotPaths, isImageOverrideKey, kindForElement, pagesMissingFromTarget } from "@/lib/site-builder/claude-design/image-override-keys";
import { pushBackup } from "@/lib/site-builder/claude-design/override-backups";
import { assetPathMap } from "@/lib/site-builder/claude-design/asset-path-map";
import { invalidateSiteCache } from "@/lib/site-builder/site-cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { siteId: string };
interface LibraryRef { theme_slug: string; section_id: string }

interface DesignPage {
  slug: string;
  instanceId: string;
  content: Record<string, unknown>;
  overrides: Record<string, unknown>;
  html: string;
}

/** Tells whether the element at a dotted path is an `<img>` — the renderer sets
 *  `src` for an `image` override and a background for `bg_image`, so the kind
 *  has to match the element it lands on or the photo never shows. */
function imgLookup(html: string): (path: string) => boolean {
  const root = parse(html || "") as unknown as HTMLElement;
  const cache = new Map<string, boolean>();
  return (path: string) => {
    const hit = cache.get(path);
    if (hit !== undefined) return hit;
    let node: HTMLElement | null = root;
    for (const idx of path.split(".").filter(Boolean).map(Number)) {
      const kids = (node?.childNodes.filter((c) => c.nodeType === 1) ?? []) as HTMLElement[];
      node = kids[idx] ?? null;
      if (!node) break;
    }
    const isImg = node?.tagName?.toLowerCase() === "img";
    cache.set(path, isImg);
    return isImg;
  };
}

/** Loads a Claude Design's pages: the instance that stores the overrides plus
 *  the markup those overrides are keyed against. */
async function loadDesignPages(
  supabase: ReturnType<typeof getServiceClient>,
  siteId: string,
): Promise<{ pages: Map<string, DesignPage> } | { error: string; status: number }> {
  const [{ data: site, error: sErr }, { data: instances, error: iErr }] = await Promise.all([
    supabase.from("sites").select("is_claude_design").eq("id", siteId).single(),
    supabase.from("site_section_instances").select("id, page_slug, content").eq("site_id", siteId),
  ]);
  if (sErr || !site) return { error: sErr?.message ?? "Template introuvable.", status: sErr ? 500 : 404 };
  if (iErr) return { error: iErr.message, status: 500 };
  if (!(site as { is_claude_design?: boolean | null }).is_claude_design) {
    return { error: "Ce site n'est pas un design Claude multi-pages.", status: 400 };
  }

  const insts = (instances ?? []) as Array<{ id: string; page_slug: string; content: Record<string, unknown> | null }>;
  const pages = new Map<string, DesignPage>();
  const sectionIdBySlug = new Map<string, string>();
  for (const inst of insts) {
    const ref = inst.content?.__library as LibraryRef | undefined;
    if (ref?.theme_slug !== CLAUDE_DESIGN_THEME_SLUG) continue;
    sectionIdBySlug.set(inst.page_slug, ref.section_id);
    pages.set(inst.page_slug, {
      slug: inst.page_slug,
      instanceId: inst.id,
      content: inst.content ?? {},
      overrides: (inst.content?.__overrides as Record<string, unknown>) ?? {},
      html: "",
    });
  }

  const sectionIds = [...sectionIdBySlug.values()];
  if (sectionIds.length > 0) {
    const { data: sections, error: secErr } = await supabase
      .from("theme_sections")
      .select("section_id, example_data")
      .eq("theme_slug", CLAUDE_DESIGN_THEME_SLUG)
      .in("section_id", sectionIds);
    if (secErr) return { error: `theme_sections: ${secErr.message}`, status: 500 };
    const htmlBySection = new Map<string, string>();
    for (const s of (sections ?? []) as Array<{ section_id: string; example_data: Record<string, unknown> | null }>) {
      htmlBySection.set(s.section_id, (s.example_data?.__token_html as string) ?? "");
    }
    for (const [slug, sectionId] of sectionIdBySlug) {
      const page = pages.get(slug);
      if (page) page.html = htmlBySection.get(sectionId) ?? "";
    }
  }

  return { pages };
}

/**
 * POST /api/site-builder/designs/[siteId]/copy-images   (JSON)
 *
 * Copies the PHOTOS an operator placed on one Claude Design template onto
 * another. The Claude export ships several variants of the same site (Classique
 * / Brut / Agency) whose page markup is identical — only the head assets differ
 * — so the ~200 photo slots filled by hand on one variant are the same slots on
 * its siblings. Placing them once and copying is the point of the feature.
 *
 * Only image kinds travel (`image`, `bg_image`, `image_set`, `image_mobile`) —
 * the target template keeps its own copy. Slots are matched through
 * `remapOverrides`, so a variant whose markup HAS drifted reports the slots it
 * could not place rather than putting a photo in the wrong box.
 *
 * The copied values are public bucket URLs and are reused as-is: no bytes are
 * re-uploaded, exactly like a cloned demo pointing at its template's assets.
 *
 * Pages are paired by slug, so the set copied grows on its own as the export
 * does — nothing here enumerates the CVC pages. A page the source has photos on
 * and the target does not have AT ALL is reported in `missingPages`: it has to
 * be imported («  Importer des pages ») before its photos have anywhere to land.
 *
 * Body: { sourceSiteId, slugs?: string[], overwrite?: boolean, dryRun?: boolean }
 * → { pages: [{ slug, applied, skipped, dropped }], totalApplied, totalSkipped,
 *     totalDropped, commonSlugs, missingPages: [{ slug, images }] }
 */
export const POST = withAuth<undefined, Params>({}, async ({ req, params }) => {
  const siteId = params.siteId?.trim();
  if (!siteId) return jsonError("siteId requis.", 400);

  let body: { sourceSiteId?: string; slugs?: string[]; overwrite?: boolean; dryRun?: boolean };
  try {
    body = await req.json();
  } catch {
    return jsonError("JSON invalide.", 400);
  }

  const sourceSiteId = body.sourceSiteId?.trim();
  if (!sourceSiteId) return jsonError("sourceSiteId requis.", 400);
  if (sourceSiteId === siteId) return jsonError("Choisis un template source différent.", 400);

  const overwrite = body.overwrite === true;
  const dryRun = body.dryRun === true;
  const wanted = Array.isArray(body.slugs) && body.slugs.length > 0 ? new Set(body.slugs) : null;

  const supabase = getServiceClient();
  const [target, source] = await Promise.all([
    loadDesignPages(supabase, siteId),
    loadDesignPages(supabase, sourceSiteId),
  ]);
  if ("error" in target) return jsonError(target.error, target.status);
  if ("error" in source) return jsonError(`Template source : ${source.error}`, source.status);

  // The same picture lives under a different URL in each design; `original_path`
  // is what lets the remapper recognise a slot once the markup has drifted.
  const assetPathByUrl = await assetPathMap(supabase, [siteId, sourceSiteId]);

  const results: Array<{ slug: string; applied: number; skipped: number; uncertain: number; dropped: number }> = [];
  const commonSlugs: string[] = [];

  for (const [slug, targetPage] of target.pages) {
    const sourcePage = source.pages.get(slug);
    if (!sourcePage) continue;
    commonSlugs.push(slug);
    if (wanted && !wanted.has(slug)) continue;

    const sourceImages: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(sourcePage.overrides)) {
      if (isImageOverrideKey(key)) sourceImages[key] = entry;
    }
    if (Object.keys(sourceImages).length === 0) continue;

    const { overrides: remapped, dropped, uncertain } = remapOverrides(
      sourcePage.html, targetPage.html, sourceImages, { assetPathByUrl },
    );

    // Where each remapped key lands, so a photo is written in the kind that
    // element actually renders (`src` vs background).
    const isImgAt = imgLookup(targetPage.html);

    // Slots the target already fills — left alone unless the operator asked for
    // a full sync. Computed BEFORE any write so the whole page is judged against
    // its original state, not against the keys this pass just added.
    const filled = imageSlotPaths(targetPage.overrides);
    const next = { ...targetPage.overrides };
    let applied = 0;
    let skipped = 0;

    // Group by slot: a slot's incoming kinds must be known before clearing, so
    // an `image_mobile` the target already has isn't dropped by an `image` write.
    const bySlot = new Map<string, Array<{ kind: string; entry: unknown }>>();
    for (const [key, entry] of Object.entries(remapped)) {
      const { path, kind } = splitOverrideKey(key);
      const landed = kindForElement(kind, isImgAt(path));
      const list = bySlot.get(path);
      if (list) list.push({ kind: landed, entry });
      else bySlot.set(path, [{ kind: landed, entry }]);
    }

    for (const [path, entries] of bySlot) {
      if (filled.has(path)) {
        if (!overwrite) { skipped += entries.length; continue; }
        clearImageKeys(next, path, entries.map((e) => e.kind));
      }
      for (const { kind, entry } of entries) {
        next[`${path}:${kind}`] = entry;
        applied++;
      }
    }

    results.push({ slug, applied, skipped, uncertain: uncertain.length, dropped: dropped.length });
    if (applied === 0 || dryRun) continue;

    // Overwriting replaces photos already in place: snapshot them first.
    const content = overwrite
      ? pushBackup(targetPage.content, {
          at: new Date().toISOString(),
          reason: "copy-images",
          label: slug,
          overrides: targetPage.overrides,
        })
      : targetPage.content;

    const { error: updErr } = await supabase
      .from("site_section_instances")
      .update({ content: { ...content, __overrides: next } })
      .eq("id", targetPage.instanceId);
    if (updErr) return jsonError(updErr.message, 500);
  }

  // Pages the source has photos on that this template does not have at all.
  // Matching is slug to slug, so there is nothing to copy into — but staying
  // silent about it is what makes a freshly added page look like it was skipped.
  const missingPages = pagesMissingFromTarget(
    new Map([...source.pages].map(([slug, p]) => [slug, p.overrides])),
    target.pages,
  );

  if (!dryRun) invalidateSiteCache(siteId);
  return json({
    pages: results,
    commonSlugs,
    missingPages,
    totalApplied: results.reduce((n, r) => n + r.applied, 0),
    totalSkipped: results.reduce((n, r) => n + r.skipped, 0),
    totalUncertain: results.reduce((n, r) => n + r.uncertain, 0),
    totalDropped: results.reduce((n, r) => n + r.dropped, 0),
  });
});
