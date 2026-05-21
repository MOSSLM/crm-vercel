import React from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { resolveSite } from "@/lib/site-resolver";
import { filterMenusByEnterpriseTags } from "@/lib/site-builder/menu-overrides";
import { DynamicPageRenderer } from "@/components/site-builder/DynamicPageRenderer";
import type { Metadata } from "next";

interface SitePageProps {
  params: Promise<{ subdomain: string }>;
  searchParams: Promise<{ page?: string }>;
}

export async function generateMetadata({ params }: SitePageProps): Promise<Metadata> {
  const { subdomain } = await params;
  const headersList = await headers();
  const host = headersList.get("host") ?? "";
  const site = await resolveSite(subdomain, host);

  if (!site) return {};

  const companyName = site.companyName ?? subdomain;
  return {
    title: companyName,
    description: `Site de ${companyName}`,
    icons: { icon: site.logoUrl ?? "/favicon.ico" },
  };
}

export default async function SitePage({ params, searchParams }: SitePageProps) {
  const { subdomain } = await params;
  const { page: pageSlug = "/" } = await searchParams;
  const headersList = await headers();
  const host = headersList.get("host") ?? "";

  const site = await resolveSite(subdomain, host);
  if (!site) notFound();

  const { enterpriseVariables, siteId, reviews, publishedInstances, publishedStyleGuide, styleGuide, menus, publishedSitemap } = site;
  const effectiveStyleGuide = publishedStyleGuide ?? styleGuide;

  // resolveSite() already enforces a strict snapshot lock: it returns null
  // when published_variables / published_instances are missing. Reaching
  // here means we have a valid snapshot to render.
  if (!publishedInstances || publishedInstances.length === 0) notFound();

  // Enterprise service tags drive both page routing and menu filtering.
  let enterpriseTags: string[] = [];
  try {
    const parsed = JSON.parse(enterpriseVariables["__service_tags"] ?? "[]");
    if (Array.isArray(parsed)) enterpriseTags = parsed.filter((t): t is string => typeof t === "string");
  } catch {}

  // Filter pages by enterprise.service_tags: a page tagged with a service_tag
  // that the enterprise doesn't have 404s here.
  if (publishedSitemap && publishedSitemap.length > 0) {
    const targetPage = publishedSitemap.find((p) => p.slug === pageSlug);
    if (targetPage?.service_tag && !enterpriseTags.includes(targetPage.service_tag)) notFound();
  }

  // Drop nav / footer links pointing to pages hidden for this enterprise.
  const visibleMenus = filterMenusByEnterpriseTags(menus, publishedSitemap, enterpriseTags);

  return (
    <DynamicPageRenderer
      siteId={siteId}
      pageSlug={pageSlug}
      styleGuide={effectiveStyleGuide}
      variables={enterpriseVariables}
      reviews={reviews}
      menus={visibleMenus}
      preloadedInstances={publishedInstances}
    />
  );
}

// ISR: revalidate every 60 seconds
export const revalidate = 60;
