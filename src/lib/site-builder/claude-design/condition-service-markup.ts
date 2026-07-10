/**
 * Applies BOTH per-company service conditioners to raw Claude Design markup, in
 * the one correct order. Use this instead of calling the two functions
 * separately — the order is subtle and getting it wrong silently breaks the
 * "Nos services" section (see below).
 *
 * The two conditioners:
 *   1. `filterServiceLinks` — removes a service-page link AND its smallest
 *      single-service wrapper: a whole "En savoir plus" expertise card, a footer
 *      `<li>`, a header sub-menu entry. Keyed off the link's href → sitemap
 *      `service_tag`, so it fires on every service card whether or not the
 *      author added a `data-service-tag`.
 *   2. `stripTaggedRegions` — removes remaining `[data-service-tag]` regions
 *      that carry no service link (a hero badge, a testimonials block…).
 *
 * WHY ORDER MATTERS: designs routinely put `data-service-tag` on the card's
 * inner `<a>` itself (that is what Claude Design's own export does). If
 * `stripTaggedRegions` ran first it would delete just that `<a>` — orphaning the
 * card (title + text, no link) AND removing the very link `filterServiceLinks`
 * walks up from, so the whole card would survive. That is exactly the bug where
 * the header nav filters correctly but the "Nos services" grid below does not.
 * Running `filterServiceLinks` first removes the whole card; `stripTaggedRegions`
 * then only mops up link-less tagged regions.
 *
 * Both must run AFTER `applyOverridesToHTML` (removals shift the positional
 * child indices inline-edit overrides are keyed to). Pure + side-effect free.
 */
import { filterServiceLinks } from "./filter-service-links";
import { stripTaggedRegions } from "./strip-tagged-regions";

export function conditionServiceMarkup(
  html: string,
  serviceTagBySlug: Record<string, string> | null | undefined,
  enterpriseTags: string[],
): string {
  let out = html;
  // (1) Link-driven removal first — takes out whole cards / menu entries.
  if (serviceTagBySlug && Object.keys(serviceTagBySlug).length > 0) {
    out = filterServiceLinks(out, serviceTagBySlug, enterpriseTags);
  }
  // (2) Then explicit `data-service-tag` regions that survived.
  if (out.includes("data-service-tag")) {
    out = stripTaggedRegions(out, enterpriseTags);
  }
  return out;
}
