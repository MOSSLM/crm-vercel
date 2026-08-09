import type { Metadata } from "next";
import type { ResolvedSite } from "@/lib/site-resolver";
import type { SitemapPage } from "@/types";
import { interpolateVars } from "@/lib/site-builder/interpolate-vars";
import { getAppUrl } from "@/lib/app-url";

/**
 * URL absolue de la carte de partage d'un site.
 *
 * Toujours absolue, et toujours sur l'hôte du CRM : les routes `(public)` n'ont
 * pas de `metadataBase`, et le site est servi depuis `{sub}.samadigitalstudio.fr`
 * où `/api` n'existe pas (le middleware réécrit vers `/site/{sub}`). Une URL
 * relative ou construite sur l'hôte courant ne donnerait donc rien.
 */
export function demoOgImageUrl(siteId: string): string {
  return `${getAppUrl()}/api/og/demo/${siteId}`;
}

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
  const icon = site.faviconUrl ?? site.logoUrl ?? "/favicon.ico";

  // Ordre délibéré : ce que l'opérateur a choisi, puis la carte fabriquée, puis
  // la route qui la fabrique à la volée.
  //
  // `site.logoUrl` a été RETIRÉ de ce repli. C'était le défaut d'origine : un
  // logo carré servi comme image OpenGraph et annoncé 1200×630. WhatsApp
  // l'étirait, ou ne l'affichait pas du tout.
  const chosenImage = ip(page?.ogImage) || ip(seo.ogImage) || "";
  const generatedImage = site.ogImageUrl ?? demoOgImageUrl(site.siteId);

  // `width`/`height` ne sont annoncés QUE pour l'image dont on connaît le
  // format. Mentir sur les dimensions d'une image choisie à la main, c'est
  // reproduire le bug qu'on corrige — en moins visible.
  const images = chosenImage
    ? [{ url: chosenImage }]
    : [{ url: generatedImage, width: 1200, height: 630 }];

  return {
    title,
    description,
    icons: { icon },
    // Sans `metadataBase`, Next ne sait pas rendre absolue une URL relative et
    // laisse tomber la balise sans rien dire.
    metadataBase: new URL(getAppUrl()),
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
