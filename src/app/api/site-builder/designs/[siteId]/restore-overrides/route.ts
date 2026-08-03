import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { CLAUDE_DESIGN_THEME_SLUG } from "@/lib/site-builder/create-claude-design";
import { remapOverrides } from "@/lib/site-builder/claude-design/remap-overrides";
import { pushBackup, readBackups, previousTokenHtml, type OverrideBackup } from "@/lib/site-builder/claude-design/override-backups";
import { assetPathMap } from "@/lib/site-builder/claude-design/asset-path-map";
import { invalidateSiteCache } from "@/lib/site-builder/site-cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { siteId: string };
interface LibraryRef { theme_slug: string; section_id: string }

interface PageState {
  slug: string;
  instanceId: string;
  content: Record<string, unknown>;
  backups: OverrideBackup[];
  /** Markup the current overrides are keyed against. */
  html: string;
  /** Markup the most recent backup was keyed against, when it was recorded. */
  prevHtml: string | null;
}

/** Loads every Claude-design page of a site with its backups and both markups. */
async function loadPages(
  supabase: ReturnType<typeof getServiceClient>,
  siteId: string,
): Promise<{ pages: PageState[] } | { error: string; status: number }> {
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
  const sectionIdBySlug = new Map<string, string>();
  const pages: PageState[] = [];
  for (const inst of insts) {
    const ref = inst.content?.__library as LibraryRef | undefined;
    if (ref?.theme_slug !== CLAUDE_DESIGN_THEME_SLUG || !ref.section_id) continue;
    sectionIdBySlug.set(inst.page_slug, ref.section_id);
    pages.push({
      slug: inst.page_slug,
      instanceId: inst.id,
      content: inst.content ?? {},
      backups: readBackups(inst.content),
      html: "",
      prevHtml: null,
    });
  }

  const ids = [...sectionIdBySlug.values()];
  if (ids.length > 0) {
    const { data: sections, error: secErr } = await supabase
      .from("theme_sections")
      .select("section_id, example_data")
      .eq("theme_slug", CLAUDE_DESIGN_THEME_SLUG)
      .in("section_id", ids);
    if (secErr) return { error: `theme_sections: ${secErr.message}`, status: 500 };
    const byId = new Map(
      ((sections ?? []) as Array<{ section_id: string; example_data: Record<string, unknown> | null }>)
        .map((s) => [s.section_id, s.example_data ?? {}] as const),
    );
    for (const page of pages) {
      const example = byId.get(sectionIdBySlug.get(page.slug)!) ?? {};
      page.html = typeof example.__token_html === "string" ? example.__token_html : "";
      page.prevHtml = previousTokenHtml(example);
    }
  }

  return { pages };
}

/**
 * GET /api/site-builder/designs/[siteId]/restore-overrides
 *
 * Lists the recoverable snapshots, newest first, grouped by the moment they were
 * taken — an import backs every page up in one pass, so a "generation" is what
 * the operator actually wants to roll back to.
 */
export const GET = withAuth<undefined, Params>({}, async ({ params }) => {
  const siteId = params.siteId?.trim();
  if (!siteId) return jsonError("siteId requis.", 400);

  const loaded = await loadPages(getServiceClient(), siteId);
  if ("error" in loaded) return jsonError(loaded.error, loaded.status);

  // Group by day+minute: the pages of one import share a timestamp to the second,
  // but a slow import can straddle it.
  const byMinute = new Map<string, { at: string; reason: string; pages: string[]; images: number }>();
  for (const page of loaded.pages) {
    page.backups.forEach((b) => {
      const bucket = b.at.slice(0, 16);
      const entry = byMinute.get(bucket) ?? { at: b.at, reason: b.reason, pages: [], images: 0 };
      entry.pages.push(page.slug);
      entry.images += Object.keys(b.overrides).length;
      if (b.at < entry.at) entry.at = b.at;
      byMinute.set(bucket, entry);
    });
  }

  const generations = [...byMinute.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([id, g]) => ({ id, at: g.at, reason: g.reason, pages: g.pages.sort(), images: g.images }));

  return json({ generations });
});

/**
 * POST /api/site-builder/designs/[siteId]/restore-overrides   (JSON)
 *
 * Puts back the photos a previous overwrite replaced. The overrides come from
 * `content.__backups`; they are re-keyed from the markup they were written
 * against (`example_data.__prev_token_html`) onto the page's current markup, so
 * a restore after a redesign lands the photos in the right slots instead of at
 * stale positions. Restoring is itself backed up, so it can be undone.
 *
 * Body: { generationId?, slugs?, dryRun? }
 * → { pages: [{ slug, restored, uncertain, dropped }], totalRestored, … }
 */
export const POST = withAuth<undefined, Params>({}, async ({ req, params }) => {
  const siteId = params.siteId?.trim();
  if (!siteId) return jsonError("siteId requis.", 400);

  let body: { generationId?: string; slugs?: string[]; dryRun?: boolean };
  try {
    body = await req.json();
  } catch {
    return jsonError("JSON invalide.", 400);
  }
  const dryRun = body.dryRun === true;
  const wanted = Array.isArray(body.slugs) && body.slugs.length > 0 ? new Set(body.slugs) : null;

  const supabase = getServiceClient();
  const loaded = await loadPages(supabase, siteId);
  if ("error" in loaded) return jsonError(loaded.error, loaded.status);

  const assetPathByUrl = await assetPathMap(supabase, [siteId]);
  const results: Array<{ slug: string; restored: number; uncertain: number; dropped: number }> = [];

  for (const page of loaded.pages) {
    if (wanted && !wanted.has(page.slug)) continue;
    const backup = body.generationId
      ? page.backups.find((b) => b.at.slice(0, 16) === body.generationId)
      : page.backups[0];
    if (!backup || Object.keys(backup.overrides).length === 0) continue;

    // The backup was keyed against the markup replaced at that moment. Without
    // it we can only reuse the stored paths as-is.
    const remapped = page.prevHtml && page.html
      ? remapOverrides(page.prevHtml, page.html, backup.overrides, { assetPathByUrl })
      : { overrides: backup.overrides, dropped: [] as string[], uncertain: Object.keys(backup.overrides) };

    const current = (page.content.__overrides as Record<string, unknown> | undefined) ?? {};
    const next = { ...current, ...remapped.overrides };

    results.push({
      slug: page.slug,
      restored: Object.keys(remapped.overrides).length,
      uncertain: remapped.uncertain.length,
      dropped: remapped.dropped.length,
    });
    if (dryRun || Object.keys(remapped.overrides).length === 0) continue;

    // Restoring replaces what is there now, so snapshot that too.
    const backedUp = pushBackup(page.content, {
      at: new Date().toISOString(),
      reason: "restore-overrides",
      label: page.slug,
      overrides: current,
    });
    const { error: updErr } = await supabase
      .from("site_section_instances")
      .update({ content: { ...backedUp, __overrides: next } })
      .eq("id", page.instanceId);
    if (updErr) return jsonError(updErr.message, 500);
  }

  if (!dryRun) invalidateSiteCache(siteId);
  return json({
    ok: true,
    dryRun,
    pages: results,
    totalRestored: results.reduce((n, r) => n + r.restored, 0),
    totalUncertain: results.reduce((n, r) => n + r.uncertain, 0),
    totalDropped: results.reduce((n, r) => n + r.dropped, 0),
  });
});
