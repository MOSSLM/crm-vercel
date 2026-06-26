import React from "react";
import { notFound } from "next/navigation";
import { resolveSite } from "@/lib/site-resolver";
import { buildPublicMenus } from "@/lib/site-builder/menu-overrides";
import { DynamicPageRenderer } from "./DynamicPageRenderer";

/** Parse the enterprise service tags from the resolved variables map. */
export function parseEnterpriseTags(variables: Record<string, string>): string[] {
  try {
    const parsed = JSON.parse(variables["__service_tags"] ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}

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
  const isHome = pageSlug === "/";
  const targetPage = publishedSitemap?.find((p) => p.slug === pageSlug);

  // A non-home page must exist in the sitemap.
  if (!isHome && !targetPage) notFound();
  // A page tagged with a service the enterprise doesn't have is hidden.
  if (targetPage?.service_tag && !enterpriseTags.includes(targetPage.service_tag)) notFound();
  // A page with no sections is a category, not a real page.
  if (!instances.some((i) => i.page_slug === pageSlug && !i.is_hidden)) notFound();

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
    />
  );
}
