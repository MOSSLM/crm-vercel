/**
 * Collects the image placeholders of a Claude Design page — the `.ph` slots the
 * design ships where a real image is expected but none is set yet (they render
 * as a framed box with a `.ph-label` describing the wanted photo, e.g.
 * `<div class="ph ph--azur hero-photo"><span class="ph-label">Photo — borne de
 * recharge murale dans un garage</span></div>`).
 *
 * The editor uses this to export the list of missing images (as TXT / CSV /
 * JSON) so the descriptions can be pasted into an image generator. A slot that
 * the user has already filled (an `image`/`bg_image` override, or the design's
 * own `has-img` marker) or removed (a `remove` override) is skipped — the export
 * is only the images that still need creating.
 *
 * Path computation mirrors the preview runtime's `pathOf`/`nodeAt` (element-only
 * child indices from `#cd-root`) so a placeholder here maps to the same override
 * key the inline editor writes. Pure + side-effect free; runs client-side (the
 * download button) and under jsdom (tests).
 */
import { parse, type HTMLElement } from "node-html-parser";
import type { OverrideEntry } from "@/components/site-builder/claude-design/InlinePreview";

export interface ImagePlaceholder {
  /** 1-based position within its page (in document order). */
  index: number;
  /** The `.ph-label` text — the human description of the wanted photo. */
  label: string;
  /** Best-effort location hint (e.g. "hero-photo", "pro-cardx-media"), from the
   *  placeholder's own meaningful classes or, failing that, its parent's. */
  zone: string;
  /** Dotted element-child path from the page root (matches override keys). */
  path: string;
}

export interface PageImagePlaceholders {
  slug: string;
  title: string;
  placeholders: ImagePlaceholder[];
}

const ELEMENT_NODE = 1;

/** Classes that carry no location meaning (theme/state), stripped from the zone
 *  hint: `ph`, `ph--azur`/`ph--*`, the filled marker, and `is-*` state flags. */
function meaningfulClasses(el: HTMLElement): string[] {
  const raw = el.getAttribute("class") ?? "";
  return raw
    .split(/\s+/)
    .filter(Boolean)
    .filter((c) => c !== "ph" && c !== "has-img" && !c.startsWith("ph--") && !c.startsWith("is-"));
}

function elementChildren(node: HTMLElement): HTMLElement[] {
  return node.childNodes.filter((c) => c.nodeType === ELEMENT_NODE) as HTMLElement[];
}

/** Element-child index path from `root` to `el` (same shape as the runtime). */
function pathOf(el: HTMLElement, root: HTMLElement): number[] {
  const path: number[] = [];
  let cur: HTMLElement | null = el;
  while (cur && cur !== root) {
    const parent = cur.parentNode as HTMLElement | null;
    if (!parent) break;
    path.unshift(elementChildren(parent).indexOf(cur));
    cur = parent;
  }
  return path;
}

function collapse(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** True when an override already gives this slot an image (single or a set), or
 *  removes it. */
function isResolved(pathStr: string, overrides: Record<string, OverrideEntry>): boolean {
  const bg = overrides[`${pathStr}:bg_image`];
  const img = overrides[`${pathStr}:image`];
  const set = overrides[`${pathStr}:image_set`];
  const removed = overrides[`${pathStr}:remove`];
  return !!removed || !!bg?.value || !!img?.value || !!set?.value;
}

/**
 * Returns the still-empty image placeholders of one page, in document order.
 * `overrides` are the page's inline-edit overrides (default `{}`); slots already
 * filled or removed there are omitted.
 */
export function collectImagePlaceholders(
  html: string,
  overrides: Record<string, OverrideEntry> = {},
): ImagePlaceholder[] {
  if (!html) return [];
  const root = parse(html);
  const out: ImagePlaceholder[] = [];
  let index = 0;
  for (const ph of root.querySelectorAll(".ph")) {
    // The design marks a filled slot with `has-img` (see InlinePreview CD_HELPERS).
    if ((ph.getAttribute("class") ?? "").split(/\s+/).includes("has-img")) continue;

    const path = pathOf(ph, root as unknown as HTMLElement);
    const pathStr = path.join(".");
    if (isResolved(pathStr, overrides)) continue;

    const labelEl = ph.querySelector(".ph-label");
    const label = collapse(labelEl ? labelEl.text : ph.text);

    const own = meaningfulClasses(ph);
    const parent = ph.parentNode as HTMLElement | null;
    const zoneParts = own.length > 0 ? own : parent && parent.nodeType === ELEMENT_NODE ? meaningfulClasses(parent) : [];

    out.push({ index: ++index, label, zone: zoneParts.join(" "), path: pathStr });
  }
  return out;
}

/* ── export formatters ─────────────────────────────────────────────────── */

export interface DesignExportPage {
  slug: string;
  title: string;
  html: string;
  overrides?: Record<string, OverrideEntry>;
}

/** Collects the missing placeholders across every page of a design. */
export function collectDesignPlaceholders(pages: DesignExportPage[]): PageImagePlaceholders[] {
  return pages
    .map((p) => ({
      slug: p.slug,
      title: p.title,
      placeholders: collectImagePlaceholders(p.html, p.overrides ?? {}),
    }))
    .filter((p) => p.placeholders.length > 0);
}

export function countPlaceholders(pages: PageImagePlaceholders[]): number {
  return pages.reduce((n, p) => n + p.placeholders.length, 0);
}

function csvCell(s: string): string {
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Flat CSV: one row per missing image, columns page / title / index / zone / description. */
export function toCsv(pages: PageImagePlaceholders[]): string {
  const rows = [["page", "titre_page", "numero", "zone", "description"].join(",")];
  for (const page of pages) {
    for (const ph of page.placeholders) {
      rows.push([page.slug, page.title, String(ph.index), ph.zone, ph.label].map(csvCell).join(","));
    }
  }
  return rows.join("\r\n");
}

/** Structured JSON for tooling / batch prompting. */
export function toJson(designName: string, pages: PageImagePlaceholders[]): string {
  return JSON.stringify(
    {
      design: designName,
      generatedAt: new Date().toISOString(),
      totalMissing: countPlaceholders(pages),
      pages,
    },
    null,
    2,
  );
}

/** Human-readable list, grouped by page — the description-per-line format. */
export function toText(designName: string, pages: PageImagePlaceholders[]): string {
  const total = countPlaceholders(pages);
  const lines: string[] = [
    `Design : ${designName}`,
    `Images à créer : ${total}`,
    `Généré le : ${new Date().toLocaleString("fr-FR")}`,
    "",
  ];
  for (const page of pages) {
    lines.push(`═══ ${page.title || page.slug}  (${page.slug}) ═══`);
    for (const ph of page.placeholders) {
      const zone = ph.zone ? `[${ph.zone}] ` : "";
      lines.push(`${ph.index}. ${zone}${ph.label || "(sans description)"}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}
