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
  if (category === "navigation") {
    return {
      links: menus.nav.map((item) => ({ label: item.label, href: item.url, external: item.external })),
    };
  }
  if (category === "footer") {
    return {
      footerLinks: menus.footer.map((item) => ({ label: item.label, href: item.url })),
      legalLinks: menus.footerLegal.map((item) => ({ label: item.label, href: item.url })),
    };
  }
  return {};
}
