import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { CLAUDE_DESIGN_THEME_SLUG } from "@/lib/site-builder/create-claude-design";
import { AUTO_IMAGE_ZONES, findZone, findZoneSlots, type AutoImageSlot } from "@/lib/site-builder/claude-design/auto-image-zones";
import { drawImageSets, seededRandom, type LibraryImage } from "@/lib/site-builder/claude-design/draw-image-sets";
import { serializeImageSet } from "@/lib/site-builder/claude-design/image-set";
import { clearImageKeys } from "@/lib/site-builder/claude-design/image-override-keys";
import { pushBackup } from "@/lib/site-builder/claude-design/override-backups";
import { invalidateSiteCache } from "@/lib/site-builder/site-cache";
import { serviceTagKey } from "@/utils/serviceTags";
import { MEDIA_LIBRARY_UNIVERSAL_TAG } from "@/types";

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

/** The design's pages plus the markup its override paths are keyed against. */
async function loadDesignPages(
  supabase: ReturnType<typeof getServiceClient>,
  siteId: string,
): Promise<{ pages: DesignPage[]; enterpriseId: number | null } | { error: string; status: number }> {
  const [{ data: site, error: sErr }, { data: instances, error: iErr }] = await Promise.all([
    supabase.from("sites").select("is_claude_design, enterprise_id").eq("id", siteId).single(),
    supabase.from("site_section_instances").select("id, page_slug, content").eq("site_id", siteId),
  ]);
  if (sErr || !site) return { error: sErr?.message ?? "Site introuvable.", status: sErr ? 500 : 404 };
  if (iErr) return { error: iErr.message, status: 500 };
  if (!(site as { is_claude_design?: boolean | null }).is_claude_design) {
    return { error: "Ce site n'est pas un design Claude multi-pages.", status: 400 };
  }

  const insts = (instances ?? []) as Array<{ id: string; page_slug: string; content: Record<string, unknown> | null }>;
  const pages: DesignPage[] = [];
  const sectionIdBySlug = new Map<string, string>();
  for (const inst of insts) {
    const ref = inst.content?.__library as LibraryRef | undefined;
    if (ref?.theme_slug !== CLAUDE_DESIGN_THEME_SLUG || !ref.section_id) continue;
    sectionIdBySlug.set(inst.page_slug, ref.section_id);
    pages.push({
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
    for (const page of pages) {
      page.html = htmlBySection.get(sectionIdBySlug.get(page.slug)!) ?? "";
    }
  }

  pages.sort((a, b) => (a.slug === "/" ? -1 : b.slug === "/" ? 1 : a.slug.localeCompare(b.slug)));
  return { pages, enterpriseId: (site as { enterprise_id?: number | null }).enterprise_id ?? null };
}

/** The company's trades, as written on its record. */
async function companyTags(
  supabase: ReturnType<typeof getServiceClient>,
  enterpriseId: number,
): Promise<string[]> {
  const { data } = await supabase.from("entreprises").select("service_tags").eq("id", enterpriseId).maybeSingle();
  const raw = (data as { service_tags?: unknown } | null)?.service_tags;
  return Array.isArray(raw) ? raw.filter((t): t is string => typeof t === "string" && t.trim() !== "") : [];
}

/** Every library image carrying one of `tags`, plus the universal ones. */
async function loadLibrary(
  supabase: ReturnType<typeof getServiceClient>,
  tags: string[],
): Promise<LibraryImage[] | { error: string }> {
  const wanted = new Set(tags.map(serviceTagKey).filter(Boolean));
  // Filtering by tag in SQL means matching the WRITTEN label, while the whole
  // codebase compares canonical keys ("Pompe à chaleur" ≡ "pompe-a-chaleur").
  // The library is small enough to filter here and stay on the canonical rule.
  const { data, error } = await supabase
    .from("media_library")
    .select("id, public_url, service_tags, alt_text, description")
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) return { error: error.message };

  const rows = (data ?? []) as Array<{
    id: string; public_url: string; service_tags: unknown; alt_text: string | null; description: string | null;
  }>;
  const out: LibraryImage[] = [];
  for (const row of rows) {
    if (!row.public_url) continue;
    const itemTags = Array.isArray(row.service_tags)
      ? (row.service_tags as unknown[]).filter((t): t is string => typeof t === "string")
      : [];
    const keys = itemTags.map(serviceTagKey);
    const relevant = keys.some((k) => wanted.has(k) || k === MEDIA_LIBRARY_UNIVERSAL_TAG) || itemTags.length === 0;
    if (!relevant) continue;
    out.push({
      id: row.id,
      url: row.public_url,
      tags: itemTags,
      alt: (row.alt_text || row.description || "").trim() || undefined,
    });
  }
  return out;
}

interface ZoneTarget {
  zoneId: string;
  pages: Array<{ slug: string; page: DesignPage; slots: AutoImageSlot[] }>;
  slotCount: number;
  alts: string[];
}

/** Where a zone lives across the design. The slot COUNT is the zone's own (six
 *  réalisations), identical on every page — a page that ships fewer is filled up
 *  to its own count, never padded. */
function zoneTargets(pages: DesignPage[], zoneIds: string[]): ZoneTarget[] {
  const out: ZoneTarget[] = [];
  for (const zoneId of zoneIds) {
    const zone = findZone(zoneId);
    if (!zone) continue;
    const hits = pages
      .map((page) => ({ slug: page.slug, page, slots: findZoneSlots(page.html, zone) }))
      .filter((h) => h.slots.length > 0);
    if (hits.length === 0) continue;
    const slotCount = Math.max(...hits.map((h) => h.slots.length));
    // The export writes the same six alts everywhere; take the first page that
    // has them so a library image without a description still gets one.
    const alts = (hits.find((h) => h.slots.length === slotCount)?.slots ?? []).map((s) => s.alt);
    out.push({ zoneId, pages: hits, slotCount, alts });
  }
  return out;
}

/**
 * GET /api/site-builder/designs/[siteId]/auto-images
 *
 * What the panel needs before anything is drawn: the zones this design actually
 * carries (with the pages and slot count behind each), the company's trades, and
 * the size of the library pool per trade — the number that tells the operator
 * whether more photos need importing.
 *
 * `?entreprise_id=` overrides the site's own company, so a TEMPLATE previewed as
 * a company can be filled for that company.
 */
export const GET = withAuth<undefined, Params>({}, async ({ req, params }) => {
  const siteId = params.siteId?.trim();
  if (!siteId) return jsonError("siteId requis.", 400);

  const supabase = getServiceClient();
  const loaded = await loadDesignPages(supabase, siteId);
  if ("error" in loaded) return jsonError(loaded.error, loaded.status);

  const override = new URL(req.url).searchParams.get("entreprise_id");
  const enterpriseId = override ? Number(override) : loaded.enterpriseId;
  const tags = enterpriseId != null && Number.isFinite(enterpriseId) ? await companyTags(supabase, enterpriseId) : [];

  const library = await loadLibrary(supabase, tags);
  if ("error" in library) return jsonError(library.error, 500);

  const targets = zoneTargets(loaded.pages, AUTO_IMAGE_ZONES.map((z) => z.id));
  const zones = targets.map((t) => {
    const zone = findZone(t.zoneId)!;
    return {
      id: zone.id,
      label: zone.label,
      hint: zone.hint,
      slotCount: t.slotCount,
      pages: t.pages.map((p) => ({ slug: p.slug, slots: p.slots.length })),
    };
  });

  // Pools are reported for the company's OWN trades: those are the ones that
  // must be stocked, and an empty one is why a band looks generic.
  const { pools, emptyTags } = drawImageSets(
    { slotCount: targets[0]?.slotCount ?? 0, companyTags: tags, library, random: seededRandom(1) },
    targets[0]?.alts ?? [],
  );

  return json({ zones, companyTags: tags, enterpriseId, pools, emptyTags, librarySize: library.length });
});

/**
 * POST /api/site-builder/designs/[siteId]/auto-images   (JSON)
 *
 * Fills the design's auto zones (see auto-image-zones.ts) from the media
 * library, for one company's trades. Each slot receives an `:image_set` — the
 * candidates the renderer picks from — so ONE draw serves the company it was
 * made for and every other company the design is later shown to.
 *
 * The same draw is written to EVERY page carrying the zone: the réalisations
 * band is the same band on the home page and on each service page, and the
 * operator asked for the same photos throughout.
 *
 * Body: { zones?: string[], entrepriseId?: number, seed?: number, dryRun?: boolean }
 * → { seed, zones: [{ zoneId, pages: [{slug, slots}], slots: [{order, url, alt, tag}] }],
 *     pools, emptyTags, written }
 */
export const POST = withAuth<undefined, Params>({}, async ({ req, params }) => {
  const siteId = params.siteId?.trim();
  if (!siteId) return jsonError("siteId requis.", 400);

  let body: { zones?: string[]; entrepriseId?: number; seed?: number; dryRun?: boolean };
  try {
    body = await req.json();
  } catch {
    return jsonError("JSON invalide.", 400);
  }
  const dryRun = body.dryRun === true;
  const seed = Number.isFinite(body.seed) ? Number(body.seed) : Math.floor(Math.random() * 2 ** 31);

  const supabase = getServiceClient();
  const loaded = await loadDesignPages(supabase, siteId);
  if ("error" in loaded) return jsonError(loaded.error, loaded.status);

  const enterpriseId = Number.isFinite(body.entrepriseId) ? Number(body.entrepriseId) : loaded.enterpriseId;
  if (enterpriseId == null || !Number.isFinite(enterpriseId)) {
    return jsonError("Aucune entreprise : choisis-en une pour tirer des images adaptées à ses services.", 400);
  }
  const tags = await companyTags(supabase, enterpriseId);
  if (tags.length === 0) {
    return jsonError("Cette entreprise n'a aucun service tag — impossible de choisir des photos adaptées.", 422);
  }

  const library = await loadLibrary(supabase, tags);
  if ("error" in library) return jsonError(library.error, 500);
  if (library.length === 0) {
    return jsonError("Aucune image de la médiathèque ne porte les services de cette entreprise.", 422);
  }

  const requested = Array.isArray(body.zones) && body.zones.length > 0 ? body.zones : AUTO_IMAGE_ZONES.map((z) => z.id);
  const targets = zoneTargets(loaded.pages, requested);
  if (targets.length === 0) return jsonError("Ce design ne contient aucune zone à remplir automatiquement.", 422);

  // One draw per zone, replayed identically on every page of that zone — the
  // random source is re-seeded per zone so a zone's result never depends on how
  // many zones were requested alongside it.
  const report: Array<{
    zoneId: string;
    label: string;
    pages: Array<{ slug: string; slots: number }>;
    slots: Array<{ order: number; url: string; alt: string; tag: string | null }>;
  }> = [];
  const writesByInstance = new Map<string, {
    page: DesignPage;
    overrides: Record<string, unknown>;
    /** True when the slots hold something a draw did not put there. */
    replacesHandwork: boolean;
  }>();
  let written = 0;
  let pools: ReturnType<typeof drawImageSets>["pools"] = [];
  let emptyTags: string[] = [];

  for (const target of targets) {
    const zone = findZone(target.zoneId)!;
    const draw = drawImageSets(
      { slotCount: target.slotCount, companyTags: tags, library, random: seededRandom(seed) },
      target.alts,
    );
    pools = draw.pools;
    emptyTags = draw.emptyTags;

    report.push({
      zoneId: zone.id,
      label: zone.label,
      pages: target.pages.map((p) => ({ slug: p.slug, slots: p.slots.length })),
      slots: draw.slots.map((s, i) => ({
        order: i + 1,
        url: s.chosen?.url ?? "",
        alt: s.chosen?.alt ?? target.alts[i] ?? "",
        tag: s.leadTag,
      })),
    });

    if (dryRun) continue;

    for (const { page, slots } of target.pages) {
      const entry = writesByInstance.get(page.instanceId)
        ?? { page, overrides: { ...page.overrides }, replacesHandwork: false };
      for (const slot of slots) {
        // A page with fewer slots than the zone's max takes the first ones.
        const drawn = draw.slots[slot.order - 1] ?? draw.slots[slots.indexOf(slot)];
        if (!drawn || drawn.candidates.length === 0) continue;
        // Only a photo the operator placed by hand is worth a backup slot. A
        // re-draw replaces a previous draw, and backing THAT up would push the
        // hand-placed state out of the five kept — losing the one state anybody
        // would want back.
        const hadSingle = ["image", "bg_image", "image_mobile"].some((k) => `${slot.path}:${k}` in page.overrides);
        if (hadSingle) entry.replacesHandwork = true;
        // A set and a single image are mutually exclusive on a slot: drop the
        // single-image keys this set replaces, or both would apply.
        clearImageKeys(entry.overrides, slot.path, ["image_set"]);
        entry.overrides[`${slot.path}:image_set`] = {
          kind: "image_set",
          value: serializeImageSet(drawn.candidates),
        };
        written++;
      }
      writesByInstance.set(page.instanceId, entry);
    }
  }

  if (!dryRun) {
    for (const { page, overrides, replacesHandwork } of writesByInstance.values()) {
      // Snapshot only when a hand-placed photo is being replaced — see above.
      const content = replacesHandwork
        ? pushBackup(page.content, {
            at: new Date().toISOString(),
            reason: "auto-images",
            label: page.slug,
            overrides: page.overrides,
          })
        : page.content;
      const { error } = await supabase
        .from("site_section_instances")
        .update({ content: { ...content, __overrides: overrides } })
        .eq("id", page.instanceId);
      if (error) return jsonError(error.message, 500);
    }
    invalidateSiteCache(siteId);
  }

  return json({ seed, zones: report, pools, emptyTags, written, dryRun });
});
