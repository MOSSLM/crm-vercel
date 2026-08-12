import React from "react";
import { notFound } from "next/navigation";
import { resolveSite } from "@/lib/site-resolver";
import { buildPublicMenus } from "@/lib/site-builder/menu-overrides";
import { serviceTagMapFromSitemap } from "@/lib/site-builder/claude-design/filter-service-links";
import { pageEstServie, parseEnterpriseTags } from "@/lib/site-builder/pages-servies";
import { DynamicPageRenderer } from "./DynamicPageRenderer";

// Réexporté : l'aperçu de brouillon l'importe depuis ici. La définition a
// déménagé dans `pages-servies.ts` avec les règles de visibilité qu'elle sert.
export { parseEnterpriseTags };

interface SitePageViewProps {
  subdomain: string;
  host: string;
  /** Resolved page path, e.g. "/" or "/services/climatisation". */
  pageSlug: string;
}

/**
 * Server component that renders one published site page. Shared by the
 * root route ("/") and the catch-all route ("/[...path]").
 *
 * A page 404s when it is missing from the sitemap, tagged with a service
 * the enterprise lacks, or empty (no sections — a category, not a page).
 */
export async function SitePageView({ subdomain, host, pageSlug }: SitePageViewProps) {
  const site = await resolveSite(subdomain, host);
  if (!site) notFound();

  const {
    enterpriseVariables,
    siteId,
    reviews,
    publishedInstances,
    publishedStyleGuide,
    styleGuide,
    menus,
    publishedSitemap,
    claudeDesign,
  } = site;

  // resolveSite() enforces a strict snapshot lock; reaching here without
  // published instances means there is nothing to render.
  if (!publishedInstances || publishedInstances.length === 0) notFound();

  const instances = publishedInstances as Array<{
    page_slug: string;
    is_hidden?: boolean;
  }>;
  const enterpriseTags = parseEnterpriseTags(enterpriseVariables);

  // Les trois conditions de 404 vivent dans `pages-servies.ts`, parce que le
  // sitemap.xml par tenant doit appliquer EXACTEMENT les mêmes : un sitemap bâti
  // sur `published_sitemap` seul listerait des URLs qui répondent 404.
  if (!pageEstServie(pageSlug, { sitemap: publishedSitemap, instances, enterpriseTags })) {
    notFound();
  }

  const visibleMenus = buildPublicMenus(menus, publishedSitemap, instances, enterpriseTags);

  return (
    <DynamicPageRenderer
      siteId={siteId}
      pageSlug={pageSlug}
      styleGuide={publishedStyleGuide ?? styleGuide}
      variables={enterpriseVariables}
      reviews={reviews}
      menus={visibleMenus}
      preloadedInstances={publishedInstances}
      claudeDesign={claudeDesign}
      serviceTagBySlug={claudeDesign ? serviceTagMapFromSitemap(publishedSitemap) : undefined}
    />
  );
}
