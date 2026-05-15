import React from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getSupabaseServiceClient } from "@/lib/supabase-service";
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

  const { enterpriseVariables, siteId, reviews, publishedInstances, publishedStyleGuide, styleGuide } = site;
  const effectiveStyleGuide = publishedStyleGuide ?? styleGuide;

  // Prefer the published snapshot (set when user clicks "Publish") so that
  // in-progress edits don't leak to the live site.
  if (publishedInstances && publishedInstances.length > 0) {
    return (
      <DynamicPageRenderer
        siteId={siteId}
        pageSlug={pageSlug}
        styleGuide={effectiveStyleGuide}
        variables={enterpriseVariables}
        reviews={reviews}
        preloadedInstances={publishedInstances}
      />
    );
  }

  // Fallback for sites not yet re-published since the dynamic-sections
  // migration — render directly from the live `site_section_instances`
  // table. Only reached if a site exists with instances but `is_published`
  // was set before the snapshot columns were introduced.
  const supabase = getSupabaseServiceClient();
  const { count } = await supabase
    .from("site_section_instances")
    .select("id", { count: "exact", head: true })
    .eq("site_id", siteId);

  if ((count ?? 0) > 0) {
    return (
      <DynamicPageRenderer
        siteId={siteId}
        pageSlug={pageSlug}
        styleGuide={effectiveStyleGuide}
        variables={enterpriseVariables}
        reviews={reviews}
      />
    );
  }

  notFound();
}

// ISR: revalidate every 60 seconds
export const revalidate = 60;
