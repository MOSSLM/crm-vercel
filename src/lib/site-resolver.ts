import { createClient } from "@supabase/supabase-js";
import type { SiteConfig, SiteSection, BlogPost, StyleGuide, SiteMenus, SitemapPage, SeoMeta } from "@/types";
import {
  deriveLayoutFieldsFromVariables,
  resolveEnterpriseVariables,
  type ReviewItem,
} from "@/lib/site-builder/resolve-variables";
import { SAMPLE_VARIABLES } from "@/lib/site-builder/claude-design/sample-variables";
import { selectDroppingMissingColumns } from "@/lib/schema-drift";

export type { ReviewItem };

/** shared_assets JSONB shape for a Claude design site. */
type ClaudeSharedAssets = {
  css?: string;
  js?: string;
  scriptLinks?: string[];
  fonts?: string[];
  /** The design's own font/weight/corner tables (see parse-theme-sets.ts). */
  themeSets?: unknown;
};

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
    themeSets: assets?.themeSets ?? null,
  };
}

/**
 * The Supabase project ref the SERVER is configured against ("abcd1234" out of
 * https://abcd1234.supabase.co). Surfaced on the preview failure page so a
 * schema fix is applied to the project the app actually reads, rather than
 * whichever one happens to be open in the dashboard.
 */
export function supabaseProjectRef(): string | null {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  return /^https?:\/\/([^.]+)\./.exec(url)?.[1] ?? null;
}

function getServiceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * A `sites` row as the resolvers read it. Every column is optional on purpose:
 * `selectDroppingMissingColumns` may have dropped any of them, so the reads
 * below must stay defensive rather than assume the full schema is present.
 */
interface SiteRowLike {
  id: string;
  name?: string | null;
  is_published?: boolean | null;
  published_subdomain?: string | null;
  published_domain?: string | null;
  enterprise_id?: number | null;
  paywall_enabled?: boolean | null;
  booking_url?: string | null;
  lead_magnet_project_id?: string | null;
  site_config?: SiteConfig | null;
  style_guide?: StyleGuide | null;
  sitemap?: SitemapPage[] | null;
  published_style_guide?: StyleGuide | null;
  published_site_config?: (Partial<SiteConfig> & { menus?: SiteMenus }) | null;
  published_sitemap?: SitemapPage[] | null;
  published_instances?: Array<unknown> | null;
  published_variables?: Record<string, string> | null;
  published_reviews?: ReviewItem[] | null;
  is_claude_design?: boolean | null;
  shared_assets?: ClaudeSharedAssets | null;
  tweaks?: Record<string, unknown> | null;
  published_shared_assets?: ClaudeSharedAssets | null;
  published_tweaks?: Record<string, unknown> | null;
}

/** Columns read for a PUBLISHED site (`resolveSite`). */
const PUBLISHED_SITE_COLUMNS = [
  "id", "name", "is_published", "published_subdomain", "published_domain", "enterprise_id",
  "paywall_enabled", "booking_url", "lead_magnet_project_id", "site_config", "style_guide",
  "published_style_guide", "published_site_config", "published_sitemap", "published_instances",
  "published_variables", "published_reviews", "is_claude_design", "shared_assets", "tweaks",
  "published_shared_assets", "published_tweaks",
] as const;

/** Columns read for a DRAFT/template site (`resolveDraftSite`). */
const DRAFT_SITE_COLUMNS = [
  "id", "name", "enterprise_id", "paywall_enabled", "booking_url", "lead_magnet_project_id",
  "site_config", "style_guide", "sitemap", "is_claude_design", "shared_assets", "tweaks",
] as const;

