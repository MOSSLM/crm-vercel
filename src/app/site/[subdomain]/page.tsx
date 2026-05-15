import React from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { resolveSite } from "@/lib/site-resolver";
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

  const { enterpriseVariables, siteId, reviews, publishedInstances, publishedStyleGuide, styleGuide, menus } = site;
  const effectiveStyleGuide = publishedStyleGuide ?? styleGuide;

  // resolveSite() already enforces a strict snapshot lock: it returns null
  // when published_variables / published_instances are missing. Reaching
  // here means we have a valid snapshot to render.
  if (!publishedInstances || publishedInstances.length === 0) notFound();

  return (
    <DynamicPageRenderer
      siteId={siteId}
      pageSlug={pageSlug}
      styleGuide={effectiveStyleGuide}
      variables={enterpriseVariables}
      reviews={reviews}
      menus={menus}
      preloadedInstances={publishedInstances}
    />
  );
}

// ISR: revalidate every 60 seconds
export const revalidate = 60;
