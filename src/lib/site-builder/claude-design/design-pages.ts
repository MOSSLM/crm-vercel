/**
 * Ce qu'une zone auto-remplie a besoin de savoir d'un design Claude : ses
 * pages, le balisage sur lequel les chemins d'override sont calés, les
 * emplacements de chaque bande, et ce que la bande montre aujourd'hui.
 *
 * Extrait de la route `auto-images` parce qu'il y a désormais DEUX écrivains
 * de ces bandes, et qu'ils doivent voir exactement les mêmes emplacements :
 *
 *   - le tirage lui-même (`/api/site-builder/designs/[siteId]/auto-images`) ;
 *   - la réapplication (`appliquer-tirage.ts`), qui repose le dernier tirage
 *     sur des pages qu'une refonte ou un clonage vient de recréer.
 *
 * Une deuxième implémentation de `zoneTargets` qui compterait les chemins
 * autrement écrirait à côté des emplacements — l'override viserait un nœud
 * voisin, et la photo se poserait sur ce qui se trouve là. D'où un seul
 * module, et aucune duplication.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CLAUDE_DESIGN_THEME_SLUG } from "@/lib/site-builder/create-claude-design";
import { findZone, findZoneSlots, type AutoImageSlot } from "./auto-image-zones";
import { parseImageSet, pickCandidate } from "./image-set";
import { serviceTagKey } from "@/utils/serviceTags";
import { MEDIA_LIBRARY_UNIVERSAL_TAG } from "@/types";
import type { LibraryImage } from "./draw-image-sets";

interface LibraryRef { theme_slug: string; section_id: string }

export interface DesignPage {
  slug: string;
  instanceId: string;
  content: Record<string, unknown>;
  overrides: Record<string, unknown>;
  html: string;
}

export interface DesignPages {
  pages: DesignPage[];
  enterpriseId: number | null;
  /** Un gabarit garde des jeux à plusieurs candidats : il sert toutes les
   *  entreprises. Un site d'entreprise, lui, fige la photo tirée. */
  isTemplate: boolean;
}

/** The design's pages plus the markup its override paths are keyed against. */
export async function loadDesignPages(
  supabase: SupabaseClient,
  siteId: string,
): Promise<DesignPages | { error: string; status: number }> {
  const [{ data: site, error: sErr }, { data: instances, error: iErr }] = await Promise.all([
    supabase.from("sites").select("is_claude_design, enterprise_id, is_template").eq("id", siteId).single(),
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
  return {
    pages,
    enterpriseId: (site as { enterprise_id?: number | null }).enterprise_id ?? null,
    isTemplate: (site as { is_template?: boolean | null }).is_template === true,
  };
}

/** The company's trades, as written on its record. */
export async function companyTags(supabase: SupabaseClient, enterpriseId: number): Promise<string[]> {
  const { data } = await supabase.from("entreprises").select("service_tags").eq("id", enterpriseId).maybeSingle();
  const raw = (data as { service_tags?: unknown } | null)?.service_tags;
  return Array.isArray(raw) ? raw.filter((t): t is string => typeof t === "string" && t.trim() !== "") : [];
}

/** Every library image carrying one of `tags`, plus the universal ones. */
export async function loadLibrary(
  supabase: SupabaseClient,
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

export interface ZoneTarget {
  zoneId: string;
  pages: Array<{ slug: string; page: DesignPage; slots: AutoImageSlot[] }>;
  slotCount: number;
  alts: string[];
}

/** Where a zone lives across the design. The slot COUNT is the zone's own (six
 *  réalisations), identical on every page — a page that ships fewer is filled up
 *  to its own count, never padded. */
export function zoneTargets(pages: DesignPage[], zoneIds: string[]): ZoneTarget[] {
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

export interface PlacedSlot {
  order: number;
  url: string;
  alt: string;
  tag: string | null;
  /** The card is hidden: the library had no photo left for it that the band was
   *  not already showing. See `gapEntry`. */
  hidden: boolean;
}

/**
 * A card the draw hid because filling it would have meant showing a photo
 * twice — the operator asked for a band of five over a band of six with a twin
 * in it. `remove` hides the element and lets the grid reflow, so no empty frame
 * is left behind (see apply-overrides-html.ts).
 *
 * The marker matters both ways: the next draw CLEARS the gaps it made (import
 * three photos and the sixth card comes back on its own), and it leaves a card
 * the operator deleted by hand exactly where it is.
 */
export const GAP_MARK = "auto-images-gap";
const gapEntry = () => ({ kind: "remove", value: "", meta: { auto: GAP_MARK } });

export function isAutoGap(entry: unknown): boolean {
  const e = entry as { kind?: string; meta?: { auto?: string } } | null;
  return !!e && e.kind === "remove" && e.meta?.auto === GAP_MARK;
}

/** Hides the slot's card, or reopens it — a draw owns the gaps it made and
 *  nothing else. Returns nothing; mutates the page's override map. */
export function setGap(overrides: Record<string, unknown>, cardPath: string, hidden: boolean): void {
  const key = `${cardPath}:remove`;
  if (hidden) overrides[key] = gapEntry();
  else if (isAutoGap(overrides[key])) delete overrides[key];
}

/**
 * What the band currently SHOWS for this company: each slot's stored set,
 * resolved the way the renderer resolves it. Read from the first page that
 * carries the zone — every page holds the same draw.
 *
 * Without this the panel could only display a draw it had just made, so
 * reopening the editor left the per-photo swap button with nothing to act on.
 */
export function placedSlots(target: ZoneTarget, tags: string[]): PlacedSlot[] {
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
        hidden: isAutoGap(page.overrides[`${slot.cardPath}:remove`]),
      });
    }
    if (placed.length > 0) return placed.sort((a, b) => a.order - b.order);
  }
  return [];
}
