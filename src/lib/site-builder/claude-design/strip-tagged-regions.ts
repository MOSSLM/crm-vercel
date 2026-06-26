/**
 * Section-level service-tag conditioning for raw Claude Design HTML.
 *
 * A region marked `data-service-tag="climatisation"` is only kept when the
 * enterprise's `service_tags` include that tag. This adapts the managed
 * `filterBlocksByEnterpriseTags` idea to faithful raw markup: we strip the DOM
 * subtree at render time, per company.
 *
 * A region may carry several tags, comma/space separated
 * (`data-service-tag="clim chauffage"`): it is kept if ANY of them match.
 *
 * IMPORTANT (DOM-path stability): run this AFTER `applyOverridesToHTML`, since
 * inline-edit overrides are keyed to positional child indices and stripping a
 * region shifts them. Pure + side-effect free.
 */
import { parse, type HTMLElement } from "node-html-parser";

function tagsOf(el: HTMLElement): string[] {
  const raw = el.getAttribute("data-service-tag") ?? "";
  return raw
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Removes every `[data-service-tag]` element whose tag(s) are not in the
 * enterprise's set. If `enterpriseTags` is empty, all tagged regions are
 * removed (a company with no services sees only untagged content). Untagged
 * markup is always kept.
 */
export function stripTaggedRegions(html: string, enterpriseTags: string[]): string {
  if (!html.includes("data-service-tag")) return html;
  const set = new Set((enterpriseTags ?? []).map((t) => t.trim()).filter(Boolean));

  const root = parse(html);
  const tagged = root.querySelectorAll("[data-service-tag]");
  for (const el of tagged) {
    const tags = tagsOf(el);
    const keep = tags.length === 0 || tags.some((t) => set.has(t));
    if (!keep) el.remove();
  }
  return root.toString();
}
