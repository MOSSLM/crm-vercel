/**
 * Per-company conditioning of the "devis" / lead form's service picker in raw
 * Claude Design markup.
 *
 * Claude Design's multi-step quote forms let the visitor pick one or more
 * services from a grid of tiles, each authored as
 * `<button data-svc="climatisation">…</button>`. Like the "Nos services" grid
 * (`filterServiceLinks`) and the tagged hero/testimonial regions
 * (`stripTaggedRegions`), those tiles must adapt to the linked company: only the
 * services the company actually offers should be selectable. This removes every
 * tile whose `data-svc` slug isn't in the enterprise's `service_tags`.
 *
 * Vocabulary bridge: form slugs are hyphenated ASCII ("pompe-a-chaleur",
 * "bornes-irve", "photovoltaique") while `service_tags` are human French
 * ("Pompe à chaleur", "Photovoltaïque"). Both sides go through `slugifyServiceTag`
 * (strip accents + lowercase, then collapse every non-alphanumeric run to a
 * single hyphen) so they compare on equal footing.
 *
 * Two guard rails:
 *   - No tags at all (empty `enterpriseTags`, e.g. the author/template preview)
 *     → the form is returned untouched, so every service still shows.
 *   - A tile group whose company matches NONE of its tiles is kept whole rather
 *     than emptied — a lead form with zero selectable services is broken UX, so
 *     "show all" beats "show none".
 *
 * DOM-path stability: like the sibling conditioners, run this AFTER
 * `applyOverridesToHTML` (removing tiles shifts positional child indices that
 * inline-edit overrides are keyed to). Pure + side-effect free.
 */
import { parse, type HTMLElement } from "node-html-parser";
import { formatServiceTag } from "@/utils/serviceTags";

/** Canonical, comparable slug shared by form `data-svc` values and service tags. */
export function slugifyServiceTag(value: string): string {
  return formatServiceTag(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Removes lead-form service tiles (`[data-svc]`) the enterprise doesn't offer.
 * `enterpriseTags` is the company's `service_tags` set. Returns the html
 * unchanged when there are no tiles or the company has no tags.
 */
export function filterServiceForm(html: string, enterpriseTags: string[]): string {
  if (!html || !html.includes("data-svc")) return html;
  const have = new Set((enterpriseTags ?? []).map(slugifyServiceTag).filter(Boolean));
  if (have.size === 0) return html; // author/template preview → keep every service

  const root = parse(html);
  const tiles = root.querySelectorAll("[data-svc]");
  if (tiles.length === 0) return html;

  // Group tiles by their immediate parent (the picker grid). We decide per group
  // so one grid never empties another, and so the "keep all if none match"
  // safety net is scoped to a single picker.
  const byParent = new Map<HTMLElement, HTMLElement[]>();
  for (const tile of tiles) {
    const parent = tile.parentNode as HTMLElement | null;
    if (!parent) continue;
    const group = byParent.get(parent);
    if (group) group.push(tile);
    else byParent.set(parent, [tile]);
  }

  for (const group of byParent.values()) {
    const keep = group.filter((t) => have.has(slugifyServiceTag(t.getAttribute("data-svc") ?? "")));
    // Company offers none of this picker's services → keep them all rather than
    // ship an empty, unusable service picker.
    if (keep.length === 0) continue;
    for (const tile of group) {
      if (!keep.includes(tile)) tile.remove();
    }
  }

  return root.toString();
}
