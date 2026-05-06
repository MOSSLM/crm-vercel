import React from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { resolveSite, fetchBlogPosts } from "@/lib/site-resolver";
import SectionRenderer from "@/components/site-builder/SectionRenderer";
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

  const { config, enterpriseVariables, siteId } = site;

  // ─── Dynamic sections mode: check if site has section instances ───────────────
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { count } = await supabase
    .from("site_section_instances")
    .select("id", { count: "exact", head: true })
    .eq("site_id", siteId);

  if ((count ?? 0) > 0) {
    return (
      <DynamicPageRenderer
        siteId={siteId}
        pageSlug={pageSlug}
        styleGuide={site.styleGuide}
      />
    );
  }

  // ─── Legacy mode (site_config JSON) ──────────────────────────────────────────
  const sections = config.sections ?? [];
  const hasBlog = sections.some((s) => s.type === "blog" && !s.hidden);
  const blogPosts = hasBlog ? await fetchBlogPosts(siteId) : [];

  return (
    <>
      {sections
        .filter((s) => !s.hidden)
        .map((section) => (
          <SectionRenderer
            key={section.id}
            section={section}
            variables={enterpriseVariables}
            subdomain={subdomain}
            blogPosts={blogPosts}
          />
        ))}
    </>
  );
}

// ISR: revalidate every 60 seconds
export const revalidate = 60;
