import React from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { resolveSite, fetchBlogPosts } from "@/lib/site-resolver";
import SectionRenderer from "@/components/site-builder/SectionRenderer";
import type { Metadata } from "next";

interface SitePageProps {
  params: Promise<{ subdomain: string }>;
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

export default async function SitePage({ params }: SitePageProps) {
  const { subdomain } = await params;
  const headersList = await headers();
  const host = headersList.get("host") ?? "";

  const site = await resolveSite(subdomain, host);
  if (!site) notFound();

  const { config, enterpriseVariables, siteId } = site;

  const sections = config.sections ?? [];

  // Pre-fetch blog posts if there's a blog section
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
