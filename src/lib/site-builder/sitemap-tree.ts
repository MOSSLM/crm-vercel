import type { SitemapPage, SiteSectionInstance } from "@/types";

/**
 * Sitemap path / hierarchy utilities.
 *
 * A page's `slug` IS its URL path and its place in the hierarchy:
 * `/services/climatisation` is a child of `/services`. Nesting is derived
 * entirely from slug segments — there is no separate parent field.
 */

/** Normalize a user-typed slug into a valid path: leading slash, lowercase,
 *  slugified segments, no trailing slash, no empty/duplicate separators. */
export function normalizePageSlug(input: string): string {
  const raw = (input ?? "").trim();
  if (!raw || raw === "/") return "/";
  const segments = raw
    .split("/")
    .map((seg) =>
      seg
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, ""),
    )
    .filter(Boolean);
  if (segments.length === 0) return "/";
  return "/" + segments.join("/");
}

/** The slug of the nearest ancestor page that actually exists, or null when
 *  the page is top-level (its parent is the site root node). */
export function getParentSlug(slug: string, existingSlugs: Set<string>): string | null {
  if (!slug || slug === "/") return null;
  const parts = slug.split("/").filter(Boolean);
  for (let i = parts.length - 1; i >= 1; i--) {
    const candidate = "/" + parts.slice(0, i).join("/");
    if (existingSlugs.has(candidate)) return candidate;
  }
  return null;
}

/** Whether `descendant` lives under `ancestor` in the path hierarchy. */
export function isDescendantSlug(descendant: string, ancestor: string): boolean {
  if (ancestor === "/" || descendant === ancestor) return false;
  return descendant.startsWith(ancestor + "/");
}

export interface SitemapTreeNode {
  page: SitemapPage;
  depth: number;
  children: SitemapTreeNode[];
}

/** Build the page hierarchy from slugs, preserving sitemap order at each level. */
export function buildSitemapTree(pages: SitemapPage[]): SitemapTreeNode[] {
  const slugSet = new Set(pages.map((p) => p.slug));
  const nodes = new Map<string, SitemapTreeNode>();
  for (const page of pages) nodes.set(page.slug, { page, depth: 0, children: [] });

  const roots: SitemapTreeNode[] = [];
  for (const page of pages) {
    const node = nodes.get(page.slug)!;
    const parentSlug = getParentSlug(page.slug, slugSet);
    const parent = parentSlug ? nodes.get(parentSlug) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const assignDepth = (node: SitemapTreeNode, depth: number) => {
    node.depth = depth;
    for (const child of node.children) assignDepth(child, depth + 1);
  };
  for (const root of roots) assignDepth(root, 0);
  return roots;
}

/** Slugs of pages that hold at least one (non-hidden) section instance.
 *  A page with no sections is treated as a category, not a real page. */
export function pagesWithContent(
  instances: SiteSectionInstance[] | Array<{ page_slug: string; is_hidden?: boolean }>,
): Set<string> {
  const set = new Set<string>();
  for (const inst of instances) {
    if (inst.is_hidden) continue;
    set.add(inst.page_slug);
  }
  return set;
}

/** Whether a single page slug has renderable content. */
export function pageHasContent(
  slug: string,
  instances: Array<{ page_slug: string; is_hidden?: boolean }>,
): boolean {
  return instances.some((i) => i.page_slug === slug && !i.is_hidden);
}