function warnDroppedColumns(where: string, dropped: string[]) {
  if (dropped.length === 0) return;
  console.warn(
    `[site-resolver] ${where}: colonnes absentes de la base — ${dropped.join(", ")}. ` +
      `Une migration SQL n'a pas été appliquée sur cet environnement ; ` +
      `les fonctionnalités correspondantes sont désactivées.`,
  );
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
    /** The design's own font/weight/corner tables (see parse-theme-sets.ts).
     *  Each skin defines its own, so a shared hardcoded table would apply the
     *  wrong typeface to every skin but the first. */
    themeSets?: unknown;
  } | null;
}

// Resolve a site by subdomain or custom domain
export async function resolveSite(
  subdomain: string,
  host?: string
): Promise<ResolvedSite | null> {
  const supabase = getServiceClient();

  if (!subdomain && !host) return null;

  const { data: siteRow, error, dropped } = await selectDroppingMissingColumns<SiteRowLike>(
    PUBLISHED_SITE_COLUMNS,
    (select) => {
    // Try subdomain first, then custom domain
    const query = supabase.from("sites").select(select).eq("is_published", true);
    return subdomain
      ? query.eq("published_subdomain", subdomain).single()
      : query.eq("published_domain", host as string).single();
    },
  );
  warnDroppedColumns(`resolveSite(${subdomain || host})`, dropped);
  if (error || !siteRow) {
    // PGRST116 ("no rows") is the ordinary unknown-subdomain case — not worth a
    // log line on every stray request. Anything else is a real failure.
    if (error && error.code !== "PGRST116") {
      console.warn(
        `[site-resolver] resolveSite(${subdomain || host}) → ${error.code ?? "?"} ${error.message}`,
      );
    }
    return null;
  }

  let config: SiteConfig = siteRow.site_config ?? {
    theme: "theme-default",
    settings: {
      colors: { primary: "#1a56db", secondary: "#6b7280", accent: "#f59e0b", background: "#ffffff", text: "#111827" },
      fonts: { heading: "Inter", body: "Inter" },
    },
    pages: [],
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
    isPublished: Boolean(siteRow.is_published),
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
 *
 * Returns a discriminated result rather than a bare null: the failure reason is
 * the whole diagnosis when a preview 404s, and a null threw it away.
 */
/** Machine-readable cause, so the failure page can advise instead of guessing. */
export type DraftFailureKind = "site-missing" | "query-failed";

export type DraftSiteResult =
  | { ok: true; site: ResolvedSite }
  | { ok: false; kind: DraftFailureKind; reason: string };

export async function resolveDraftSite(siteId: string): Promise<DraftSiteResult> {
  const supabase = getServiceClient();

  const { data: siteRow, error, dropped } = await selectDroppingMissingColumns<SiteRowLike>(
    DRAFT_SITE_COLUMNS,
    (select) =>
      supabase.from("sites").select(select).eq("id", siteId).single(),
  );
  warnDroppedColumns(`resolveDraftSite(${siteId})`, dropped);
  // Never fail silently: this used to become a bare 404 on the preview
  // subdomain. Same lesson as api/site-builder/claude/[siteId]/pages/route.ts.
  if (error || !siteRow) {
    // PGRST116 = "no rows" from .single(); anything else is a real query failure.
    const queryFailed = Boolean(error) && error?.code !== "PGRST116";
    const reason = queryFailed
      ? `la requête sur "sites" a échoué (${error?.code ?? "?"}: ${error?.message})`
      : `aucun site n'a l'identifiant ${siteId}`;
    console.warn(`[site-resolver] resolveDraftSite(${siteId}) → ${reason}`);
    return { ok: false, kind: queryFailed ? "query-failed" : "site-missing", reason };
  }

  // Live section instances (no published snapshot) + their defs for native sections.
  const { data: instanceRows, error: instancesError } = await supabase
    .from("site_section_instances")
    .select("*, section_def:site_sections(*)")
    .eq("site_id", siteId)
    .order("sort_order");
  if (instancesError) {
    // Swallowed, this would degrade to an empty page set and a 404 blaming the
    // design ("no sections") for what is really a failed query.
    const reason =
      `la requête sur "site_section_instances" a échoué ` +
      `(${instancesError.code ?? "?"}: ${instancesError.message})`;
    console.warn(`[site-resolver] resolveDraftSite(${siteId}) → ${reason}`);
    return { ok: false, kind: "query-failed", reason };
  }
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
    ok: true,
    site: {
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
    },
  };
}

/**
 * Facts gathered when a draft preview can't render, shown on the preview's
 * failure page so the URL holder sees WHY without reading platform logs.
 * Each query degrades independently: a schema drift lands in `queryErrors`
 * instead of blanking the whole probe.
 */
export interface DraftSiteProbe {
  /** Supabase project ref the SERVER talks to, from SUPABASE_URL. Names which
   *  project to open in the dashboard — the client bundle hardcodes its own in
   *  utils/supabase/info.tsx, and the two are not guaranteed to match. */
  projectRef: string | null;
  siteExists: boolean;
  siteName: string | null;
  isTemplate: boolean;
  /** All live section instances, split on visibility (deduplicated slugs). */
  visibleSlugs: string[];
  hiddenSlugs: string[];
  sitemapSlugs: string[];
  /** Name of a `site_templates` row with this id — the OTHER template system,
   *  whose ids are not previewable on a subdomain. */
  legacyTemplateName: string | null;
  queryErrors: string[];
}

export async function probeDraftSite(siteId: string): Promise<DraftSiteProbe> {
  const supabase = getServiceClient();
  const probe: DraftSiteProbe = {
    projectRef: supabaseProjectRef(),
    siteExists: false,
    siteName: null,
    isTemplate: false,
    visibleSlugs: [],
    hiddenSlugs: [],
    sitemapSlugs: [],
    legacyTemplateName: null,
    queryErrors: [],
  };

  // Two stages: id+name have existed since the table was created, the other
  // columns arrived by migration — keep existence detection immune to drift.
  const { data: site, error: siteErr } = await supabase
    .from("sites")
    .select("id, name")
    .eq("id", siteId)
    .maybeSingle();
  if (siteErr) probe.queryErrors.push(`sites: ${siteErr.code ?? "?"} ${siteErr.message}`);
  if (site) {
    probe.siteExists = true;
    probe.siteName = (site as { name?: string | null }).name ?? null;

    const { data: extra, error: extraErr } = await supabase
      .from("sites")
      .select("is_template, sitemap")
      .eq("id", siteId)
      .maybeSingle();
    if (extraErr) probe.queryErrors.push(`sites (colonnes v2): ${extraErr.code ?? "?"} ${extraErr.message}`);
    probe.isTemplate = Boolean((extra as { is_template?: boolean | null } | null)?.is_template);
    probe.sitemapSlugs = (((extra as { sitemap?: SitemapPage[] | null } | null)?.sitemap) ?? []).map(
      (p) => p.slug,
    );
  }

  const { data: inst, error: instErr } = await supabase
    .from("site_section_instances")
    .select("page_slug, is_hidden")
    .eq("site_id", siteId);
  if (instErr) probe.queryErrors.push(`site_section_instances: ${instErr.code ?? "?"} ${instErr.message}`);
  const visible = new Set<string>();
  const hidden = new Set<string>();
  for (const row of (inst ?? []) as Array<{ page_slug: string; is_hidden?: boolean | null }>) {
    (row.is_hidden ? hidden : visible).add(row.page_slug);
  }
  probe.visibleSlugs = [...visible];
  probe.hiddenSlugs = [...hidden].filter((s) => !visible.has(s));

  if (!probe.siteExists) {
    const { data: tpl } = await supabase
      .from("site_templates")
      .select("name")
      .eq("id", siteId)
      .maybeSingle();
    if (tpl) probe.legacyTemplateName = (tpl as { name?: string | null }).name ?? "(sans nom)";
  }

  return probe;
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
