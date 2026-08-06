import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { CLAUDE_DESIGN_THEME_SLUG } from "@/lib/site-builder/create-claude-design";
import { AUTO_IMAGE_ZONES, findZone, findZoneSlots, type AutoImageSlot } from "@/lib/site-builder/claude-design/auto-image-zones";
import { chooseSlotImage, drawImageSets, redrawSlot, seededRandom, type LibraryImage } from "@/lib/site-builder/claude-design/draw-image-sets";
import { parseImageSet, pickCandidate, serializeImageSet } from "@/lib/site-builder/claude-design/image-set";
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

interface PlacedSlot {
  order: number;
  url: string;
  alt: string;
  tag: string | null;
}

/**
 * What the band currently SHOWS for this company: each slot's stored set,
 * resolved the way the renderer resolves it. Read from the first page that
 * carries the zone — every page holds the same draw.
 *
 * Without this the panel could only display a draw it had just made, so
 * reopening the editor left the per-photo swap button with nothing to act on.
 */
function placedSlots(target: ZoneTarget, tags: string[]): PlacedSlot[] {
  for (const { page, slots } of target.pages) {
    const placed: PlacedSlot[] = [];
    for (const slot of slots) {
      const entry = page.overrides[`${slot.path}:image_set`] as { value?: string } | undefined;
      if (!entry || typeof entry.value !== "string") continue;
      const candidates = parseImageSet(entry.value).candidates;
      const chosen = pickCandidate(candidates, tags);
      if (!chosen?.url) continue;
      placed.push({
        order: slot.order,
        url: chosen.url,
        alt: chosen.alt ?? slot.alt,
        // The lead candidate's tag is the trade the slot was drawn for.
        tag: candidates[0]?.tags?.[0] ?? null,
      });
    }
    if (placed.length > 0) return placed.sort((a, b) => a.order - b.order);
  }
  return [];
}

/** A library photo as the panel's per-slot picker needs it: canonical tag keys,
 *  so the picker filters by trade the way the rest of the codebase compares
 *  tags ("Pompe à chaleur" ≡ "pompe-a-chaleur"). An untagged photo comes out
 *  with no tag at all and counts as generic, exactly like `isUniversal`. */
function pickableImages(library: LibraryImage[]): Array<{ id: string; url: string; alt: string; tags: string[] }> {
  return library.map((img) => ({
    id: img.id,
    url: img.url,
    alt: img.alt ?? "",
    tags: [...new Set((img.tags ?? []).map(serviceTagKey).filter(Boolean))],
  }));
}

/**
 * GET /api/site-builder/designs/[siteId]/auto-images
 *
 * What the panel needs before anything is drawn: the zones this design actually
 * carries (with the pages and slot count behind each), the company's trades, the
 * size of the library pool per trade — the number that tells the operator
 * whether more photos need importing — and the photos themselves, so a slot can
 * be filled by hand from the trade the operator wants instead of at random.
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
      /** What the band shows right now, so the panel can offer a per-photo swap
       *  without having to draw first. */
      slots: placedSlots(t, tags),
    };
  });

  // Pools are reported for the company's OWN trades: those are the ones that
  // must be stocked, and an empty one is why a band looks generic.
  const { pools, emptyTags } = drawImageSets(
    { slotCount: targets[0]?.slotCount ?? 0, companyTags: tags, library, random: seededRandom(1) },
    targets[0]?.alts ?? [],
  );

  return json({
    zones,
    companyTags: tags,
    enterpriseId,
    pools,
    emptyTags,
    librarySize: library.length,
    /** Everything the picker may offer — already narrowed to this company's
     *  trades (plus the generic photos) by `loadLibrary`. */
    library: pickableImages(library),
  });
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
 * With `slot` (1-based), only THAT slot is redrawn — the operator likes the
 * band but wants one photo swapped. The slot keeps its trade and avoids the
 * photos the other slots already show; everything else is left untouched.
 *
 * With `slot` AND `url`, that slot takes the photo the operator picked in the
 * library rather than a random one. The set is still rebuilt whole, so the
 * design keeps serving the other companies.
 *
 * Body: { zones?: string[], entrepriseId?: number, seed?: number, slot?: number,
 *         url?: string, dryRun?: boolean }
 * → { seed, zones: [{ zoneId, pages: [{slug, slots}], slots: [{order, url, alt, tag}] }],
 *     pools, emptyTags, written }
 */
