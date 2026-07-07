/**
 * Per-company element conditioning for raw Claude Design markup, driven by the
 * site's service pages — no `data-service-tag` authoring required.
 *
 * The sitemap already gives every service page a `service_tag` (from its file
 * name, e.g. `service-climatisation.html` → "climatisation"), and whole pages
 * are hidden for companies that lack the tag. This extends the same idea to
 * ELEMENTS: any link pointing to a service page the company doesn't have — a
 * header/footer menu entry, a "nos domaines d'expertise" card — is removed, so
 * the deployed (and previewed) site only shows the services the company offers.
 *
 * For each such link we remove the SMALLEST wrapper that contains only that one
 * service link:
 *   - a footer `<li><a href="/service-x">…</a></li>`  → the `<li>`
 *   - an expertise `<article class="svc-card">…<a href="/service-x">…</a></article>` → the `<article>`
 *   - a header sub-menu `<a href="/service-x">…</a>` (siblings share the menu) → just the `<a>`
 * The "smallest single-service wrapper" rule keeps a whole `<li class="has-sub">`
 * dropdown (which holds every service) from disappearing when one service is off.
 *
 * DOM-path stability: like stripTaggedRegions, run this AFTER applyOverridesToHTML
 * (removals shift positional child indices). Pure + side-effect free.
 */
import { parse, type HTMLElement } from "node-html-parser";
import type { SitemapPage } from "@/types";

/** slug → service_tag for every service page in the sitemap (tagged pages only). */
export function serviceTagMapFromSitemap(sitemap: SitemapPage[] | null | undefined): Record<string, string> {
  const map: Record<string, string> = {};
  for (const p of sitemap ?? []) {
    if (p?.slug && p.service_tag) map[p.slug] = p.service_tag;
  }
  return map;
}

/** Normalise a link href to a sitemap slug, or null if it's not an internal
 *  page link (external, mailto/tel, or a pure #anchor). */
function hrefToSlug(href: string): string | null {
  let h = (href ?? "").trim();
  if (!h) return null;
  if (/^(mailto:|tel:)/i.test(h)) return null;
  if (h.startsWith("#")) return null;
  if (/^https?:\/\//i.test(h)) {
    try { h = new URL(h).pathname; } catch { return null; }
  }
  h = h.split("#")[0].split("?")[0];
  if (!h) return null;
  h = h.replace(/\.html?$/i, "");
  if (!h.startsWith("/")) h = "/" + h;
  if (h.length > 1 && h.endsWith("/")) h = h.slice(0, -1);
  return h;
}

/**
 * Removes links (and their smallest single-service wrapper) that point to a
 * service page whose tag the enterprise does not have. `tagBySlug` maps a page
 * slug to its service tag; `enterpriseTags` is the company's tag set. When the
 * map is empty or nothing matches, the html is returned unchanged.
 */
export function filterServiceLinks(
  html: string,
  tagBySlug: Record<string, string>,
  enterpriseTags: string[],
): string {
  if (!html || !tagBySlug || Object.keys(tagBySlug).length === 0) return html;
  const have = new Set((enterpriseTags ?? []).map((t) => t.trim()).filter(Boolean));

  const root = parse(html);
  const slugOf = (a: HTMLElement) => hrefToSlug(a.getAttribute("href") ?? "");
  const isServiceLink = (a: HTMLElement) => {
    const s = slugOf(a);
    return s != null && tagBySlug[s] !== undefined;
  };
  const countServiceLinks = (el: HTMLElement) =>
    el.querySelectorAll("a").filter((a) => isServiceLink(a)).length;

  // Decide every removal on the pristine tree (removals are disjoint subtrees),
  // then remove — so counts aren't perturbed mid-pass.
  const targets: HTMLElement[] = [];
  for (const a of root.querySelectorAll("a")) {
    const slug = slugOf(a);
    if (slug == null) continue;
    const tag = tagBySlug[slug];
    if (tag === undefined) continue; // not a service-page link
    if (have.has(tag)) continue; // company offers this service → keep

    let target: HTMLElement = a;
    let parent = a.parentNode as HTMLElement | null;
    while (parent && parent !== root && parent.nodeType === 1 && countServiceLinks(parent) === 1) {
      target = parent;
      parent = parent.parentNode as HTMLElement | null;
    }
    targets.push(target);
  }
  for (const t of targets) t.remove();
  return root.toString();
}
