/**
 * The image slots a Claude Design fills AUTOMATICALLY from the media library,
 * rather than one photo at a time in the editor.
 *
 * Almost every image of the export is either page-specific (a service page's
 * hero) or lives in a section whose CONTENT already adapts to the company's
 * service tags — both are wrong to auto-fill: the number of photos itself
 * varies. The "réalisations" band is the exception, and the reason this module
 * exists: it ships a FIXED number of slots (6) on every page of every skin, the
 * same six on the home page ("Nos réalisations / Nos derniers chantiers") and
 * on each service page ("Exemples de chantiers / Nos réalisations près de chez
 * vous"), and only WHICH photos belong there depends on the company's trades.
 *
 * A zone is matched on the export's own stable `id` attributes
 * (`id="realisation-1"` … `realisation-6`) rather than on section headings or
 * positions: the six skins style that band completely differently (masonry,
 * horizontal scroll…) but all carry those ids, and an id survives a restyle in
 * a way a class or a DOM path does not.
 *
 * Pure + side-effect free (node-html-parser only) so the API route, the panel
 * and the tests all see the same slots.
 */
import { parse, type HTMLElement } from "node-html-parser";
import { elementChildren } from "./dom-paths";

export interface AutoImageZone {
  /** Stable key, stored in nothing — used in the API payload and the UI. */
  id: string;
  label: string;
  /** What the operator sees on the page, to recognise the band. */
  hint: string;
  /** Matches the `id` of an `<img>` that belongs to this zone. */
  idPattern: RegExp;
  /** How the slots are ordered — the captured group is the slot number. */
  order: (elementId: string) => number;
}

export const AUTO_IMAGE_ZONES: readonly AutoImageZone[] = [
  {
    id: "realisations",
    label: "Réalisations",
    hint: "« Nos derniers chantiers » (accueil) et « Nos réalisations près de chez vous » (pages service)",
    idPattern: /^realisation-(\d+)$/,
    order: (elementId) => Number(/^realisation-(\d+)$/.exec(elementId)?.[1] ?? 0),
  },
];

export function findZone(zoneId: string): AutoImageZone | null {
  return AUTO_IMAGE_ZONES.find((z) => z.id === zoneId) ?? null;
}

export interface AutoImageSlot {
  /** Dotted override path, e.g. "6.0.1.3.0" — the key `<path>:image_set` uses. */
  path: string;
  /** The `id` of the matched element, kept for the report. */
  elementId: string;
  /** Slot rank inside the zone (1-based, from the id suffix). */
  order: number;
  /** True when the slot is an `<img>` — decides `image` vs `bg_image` if a
   *  caller ever writes a single image here instead of a set. */
  isImg: boolean;
  /** The export's own alt text, reused when a drawn image carries none. */
  alt: string;
}

/**
 * The slots of one zone in a page's markup, ordered by their id suffix.
 *
 * Paths are counted the way an override key counts them on this markup:
 * `stampDomPaths`' "fragment" mode — indices start at the TOP-LEVEL elements of
 * the stored `__token_html` (the head `<style>` blocks the importer prepends
 * included), because that markup is injected whole into the section's wrapper
 * div. Anchoring on the first element instead would shift every path by one
 * level and address the wrong nodes.
 *
 * Returns `[]` when the page has no such band — most of the design, and the
 * caller's signal to skip the page rather than guess.
 */
export function findZoneSlots(html: string, zone: AutoImageZone): AutoImageSlot[] {
  if (!html) return [];
  let doc: HTMLElement;
  try {
    doc = parse(html) as unknown as HTMLElement;
  } catch {
    return [];
  }

  const slots: AutoImageSlot[] = [];
  const walk = (el: HTMLElement, path: number[]): void => {
    const elementId = el.getAttribute("id") ?? "";
    if (elementId && zone.idPattern.test(elementId)) {
      slots.push({
        path: path.join("."),
        elementId,
        order: zone.order(elementId),
        isImg: (el.tagName ?? "").toLowerCase() === "img",
        alt: el.getAttribute("alt") ?? "",
      });
    }
    const kids = elementChildren(el);
    for (let i = 0; i < kids.length; i++) walk(kids[i], [...path, i]);
  };
  const top = elementChildren(doc);
  for (let i = 0; i < top.length; i++) walk(top[i], [i]);

  slots.sort((a, b) => a.order - b.order || a.path.localeCompare(b.path));
  return slots;
}

/** Every zone present in a page, with its slots. Zones with no slot are left out. */
export function findAllZoneSlots(html: string): Array<{ zone: AutoImageZone; slots: AutoImageSlot[] }> {
  const out: Array<{ zone: AutoImageZone; slots: AutoImageSlot[] }> = [];
  for (const zone of AUTO_IMAGE_ZONES) {
    const slots = findZoneSlots(html, zone);
    if (slots.length > 0) out.push({ zone, slots });
  }
  return out;
}
