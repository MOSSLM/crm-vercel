import React from "react";
import type { Viewport } from "next";
import { notFound } from "next/navigation";
import { resolveDraftSite } from "@/lib/site-resolver";
import { DynamicPageRenderer } from "@/components/site-builder/DynamicPageRenderer";
import { parseEnterpriseTags } from "@/components/site-builder/SitePageView";
import { buildPublicMenus } from "@/lib/site-builder/menu-overrides";
import { serviceTagMapFromSitemap } from "@/lib/site-builder/claude-design/filter-service-links";

interface PreviewProps {
  params: Promise<{ siteId: string; path?: string[] }>;
}

/** Join the optional catch-all segments into a sitemap slug. */
function slugFromPath(path: string[] | undefined): string {
  const segments = (path ?? []).filter(Boolean);
  return segments.length > 0 ? "/" + segments.join("/") : "/";
}

// Re-emit the viewport meta (stripped on import) so mobile @media fires, and
// never cache: the preview reflects the LIVE draft the operator is editing.
export const viewport: Viewport = { width: "device-width", initialScale: 1 };
export const dynamic = "force-dynamic";

/**
 * Live draft preview of a site by id, OUTSIDE the editor iframe. Renders the
 * current (unpublished, incl. template) design with sample company data via the
 * exact public render pipeline (DynamicPageRenderer), so animations, the design's
 * own JS and responsive breakpoints are exercised for real. The unguessable
 * site UUID is the capability token; it only ever shows sample data.
 */
export default async function DraftPreviewPage({ params }: PreviewProps) {
  const { siteId, path } = await params;
  const site = await resolveDraftSite(siteId);
  if (!site) notFound();

  const {
    enterpriseVariables,
    reviews,
    publishedInstances,
    publishedStyleGuide,
    styleGuide,
    menus,
    publishedSitemap,
    claudeDesign,
  } = site;

  if (!publishedInstances || publishedInstances.length === 0) notFound();

  const instances = publishedInstances as Array<{ page_slug: string; is_hidden?: boolean }>;
  const enterpriseTags = parseEnterpriseTags(enterpriseVariables);
  const pageSlug = slugFromPath(path);
  const isHome = pageSlug === "/";
  const targetPage = publishedSitemap?.find((p) => p.slug === pageSlug);

  // Same gating as the public SitePageView: page must exist, not be gated by a
  // missing service tag, and have at least one visible section.
  if (!isHome && !targetPage) notFound();
  if (targetPage?.service_tag && !enterpriseTags.includes(targetPage.service_tag)) notFound();
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
      serviceTagBySlug={claudeDesign ? serviceTagMapFromSitemap(publishedSitemap) : undefined}
    />
  );
}
