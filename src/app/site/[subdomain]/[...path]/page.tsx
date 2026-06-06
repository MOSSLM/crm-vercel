import React from "react";
import { headers } from "next/headers";
import { resolveSite } from "@/lib/site-resolver";
import { SitePageView } from "@/components/site-builder/SitePageView";
import { buildPageMetadata } from "@/lib/site-builder/build-page-metadata";
import type { Metadata } from "next";

interface CatchAllProps {
  params: Promise<{ subdomain: string; path: string[] }>;
}

/** Join the catch-all segments into a sitemap slug, e.g. "/services/climatisation". */
function slugFromPath(path: string[] | undefined): string {
  const segments = (path ?? []).filter(Boolean);
  return segments.length > 0 ? "/" + segments.join("/") : "/";
}

export async function generateMetadata({ params }: CatchAllProps): Promise<Metadata> {
  const { subdomain, path } = await params;
  const headersList = await headers();
  const host = headersList.get("host") ?? "";
  const site = await resolveSite(subdomain, host);

  if (!site) return {};

  const pageSlug = slugFromPath(path);
  const page = site.publishedSitemap?.find((p) => p.slug === pageSlug);

  return buildPageMetadata(site, page, subdomain);
}

export default async function CatchAllSitePage({ params }: CatchAllProps) {
  const { subdomain, path } = await params;
  const headersList = await headers();
  const host = headersList.get("host") ?? "";

  return <SitePageView subdomain={subdomain} host={host} pageSlug={slugFromPath(path)} />;
}

// ISR: revalidate every 60 seconds
export const revalidate = 60;
