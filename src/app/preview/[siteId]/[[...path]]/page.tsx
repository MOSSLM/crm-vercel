import React from "react";
import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { resolveDraftSite } from "@/lib/site-resolver";
import { DynamicPageRenderer } from "@/components/site-builder/DynamicPageRenderer";
import { DemoPaywallBar } from "@/components/site-builder/DemoPaywallBar";
import { parseEnterpriseTags } from "@/components/site-builder/SitePageView";
import { buildPublicMenus } from "@/lib/site-builder/menu-overrides";
import { serviceTagMapFromSitemap } from "@/lib/site-builder/claude-design/filter-service-links";
import { resolvePreviewSlug } from "@/lib/site-builder/preview-slug";

/**
 * Every 404 below is otherwise indistinguishable from "wildcard domain not
 * wired up" once deployed. Log the reason so the platform logs answer the
 * question: a line here means the request DID reach the app.
 */
function preview404(siteId: string, reason: string): never {
  console.warn(`[preview] 404 for site ${siteId}: ${reason}`);
  notFound();
}

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

// The draft preview is reachable on an unguessable {siteId}.<domain> subdomain;
// keep it out of every search index so it stays truly private ("introuvable").
export const metadata: Metadata = { robots: { index: false, follow: false } };

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
  if (!site) preview404(siteId, "resolveDraftSite returned null (see [site-resolver] warning above)");

  const {
    enterpriseVariables,
    enterpriseId,
    reviews,
    publishedInstances,
    publishedStyleGuide,
    styleGuide,
    menus,
    publishedSitemap,
    claudeDesign,
    paywallEnabled,
    bookingUrl,
    companyName,
  } = site;

  if (!publishedInstances || publishedInstances.length === 0) {
    preview404(siteId, "the site has no section instances (import incomplete, or nothing saved yet)");
  }

  const instances = publishedInstances as Array<{ page_slug: string; is_hidden?: boolean }>;
  const enterpriseTags = parseEnterpriseTags(enterpriseVariables);
  const requestedSlug = slugFromPath(path);

  // A design imported without an index.html has no "/" page; rather than 404 the
  // bare preview subdomain, fall back to its first renderable page.
  const tagAllows = (slug: string) => {
    const tag = publishedSitemap?.find((p) => p.slug === slug)?.service_tag;
    return !tag || enterpriseTags.includes(tag);
  };
  const resolved = resolvePreviewSlug(instances, publishedSitemap, requestedSlug, tagAllows);
  if (!resolved) preview404(siteId, `no visible section instance for "${requestedSlug}"`);

  const { slug: pageSlug, fellBack } = resolved;
  const targetPage = publishedSitemap?.find((p) => p.slug === pageSlug);

  // Same gating as the public SitePageView: page must exist and not be gated by
  // a missing service tag. Skipped for a fallback slug — it was picked from the
  // instances that do exist, so re-checking the sitemap would undo the fallback.
  if (!fellBack && pageSlug !== "/" && !targetPage) {
    preview404(siteId, `"${pageSlug}" is not in the sitemap`);
  }
  if (targetPage?.service_tag && !enterpriseTags.includes(targetPage.service_tag)) {
    preview404(siteId, `"${pageSlug}" is gated by service tag "${targetPage.service_tag}"`);
  }

  const visibleMenus = buildPublicMenus(menus, publishedSitemap, instances, enterpriseTags);

  return (
    <>
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
        enterpriseId={enterpriseId}
      />
      {paywallEnabled && (
        <DemoPaywallBar siteId={siteId} bookingUrl={bookingUrl} companyName={companyName} />
      )}
    </>
  );
}
