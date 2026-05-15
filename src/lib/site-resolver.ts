import { createClient } from "@supabase/supabase-js";
import type { SiteConfig, SiteSection, BlogPost, StyleGuide } from "@/types";
import {
  resolveEnterpriseVariables,
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
      "id, name, is_published, published_subdomain, published_domain, enterprise_id, lead_magnet_project_id, site_config, style_guide, published_style_guide, published_instances, published_variables, published_reviews"
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

  // Prefer the publish-time snapshot so the deployed site is frozen between
  // publishes. Live CRM edits (entreprises.name, lead_magnet_reviews, etc.)
  // only propagate after the user clicks "Publier" again.
  // Legacy sites published before this column existed have null snapshots:
  // fall back to a live resolution for those.
  const snapshotVars = (siteRow as { published_variables?: Record<string, string> | null }).published_variables;
  const snapshotReviews = (siteRow as { published_reviews?: ReviewItem[] | null }).published_reviews;

  let vars: Record<string, string>;
  let reviews: ReviewItem[];
  let companyName: string | undefined;
  let logoUrl: string | undefined;
  let phone: string | undefined;

  if (snapshotVars && Object.keys(snapshotVars).length > 0) {
    vars = { ...snapshotVars };
    reviews = Array.isArray(snapshotReviews) ? snapshotReviews : [];
    const layout = deriveLayoutFieldsFromVariables(vars);
    companyName = layout.companyName;
    logoUrl = layout.logoUrl;
    phone = layout.phone;
  } else {
    const resolved = await resolveEnterpriseVariables(supabase, {
      enterprise_id: siteRow.enterprise_id ?? null,
      lead_magnet_project_id: siteRow.lead_magnet_project_id ?? null,
    });
    vars = resolved.variables;
    reviews = resolved.reviews;
    companyName = resolved.companyName;
    logoUrl = resolved.logoUrl;
    phone = resolved.phone;
  }

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
    reviews,
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
