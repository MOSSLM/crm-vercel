import { createClient } from "@supabase/supabase-js";
import type { SiteConfig, SiteSection, BlogPost, StyleGuide, SiteMenus, SitemapPage, SeoMeta } from "@/types";
import {
  deriveLayoutFieldsFromVariables,
  resolveEnterpriseVariables,
  type ReviewItem,
} from "@/lib/site-builder/resolve-variables";
import { SAMPLE_VARIABLES } from "@/lib/site-builder/claude-design/sample-variables";

export type { ReviewItem };

/** shared_assets JSONB shape for a Claude design site. */
type ClaudeSharedAssets = { css?: string; js?: string; scriptLinks?: string[]; fonts?: string[] };

/** Builds the `claudeDesign` render payload from a site's shared_assets + tweaks. */
function buildClaudeDesign(
  assets: ClaudeSharedAssets | null | undefined,
  tweaks: Record<string, unknown> | null | undefined,
): NonNullable<ResolvedSite["claudeDesign"]> {
  return {
    sharedCss: assets?.css ?? "",
    js: assets?.js ?? "",
    scriptLinks: Array.isArray(assets?.scriptLinks) ? assets.scriptLinks : [],
    fontLinks: Array.isArray(assets?.fonts) ? assets.fonts : [],
    tweaks: tweaks ?? {},
  };
}

function getServiceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

export interface ResolvedSite {
  siteId: string;
  /** Linked company id (null on a template). Enables per-company image fill. */
  enterpriseId?: number | null;
  /** When true, the demo-site purchase paywall bar is shown to visitors. */
  paywallEnabled?: boolean;
  /** Optional booking link for the paywall "Réserver un appel" CTA. */
  bookingUrl?: string | null;
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
  /** Claude Design render data (shared CSS/JS, fonts, remote script libs, theme)
   *  when this is one. `js`/`scriptLinks` carry the design's own runtime so its
   *  animations run on the deployed site; injected at the bottom of the page. */
  claudeDesign?: {
    sharedCss: string;
    js: string;
    scriptLinks: string[];
    fontLinks: string[];
    tweaks: Record<string, unknown>;
  } | null;
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
      "id, name, is_published, published_subdomain, published_domain, enterprise_id, paywall_enabled, booking_url, lead_magnet_project_id, site_config, style_guide, published_style_guide, published_site_config, published_sitemap, published_instances, published_variables, published_reviews, is_claude_design, shared_assets, tweaks, published_shared_assets, published_tweaks"
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

  // Claude Design render data: prefer the published snapshot, fall back to live
  // (consistent with the rest of the resolver). Only set for is_claude_design.
  const cd = siteRow as {
    is_claude_design?: boolean | null;
    shared_assets?: ClaudeSharedAssets | null;
    tweaks?: Record<string, unknown> | null;
    published_shared_assets?: ClaudeSharedAssets | null;
    published_tweaks?: Record<string, unknown> | null;
  };
  let claudeDesign: ResolvedSite["claudeDesign"] = null;
  if (cd.is_claude_design) {
    claudeDesign = buildClaudeDesign(cd.published_shared_assets ?? cd.shared_assets ?? {}, cd.published_tweaks ?? cd.tweaks ?? {});
  }

  return {
    siteId: siteRow.id,
    enterpriseId: (siteRow as { enterprise_id?: number | null }).enterprise_id ?? null,
    paywallEnabled: (siteRow as { paywall_enabled?: boolean | null }).paywall_enabled ?? false,
    bookingUrl: (siteRow as { booking_url?: string | null }).booking_url ?? null,
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
    claudeDesign,
  };
}

/**
 * Resolve a site's LIVE (unpublished) state by id, for the draft-preview URL.
 * Unlike resolveSite this has NO snapshot lock and no `is_published` filter, so
 * templates and never-published designs render too — with the enterprise's real
 * variables when one is linked, else sample values. Renders exactly like the
 * public site (same DynamicPageRenderer), so animations / JS / breakpoints are
 * exercised for real outside the editor iframe. Sample-data only ⇒ no leak.
 */
export async function resolveDraftSite(siteId: string): Promise<ResolvedSite | null> {
  const supabase = getServiceClient();

  const { data: siteRow, error } = await supabase
    .from("sites")
    .select(
      "id, name, enterprise_id, paywall_enabled, booking_url, lead_magnet_project_id, site_config, style_guide, sitemap, is_claude_design, shared_assets, tweaks",
    )
    .eq("id", siteId)
    .single();
  if (error || !siteRow) return null;

  // Live section instances (no published snapshot) + their defs for native sections.
  const { data: instanceRows } = await supabase
    .from("site_section_instances")
    .select("*, section_def:site_sections(*)")
    .eq("site_id", siteId)
    .order("sort_order");
  const instances = (instanceRows ?? []) as Array<unknown>;

  const sitemap = ((siteRow.sitemap as SitemapPage[] | null) ?? []) as SitemapPage[];

  // Variables: real enterprise data when linked, else sample values. Always
  // provide __service_tags so service-tagged pages render in the preview.
  let vars: Record<string, string>;
  let reviews: ReviewItem[] = [];
  let companyName: string | undefined;
  let logoUrl: string | undefined;
  let phone: string | undefined;
  if (siteRow.enterprise_id) {
    const resolved = await resolveEnterpriseVariables(supabase, {
      enterprise_id: siteRow.enterprise_id,
      lead_magnet_project_id: (siteRow.lead_magnet_project_id as string | null) ?? null,
      id: siteRow.id,
    });
    vars = resolved.variables;
    reviews = resolved.reviews;
    companyName = resolved.companyName;
    logoUrl = resolved.logoUrl;
    phone = resolved.phone;
  } else {
    const allTags = [...new Set(sitemap.map((p) => p.service_tag).filter((t): t is string => !!t))];
    vars = { ...SAMPLE_VARIABLES, __service_tags: JSON.stringify(allTags) };
  }

  const styleGuide = (siteRow.style_guide as StyleGuide) ?? null;
  const siteConfig = (siteRow.site_config as (Partial<SiteConfig> & { menus?: SiteMenus }) | null) ?? null;
  const config: SiteConfig =
    (siteRow.site_config as SiteConfig) ?? {
      theme: "theme-default",
      settings: {
        colors: { primary: "#1a56db", secondary: "#6b7280", accent: "#f59e0b", background: "#ffffff", text: "#111827" },
        fonts: { heading: "Inter", body: "Inter" },
      },
      sections: [],
    };

  const cd = siteRow as {
    is_claude_design?: boolean | null;
    shared_assets?: ClaudeSharedAssets | null;
    tweaks?: Record<string, unknown> | null;
  };
  const claudeDesign = cd.is_claude_design ? buildClaudeDesign(cd.shared_assets, cd.tweaks) : null;

  return {
    siteId: siteRow.id,
    enterpriseId: (siteRow as { enterprise_id?: number | null }).enterprise_id ?? null,
    paywallEnabled: (siteRow as { paywall_enabled?: boolean | null }).paywall_enabled ?? false,
    bookingUrl: (siteRow as { booking_url?: string | null }).booking_url ?? null,
    config,
    enterpriseVariables: vars,
    companyName,
    logoUrl,
    phone,
    isPublished: false,
    styleGuide,
    publishedStyleGuide: styleGuide,
    publishedInstances: instances,
    publishedSiteConfig: siteConfig,
    menus: siteConfig?.menus ?? null,
    faviconUrl: null,
    reviews,
    publishedSitemap: sitemap,
    seo: null,
    claudeDesign,
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
