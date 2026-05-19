import type { SiteMenus } from "@/types";

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

/** Categories whose sections iterate over the active enterprise's services. */
export const SERVICES_CATEGORIES = new Set([
  "services",
  "Services",
  "services-tabs",
  "service-pages",
]);

export interface ServiceItem {
  tag: string;
  slug: string;
  label: string;
  icon?: string;
  display_order?: number;
  headline?: string;
  subheadline?: string;
  description?: string;
  trust_title?: string;
  image_url?: string;
  cta_label?: string;
  cta_href?: string;
  is_active?: boolean;
}

export interface StatItem {
  label: string;
  value: string;
  display_order?: number;
}

interface ServiceTagDefaultRow {
  service_tag: string;
  slug: string;
  display_label: string | null;
  icon: string | null;
  display_order: number | null;
  headline_template: string | null;
  subheadline_template: string | null;
  description_template: string | null;
  trust_title_template: string | null;
  image_url: string | null;
  cta_label: string | null;
  cta_href: string | null;
}

/** Substitute {{var.path}} tokens with values from the variables map. */
function substitute(template: string | null | undefined, variables: Record<string, string> | undefined): string | undefined {
  if (!template) return template ?? undefined;
  if (!variables) return template;
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, key) => {
    const v = variables[key as string];
    return v !== undefined && v !== null ? String(v) : "";
  });
}

/**
 * Build the merged list of services for the active enterprise:
 *   - Filtered to tags the enterprise actually has (__service_tags)
 *   - Each entry is global defaults (__service_tag_defaults) overlaid with
 *     per-site overrides (__service_overrides[slug])
 *   - Templates are substituted using the variables map ({{entreprise.nom}}…)
 *   - Items explicitly marked `is_active: false` are dropped
 * Returns null when no tags are configured (renderer can then fall back).
 */
export function buildServicesForEnterprise(
  variables: Record<string, string> | undefined,
): ServiceItem[] | null {
  if (!variables) return null;
  const tagsRaw = variables.__service_tags;
  if (!tagsRaw) return null;
  let tags: string[] = [];
  try {
    const parsed = JSON.parse(tagsRaw);
    if (Array.isArray(parsed)) tags = parsed.filter((t) => typeof t === "string");
  } catch { return null; }
  if (tags.length === 0) return [];

  let defaults: Record<string, ServiceTagDefaultRow> = {};
  try {
    const parsed = JSON.parse(variables.__service_tag_defaults ?? "{}");
    if (parsed && typeof parsed === "object") defaults = parsed as Record<string, ServiceTagDefaultRow>;
  } catch { /* keep empty */ }

  let overrides: Record<string, Record<string, unknown>> = {};
  try {
    const parsed = JSON.parse(variables.__service_overrides ?? "{}");
    if (parsed && typeof parsed === "object") overrides = parsed as Record<string, Record<string, unknown>>;
  } catch { /* keep empty */ }

  const items: ServiceItem[] = [];
  for (const tag of tags) {
    const def = defaults[tag] ?? null;
    const slug = def?.slug ?? tag.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const ovr = overrides[slug] ?? {};
    if (ovr.is_active === false) continue;

    const merged: ServiceItem = {
      tag,
      slug,
      label: (ovr.label as string) ?? def?.display_label ?? tag,
      icon: (ovr.icon as string) ?? def?.icon ?? undefined,
      display_order: (ovr.display_order as number) ?? def?.display_order ?? 100,
      headline: substitute((ovr.headline_template as string) ?? def?.headline_template, variables),
      subheadline: substitute((ovr.subheadline_template as string) ?? def?.subheadline_template, variables),
      description: substitute((ovr.description_template as string) ?? def?.description_template, variables),
      trust_title: substitute((ovr.trust_title_template as string) ?? def?.trust_title_template, variables),
      image_url: (ovr.image_url as string) ?? def?.image_url ?? undefined,
      cta_label: (ovr.cta_label as string) ?? def?.cta_label ?? undefined,
      cta_href: (ovr.cta_href as string) ?? def?.cta_href ?? undefined,
      is_active: true,
    };
    items.push(merged);
  }
  items.sort((a, b) => (a.display_order ?? 100) - (b.display_order ?? 100));
  return items;
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
