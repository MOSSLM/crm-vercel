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
