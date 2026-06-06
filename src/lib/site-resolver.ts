import { createClient } from "@supabase/supabase-js";
import type { SiteConfig, SiteSection, BlogPost, StyleGuide, SiteMenus, SitemapPage, SeoMeta } from "@/types";
import {
  deriveLayoutFieldsFromVariables,
  type ReviewItem,
} from "@/lib/site-builder/resolve-variables";

export type { ReviewItem };

function getServiceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

export interface ResolvedSite {
  siteId: string;
  config: SiteConfig;
  enterpriseVariables: Record<string, string>;
  companyName?: string;
  logoUrl?: string;
  phone?: string;
  isPublished: boolean;
  styleGuide?: StyleGuide | null;
  /** Published snapshot of style_guide (set by "Publish" action) */
  publishedStyleGuide?: StyleGuide | null;
  /** Published snapshot of all section instances (set by "Publish" action) */
  publishedInstances?: Array<unknown> | null;
  hasDynamicSections?: boolean;
  reviews?: ReviewItem[];
  /** Published snapshot of site_config (set by "Publish"). Contains menus. */
  publishedSiteConfig?: Partial<SiteConfig> & { menus?: SiteMenus } | null;
  /** Convenience accessor: menus extracted from the published snapshot. */
  menus?: SiteMenus | null;
  /** Favicon URL from the published site_config; preferred over the logo. */
  faviconUrl?: string | null;
  /** Published snapshot of the sitemap. Used to filter pages by service_tag. */
  publishedSitemap?: SitemapPage[] | null;
  /** Site-level SEO/social defaults from the published site_config snapshot. */
  seo?: SeoMeta | null;
}

// Resolve a site by subdomain or custom domain
export async function resolveSite(
  subdomain: string,
  host?: string
): Promise<ResolvedSite | null> {
  const supabase = getServiceClient();

  // Try subdomain first, then custom domain
  let query = supabase
    .from("sites")
    .select(
      "id, name, is_published, published_subdomain, published_domain, enterprise_id, lead_magnet_project_id, site_config, style_guide, published_style_guide, published_site_config, published_sitemap, published_instances, published_variables, published_reviews"
    )
    .eq("is_published", true);

  if (subdomain) {
    query = query.eq("published_subdomain", subdomain);
  } else if (host) {
    query = query.eq("published_domain", host);
  } else {
    return null;
  }

  const { data: siteRow, error } = await query.single();
  if (error || !siteRow) return null;

  let config: SiteConfig = siteRow.site_config ?? {
    theme: "theme-default",
    settings: {
      colors: { primary: "#1a56db", secondary: "#6b7280", accent: "#f59e0b", background: "#ffffff", text: "#111827" },
      fonts: { heading: "Inter", body: "Inter" },
    },
    sections: [],
  };

  // V2 sites store design tokens in style_guide, not in site_config.settings
  if (!config.settings) {
    const sg = (siteRow.style_guide as StyleGuide) ?? null;
    config = {
      ...config,
      settings: {
        colors: sg?.colors
          ? { primary: sg.colors.primary, secondary: sg.colors.secondary, accent: sg.colors.accent, background: sg.colors.background, text: sg.colors.text }
          : { primary: "#1a56db", secondary: "#6b7280", accent: "#f59e0b", background: "#ffffff", text: "#111827" },
        fonts: sg?.fonts
          ? { heading: sg.fonts.heading, body: sg.fonts.body }
          : { heading: "Inter", body: "Inter" },
      },
    };
  }

  // Strict snapshot lock: a published site MUST have published_variables and
  // published_instances set. Otherwise we'd serve live CRM data and leak
  // unpublished edits (logos, reviews, entreprise.name…) to the deployed site.
  // Run the admin backfill endpoint to populate snapshots for legacy sites,
  // or republish the site from the builder.
  const snapshotVars = (siteRow as { published_variables?: Record<string, string> | null }).published_variables;
  const snapshotReviews = (siteRow as { published_reviews?: ReviewItem[] | null }).published_reviews;
  const snapshotInstances = (siteRow as { published_instances?: Array<unknown> | null }).published_instances;

  if (!snapshotVars || Object.keys(snapshotVars).length === 0 || !snapshotInstances) {
    console.warn(
      `[site-resolver] site ${siteRow.id} is published but missing snapshots ` +
        `(vars=${!!snapshotVars}, instances=${!!snapshotInstances}). ` +
        `Refusing to fall back to live data. Republish or run /api/site-builder/admin/backfill-snapshots.`
    );
    return null;
  }

  const vars: Record<string, string> = { ...snapshotVars };
  const reviews: ReviewItem[] = Array.isArray(snapshotReviews) ? snapshotReviews : [];
  const layout = deriveLayoutFieldsFromVariables(vars);
  const companyName = layout.companyName;
  const logoUrl = layout.logoUrl;
  const phone = layout.phone;

  // Merge client overrides into section data
  const { data: overrides } = await supabase
    .from("client_overrides")
    .select("section_id, data")
    .eq("site_id", siteRow.id);

  if (overrides && overrides.length > 0) {
    const overrideMap = Object.fromEntries(overrides.map((o) => [o.section_id, o.data]));
    const sections = config.sections ?? [];
    config = {
      ...config,
      sections: sections.map((s: SiteSection) =>
        overrideMap[s.id]
          ? { ...s, data: { ...s.data, ...(overrideMap[s.id] as Record<string, unknown>) } }
          : s
      ),
    };
  }

  const publishedSiteConfig =
    (siteRow as { published_site_config?: (Partial<SiteConfig> & { menus?: SiteMenus; faviconUrl?: string; seo?: SeoMeta }) | null }).published_site_config ?? null;
  const menus = publishedSiteConfig?.menus ?? null;
  const faviconUrl = publishedSiteConfig?.faviconUrl ?? null;
  const seo = publishedSiteConfig?.seo ?? null;

  return {
    siteId: siteRow.id,
    config,
    enterpriseVariables: vars,
    companyName,
    logoUrl,
    phone,
    isPublished: siteRow.is_published,
    styleGuide: (siteRow.style_guide as StyleGuide) ?? null,
    publishedStyleGuide: (siteRow.published_style_guide as StyleGuide) ?? null,
    publishedInstances: (siteRow.published_instances as Array<unknown>) ?? null,
    publishedSiteConfig,
    menus,
    faviconUrl,
    reviews,
    publishedSitemap: (siteRow as { published_sitemap?: SitemapPage[] | null }).published_sitemap ?? null,
    seo,
  };
}

// Fetch published blog posts for a site
export async function fetchBlogPosts(siteId: string): Promise<BlogPost[]> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("blog_posts")
    .select("id, title, slug, excerpt, cover_image_url, published_at")
    .eq("site_id", siteId)
    .eq("is_published", true)
    .order("published_at", { ascending: false });

  return (data ?? []) as BlogPost[];
}

// Fetch a single blog post by slug
export async function fetchBlogPost(siteId: string, slug: string): Promise<BlogPost | null> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("blog_posts")
    .select("*")
    .eq("site_id", siteId)
    .eq("slug", slug)
    .eq("is_published", true)
    .single();

  return (data as BlogPost) ?? null;
}