export const POST = withAuth<undefined, Params>({}, async ({ req, params }) => {
  const siteId = params.siteId?.trim();
  if (!siteId) return jsonError("siteId requis.", 400);

  let body: {
    zones?: string[]; entrepriseId?: number; seed?: number; slot?: number; url?: string; dryRun?: boolean;
  };
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

  // `slot` (1-based) → swap that photo only, keeping the rest of the band.
  const oneSlot = Number.isFinite(body.slot) ? Math.floor(Number(body.slot)) : null;
  // `url` → the operator picked it himself; without a slot there is nothing to
  // put it on, and silently redrawing the whole band would throw the pick away.
  const pickedUrl = typeof body.url === "string" ? body.url.trim() : "";
  if (pickedUrl && oneSlot === null) return jsonError("Choisir une photo demande aussi son emplacement.", 400);

  for (const target of targets) {
    const zone = findZone(target.zoneId)!;
    const full = drawImageSets(
      { slotCount: target.slotCount, companyTags: tags, library, random: seededRandom(seed) },
      target.alts,
    );
    pools = full.pools;
    emptyTags = full.emptyTags;

    // What the band shows today — the baseline a single-slot swap edits, and
    // the set of photos the new one must not duplicate.
    const placed = oneSlot === null ? [] : placedSlots(target, tags);
    let single: ReturnType<typeof redrawSlot> = null;
    if (oneSlot !== null) {
      if (oneSlot < 1 || oneSlot > target.slotCount) {
        return jsonError(`Emplacement ${oneSlot} inconnu dans cette section.`, 422);
      }
      const current = placed.find((p) => p.order === oneSlot);
      const common = {
        slotCount: target.slotCount,
        companyTags: tags,
        library,
        random: seededRandom(seed),
        slotIndex: oneSlot - 1,
      };
      const alt = target.alts[oneSlot - 1] ?? "";
      single = pickedUrl
        ? chooseSlotImage({ ...common, url: pickedUrl }, alt)
        : redrawSlot(
            {
              ...common,
              usedUrls: placed.filter((p) => p.order !== oneSlot).map((p) => p.url),
              currentUrl: current?.url,
              // Stay on the trade the slot SHOWS: a hand-picked photo may have
              // moved it off its round-robin trade, and re-rolling is meant to
              // change the photo, not to undo that choice.
              leadTag: current?.tag ?? undefined,
            },
            alt,
          );
      if (!single) {
        return jsonError(
          pickedUrl
            ? "Cette photo n'est plus dans la médiathèque, ou ne concerne pas cette entreprise."
            : "Pas d'autre photo disponible pour ce métier — importe-en dans la médiathèque.",
          422,
        );
      }
    }

    // The report always describes the WHOLE band, so the panel refreshes its
    // thumbnails from one answer whether one photo changed or all six.
    const slotsReport = full.slots.map((drawnSlot, i) => {
      const order = i + 1;
      const alt = target.alts[i] ?? "";
      if (oneSlot === null) {
        return { order, url: drawnSlot.chosen?.url ?? "", alt: drawnSlot.chosen?.alt ?? alt, tag: drawnSlot.leadTag };
      }
      if (order === oneSlot) {
        return { order, url: single!.chosen?.url ?? "", alt: single!.chosen?.alt ?? alt, tag: single!.leadTag };
      }
      const kept = placed.find((p) => p.order === order);
      return { order, url: kept?.url ?? "", alt: kept?.alt ?? alt, tag: kept?.tag ?? null };
    });

    report.push({
      zoneId: zone.id,
      label: zone.label,
      pages: target.pages.map((p) => ({ slug: p.slug, slots: p.slots.length })),
      slots: slotsReport,
    });

    if (dryRun) continue;

    for (const { page, slots } of target.pages) {
      const entry = writesByInstance.get(page.instanceId)
        ?? { page, overrides: { ...page.overrides }, replacesHandwork: false };
      for (const slot of slots) {
        // Single-slot swap: leave every other slot exactly as it is.
        if (oneSlot !== null && slot.order !== oneSlot) continue;
        // A page with fewer slots than the zone's max takes the first ones.
        const drawn = oneSlot !== null
          ? single
          : full.slots[slot.order - 1] ?? full.slots[slots.indexOf(slot)];
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
