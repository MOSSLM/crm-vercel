import type { SectionBlockInstance, SiteMenus, SitemapPage } from "@/types";

/**
 * Computes the content overrides to merge into a section's content based on
 * the global site menus. Used by both the in-editor renderer
 * (DynamicSectionRenderer) and the deployed-site renderer
 * (DynamicPageRenderer) so navbar/footer links stay in sync with the menus
 * panel without per-section editing.
 */
export function deriveMenuOverrides(
  category: string | null | undefined,
  menus: SiteMenus | undefined | null,
): Record<string, unknown> {
  if (!menus || !category) return {};
  if (category === "navbar" || category === "navigation") {
    return {
      links: menus.nav.map((item) => ({ label: item.label, href: item.url, external: item.external })),
    };
  }
  if (category === "footers" || category === "footer") {
    return {
      footerLinks: menus.footer.map((item) => ({ label: item.label, href: item.url })),
      legalLinks: menus.footerLegal.map((item) => ({ label: item.label, href: item.url })),
    };
  }
  return {};
}

/** Categories that should trigger the navbar position wrapper + headroom. */
export const NAVBAR_CATEGORIES = new Set(["navbar", "navigation"]);

/** Categories that should auto-fill testimonial / social-proof data. */
export const TESTIMONIAL_CATEGORIES = new Set(["testimonials", "social-proof", "Social Proof"]);

/** Categories that should auto-fill key-figures / stats. */
export const STATS_CATEGORIES = new Set([
  "stats",
  "Stats",
  "chiffres-cles",
  "Chiffres clés",
  "key-figures",
]);

export interface StatItem {
  label: string;
  value: string;
  display_order?: number;
}

/** Parse the JSON-stringified service_tags array from the variables map. */
function parseEnterpriseTags(variables: Record<string, string> | undefined): Set<string> {
  const raw = variables?.__service_tags;
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((t): t is string => typeof t === "string"));
    }
  } catch {
    /* ignore */
  }
  return new Set();
}

/** The active enterprise's service tags as an ordered array. */
export function parseServiceTags(variables: Record<string, string> | undefined): string[] {
  return Array.from(parseEnterpriseTags(variables));
}

/**
 * Filter section blocks by enterprise service tags. Blocks without a
 * `service_tag` are always kept; blocks with a tag are dropped when the tag
 * is not present in the enterprise's service_tags. Used by both the
 * in-editor and deployed-site renderers so each enterprise sees only the
 * blocks (tabs / cards / items) matching its services.
 */
export function filterBlocksByEnterpriseTags(
  blocks: SectionBlockInstance[] | undefined | null,
  variables: Record<string, string> | undefined,
): SectionBlockInstance[] {
  if (!Array.isArray(blocks) || blocks.length === 0) return [];
  const tagSet = parseEnterpriseTags(variables);
  return blocks.filter((b) => {
    const tag = b.service_tag;
    if (!tag) return true;
    return tagSet.has(tag);
  });
}

/**
 * Whether a section instance is visible for the enterprise's service tags.
 * A section is hidden when its `content.__service_tag` meta key is set and
 * the enterprise doesn't have that tag. Sections without the key always show.
 */
export function isInstanceVisibleForTags(
  content: Record<string, unknown> | null | undefined,
  variables: Record<string, string> | undefined,
): boolean {
  const tag = content?.["__service_tag"];
  if (typeof tag !== "string" || tag === "") return true;
  return parseEnterpriseTags(variables).has(tag);
}

/**
 * Filter sitemap pages by enterprise service tags. Pages without a
 * `service_tag` are always kept; pages with a tag are dropped when the tag
 * is not present in the enterprise's service_tags. Used by the public site
 * routing to 404 service-specific pages that don't apply to the enterprise.
 */
export function filterSitemapByEnterpriseTags(
  sitemap: SitemapPage[] | undefined | null,
  enterpriseTags: string[] | undefined | null,
): SitemapPage[] {
  if (!Array.isArray(sitemap)) return [];
  const tagSet = new Set(enterpriseTags ?? []);
  return sitemap.filter((p) => {
    if (!p.service_tag) return true;
    return tagSet.has(p.service_tag);
  });
}

/** Returns the enterprise stats array (already resolved by the variable resolver). */
export function buildStatsForEnterprise(
  variables: Record<string, string> | undefined,
): StatItem[] | null {
  if (!variables) return null;
  const raw = variables.__stats;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed
      .filter((s): s is StatItem => s && typeof s.label === "string" && typeof s.value === "string")
      .sort((a, b) => (a.display_order ?? 100) - (b.display_order ?? 100));
  } catch { return null; }
}
