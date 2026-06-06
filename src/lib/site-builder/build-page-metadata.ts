import type { Metadata } from "next";
import type { ResolvedSite } from "@/lib/site-resolver";
import type { SitemapPage } from "@/types";
import { interpolateVars } from "@/lib/site-builder/interpolate-vars";

/**
 * Builds the Next.js Metadata for a published site page.
 *
 * Cascade for every field: per-page value → site-level seo default → fallback.
 * All values support `{{ variables }}` (interpolated from the published
 * enterprise variables snapshot). Emits OpenGraph + Twitter card tags.
 *
 * Shared by the home route and the catch-all route so both stay consistent.
 */
export function buildPageMetadata(
  site: ResolvedSite,
  page: SitemapPage | undefined,
  fallbackTitle: string,
): Metadata {
  const vars = site.enterpriseVariables ?? {};
  const seo = site.seo ?? {};
  const companyName = site.companyName ?? fallbackTitle;
  const ip = (v?: string | null) => (v ? interpolateVars(v, vars) : "");

  const title =
    ip(page?.metaTitle) || ip(seo.metaTitle) || (page ? `${page.title} — ${companyName}` : companyName);
  const description =
    ip(page?.metaDescription) || ip(seo.metaDescription) || `Site de ${companyName}`;
  const ogTitle = ip(page?.ogTitle) || ip(seo.ogTitle) || title;
  const ogDescription = ip(page?.ogDescription) || ip(seo.ogDescription) || description;
  const ogImage = ip(page?.ogImage) || ip(seo.ogImage) || site.logoUrl || "";
  const icon = site.faviconUrl ?? site.logoUrl ?? "/favicon.ico";

  const images = ogImage ? [{ url: ogImage, width: 1200, height: 630 }] : undefined;

  return {
    title,
    description,
    icons: { icon },
    openGraph: {
      title: ogTitle,
      description: ogDescription,
      type: "website",
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description: ogDescription,
      images: images?.map((i) => i.url),
    },
  };
}
