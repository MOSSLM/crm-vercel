import React from "react";
import type { Metadata, Viewport } from "next";
import { resolveDraftSite, probeDraftSite } from "@/lib/site-resolver";
import { DynamicPageRenderer } from "@/components/site-builder/DynamicPageRenderer";
import { DemoPaywallBar } from "@/components/site-builder/DemoPaywallBar";
import { parseEnterpriseTags } from "@/components/site-builder/SitePageView";
import { buildPublicMenus } from "@/lib/site-builder/menu-overrides";
import { serviceTagMapFromSitemap } from "@/lib/site-builder/claude-design/filter-service-links";
import { resolvePreviewSlug } from "@/lib/site-builder/preview-slug";
import {
  PreviewDiagnostic,
  type PreviewFailureKind,
  type ServiceGateDetail,
} from "@/components/site-builder/PreviewDiagnostic";
import { serviceTagGate } from "@/utils/serviceTags";

interface PreviewProps {
  params: Promise<{ siteId: string; path?: string[] }>;
}

/** Join the optional catch-all segments into a sitemap slug. */
function slugFromPath(path: string[] | undefined): string {
  const segments = (path ?? []).filter(Boolean);
  return segments.length > 0 ? "/" + segments.join("/") : "/";
}

/**
 * Why a preview can't render. Thrown rather than returned so the checks below
 * stay linear; caught in the page, which renders the self-service diagnosis.
 * `kind` keeps the cause machine-readable so the diagnosis advises from the
 * actual failure rather than inferring one from the row it managed to read.
 */
class PreviewUnavailable extends Error {
  constructor(
    readonly kind: PreviewFailureKind,
    reason: string,
    /** Set for "service-gated": which tag closed the page, against which tags. */
    readonly gate?: ServiceGateDetail,
  ) {
    super(reason);
  }
}
// A function declaration, not an arrow: TS only narrows control flow through
// never-returning calls when the callee is declared this way.
function unavailable(kind: PreviewFailureKind, reason: string, gate?: ServiceGateDetail): never {
  throw new PreviewUnavailable(kind, reason, gate);
}

// Re-emit the viewport meta (stripped on import) so mobile @media fires, and
// never cache: the preview reflects the LIVE draft the operator is editing.
export const viewport: Viewport = { width: "device-width", initialScale: 1 };
export const dynamic = "force-dynamic";

// The draft preview is reachable on an unguessable {siteId}.<domain> subdomain;
// keep it out of every search index so it stays truly private ("introuvable").
export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Everything the renderer needs, or a PreviewUnavailable carrying the reason. */
async function loadPreview(siteId: string, path: string[] | undefined) {
  const result = await resolveDraftSite(siteId);
  if (!result.ok) unavailable(result.kind, result.reason);

  const { site } = result;
  const { enterpriseVariables, publishedInstances, publishedSitemap } = site;

  if (!publishedInstances || publishedInstances.length === 0) {
    unavailable(
      "no-sections",
      "ce design ne contient aucune section enregistrée " +
        "(import interrompu, ou rien n'a encore été enregistré dans l'éditeur)",
    );
  }

  const instances = publishedInstances as Array<{ page_slug: string; is_hidden?: boolean }>;
  const enterpriseTags = parseEnterpriseTags(enterpriseVariables);
  const requestedSlug = slugFromPath(path);

  // A design imported without an index.html has no "/" page; rather than 404 the
  // bare preview subdomain, fall back to its first renderable page.
  const allowsService = serviceTagGate(enterpriseTags);
  const tagAllows = (slug: string) =>
    allowsService(publishedSitemap?.find((p) => p.slug === slug)?.service_tag);
  const resolved = resolvePreviewSlug(instances, publishedSitemap, requestedSlug, tagAllows);
  if (!resolved) unavailable("page-missing", `aucune page visible ne correspond à « ${requestedSlug} »`);

  const { slug: pageSlug, fellBack } = resolved;
  const targetPage = publishedSitemap?.find((p) => p.slug === pageSlug);

  // Same gating as the public SitePageView: page must exist and not be gated by
  // a missing service tag. Skipped for a fallback slug — it was picked from the
  // instances that do exist, so re-checking the sitemap would undo the fallback.
  if (!fellBack && pageSlug !== "/" && !targetPage) {
    unavailable("page-missing", `« ${pageSlug} » n'est pas dans le plan du site`);
  }
  // Comparison goes through serviceTagGate — see its doc: the page's tag comes
  // from its file name ("pompe-a-chaleur"), the enterprise's from the CRM
  // ("pompe à chaleur"), and a raw comparison closed every service whose label
  // isn't already one ASCII word.
  if (!allowsService(targetPage?.service_tag)) {
    unavailable(
      // Its own kind: the page EXISTS and renders — it is closed for this
      // company only. Reported as "page-missing", it drew the diagnosis that
      // lists the available pages, including the very one being asked for.
      "service-gated",
      `« ${pageSlug} » est réservée au service « ${targetPage?.service_tag} », ` +
        `absent des services de l'entreprise liée`,
      { pageTag: targetPage?.service_tag ?? "", companyTags: enterpriseTags },
    );
  }

  return {
    site,
    pageSlug,
    instances,
    visibleMenus: buildPublicMenus(site.menus, publishedSitemap, instances, enterpriseTags),
  };
}

/**
 * Live draft preview of a site by id, OUTSIDE the editor iframe. Renders the
 * current (unpublished, incl. template) design with sample company data via the
 * exact public render pipeline (DynamicPageRenderer), so animations, the design's
 * own JS and responsive breakpoints are exercised for real. The unguessable
 * site UUID is the capability token; it only ever shows sample data.
 */
export default async function DraftPreviewPage({ params }: PreviewProps) {
  const { siteId, path } = await params;

  let data: Awaited<ReturnType<typeof loadPreview>>;
  try {
    data = await loadPreview(siteId, path);
  } catch (e) {
    if (!(e instanceof PreviewUnavailable)) throw e;
    // A line here means the request DID reach the app — which is what tells an
    // app-level failure apart from the platform 404 you get when the wildcard
    // domain isn't attached to the Vercel project.
    console.warn(`[preview] unavailable for site ${siteId}: ${e.message}`);

    // Render the diagnosis instead of a mute 404: the URL holder already has
    // full read access to the design, and the platform logs where the reason
    // used to live are exactly what the link's recipients can't reach.
    const probe = await probeDraftSite(siteId).catch(() => null);
    return (
      <PreviewDiagnostic
        siteId={siteId}
        kind={e.kind}
        reason={e.message}
        probe={probe}
        gate={e.gate}
      />
    );
  }

  const { site, pageSlug, visibleMenus } = data;

  return (
    <>
      <DynamicPageRenderer
        siteId={siteId}
        pageSlug={pageSlug}
        styleGuide={site.publishedStyleGuide ?? site.styleGuide}
        variables={site.enterpriseVariables}
        reviews={site.reviews}
        menus={visibleMenus}
        preloadedInstances={site.publishedInstances}
        claudeDesign={site.claudeDesign}
        serviceTagBySlug={site.claudeDesign ? serviceTagMapFromSitemap(site.publishedSitemap) : undefined}
      />
      {site.paywallEnabled && (
        <DemoPaywallBar
          siteId={siteId}
          bookingUrl={site.bookingUrl}
          companyName={site.companyName}
        />
      )}
    </>
  );
}
