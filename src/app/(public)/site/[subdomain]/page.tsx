import React from "react";
import { headers } from "next/headers";
import { resolveSite } from "@/lib/site-resolver";
import { SitePageView } from "@/components/site-builder/SitePageView";
import { buildPageMetadata } from "@/lib/site-builder/build-page-metadata";
import { origineRequete } from "@/lib/site-builder/origine-requete";
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

  // Home page lives at slug "/" in the sitemap — pull its per-page meta too.
  const page = site.publishedSitemap?.find((p) => p.slug === "/");
  // L'origine réellement demandée : la carte de partage est servie depuis le
  // MÊME hôte que la page qui la déclare (sous-domaine, ou domaine du client).
  return buildPageMetadata(site, page, subdomain, await origineRequete());
}

export default async function SitePage({ params }: SitePageProps) {
  const { subdomain } = await params;
  const headersList = await headers();
  const host = headersList.get("host") ?? "";

  return <SitePageView subdomain={subdomain} host={host} pageSlug="/" />;
}

// ISR: revalidate every 60 seconds
export const revalidate = 60;
