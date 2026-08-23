import React from "react";
import { headers } from "next/headers";
import { resolveSite } from "@/lib/site-resolver";
import { SitePageView } from "@/components/site-builder/SitePageView";
import { buildPageMetadata } from "@/lib/site-builder/build-page-metadata";
import { origineRequete } from "@/lib/site-builder/origine-requete";
import { appliquerRedirection } from "@/lib/site-builder/appliquer-redirection";
import type { Metadata } from "next";

interface CatchAllProps {
  params: Promise<{ subdomain: string; path: string[] }>;
  /**
   * Lu UNIQUEMENT pour le plan de redirection : un permalien hérité peut vivre
   * dans la query (`/?page_id=12`). Ça ne coûte rien en rendu — la route est
   * déjà dynamique parce qu'elle lit `headers()`.
   */
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
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

  // L'origine réellement demandée : la carte de partage est servie depuis le
  // MÊME hôte que la page qui la déclare (sous-domaine, ou domaine du client).
  return buildPageMetadata(site, page, subdomain, await origineRequete(), pageSlug);
}

export default async function CatchAllSitePage({ params, searchParams }: CatchAllProps) {
  const { subdomain, path } = await params;
  const headersList = await headers();
  const host = headersList.get("host") ?? "";
  const pageSlug = slugFromPath(path);

  // AVANT le rendu : une URL de l'ancien site du client doit partir en 308 vers
  // sa nouvelle page, pas rendre un 404. Ne s'applique jamais à une page servie
  // (voir appliquer-redirection.ts).
  await appliquerRedirection(subdomain, host, pageSlug, (await searchParams) ?? null);

  return <SitePageView subdomain={subdomain} host={host} pageSlug={pageSlug} />;
}

// ISR: revalidate every 60 seconds
export const revalidate = 60;
