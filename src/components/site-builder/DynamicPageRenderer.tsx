import React from "react";
import { getServiceClient } from "@/app/api/_lib/service-client";
import type { SiteSectionInstance, SiteSectionDef, StyleGuide, SiteMenus } from "@/types";
import { DEFAULT_STYLE_GUIDE } from "@/types";
import { adaptContentForRender } from "@/lib/site-builder/legacy-content-adapter";
import { generateShadeCSSVars, getContrastColor } from "@/lib/color-utils";
import { buildCtaCSSVars } from "@/lib/button-style";
import {
  deriveMenuOverrides,
  NAVBAR_CATEGORIES,
  FOOTER_CATEGORIES,
  TESTIMONIAL_CATEGORIES,
  STATS_CATEGORIES,
  buildStatsForEnterprise,
  filterBlocksByEnterpriseTags,
  isInstanceVisibleForTags,
} from "@/lib/site-builder/menu-overrides";
import {
  resolveNavbarLayout,
  buildNavbarWrapperStyle,
  HEADROOM_SCRIPT,
  OVERLAY_STICKY_SCRIPT,
} from "@/lib/site-builder/position-layout";
import type { ReviewItem } from "@/lib/site-resolver";
import { extractClassTokens } from "@/lib/library-section/preprocess";
import { generateTailwindCSS } from "@/lib/library-section/tailwind-jit";
import { LibrarySectionInline } from "./LibrarySectionInline";
import { LibrarySectionHydrator } from "./LibrarySectionHydrator";

const SHADOW_MAP: Record<string, string> = {
  none: "none",
  sm: "0 1px 2px rgba(0,0,0,0.05)",
  md: "0 4px 6px -1px rgba(0,0,0,0.10)",
  lg: "0 10px 15px -3px rgba(0,0,0,0.10)",
};

function resolveCardShadow(cards: StyleGuide["cards"]): string {
  if (cards.shadowCustom) {
    const s = cards.shadowCustom;
    return `${s.x}px ${s.y}px ${s.blur}px ${s.spread}px ${s.color}`;
  }
  return SHADOW_MAP[cards.shadow] ?? SHADOW_MAP.md;
}

// Pure server-safe version of styleGuideToCSSVars (no "use client" dependency)
function styleGuideToCSSVars(sg: StyleGuide): React.CSSProperties {
  return {
    "--color-primary": sg.colors.primary,
    "--color-secondary": sg.colors.secondary,
    "--color-accent": sg.colors.accent,
    "--color-background": sg.colors.background,
    "--color-bg-alt": sg.colors.backgroundAlt,
    "--color-text": sg.colors.text,
    "--color-text-muted": sg.colors.textMuted,
    "--font-heading": sg.fonts.heading + ", Inter, sans-serif",
    "--font-body": sg.fonts.body + ", Inter, sans-serif",
    "--font-base-size": sg.fonts.baseSize,
    // Tailwind-friendly colour aliases (mirror iframe shell so sections that
    // reference var(--tw-primary) etc. render identically on the deployed site).
    "--tw-primary": sg.colors.primary,
    "--tw-secondary": sg.colors.secondary,
    "--tw-accent": sg.colors.accent,
    "--card-radius": sg.cards.borderRadius,
    "--card-shadow": resolveCardShadow(sg.cards),
    "--card-padding": sg.cards.padding,
    "--card-border-width": sg.cards.borderWidth ?? "0px",
    "--card-border-color": sg.cards.borderColor ?? "transparent",
    "--card-image-radius": sg.cards.imageRadius ?? sg.cards.borderRadius,
    "--section-padding": sg.spacing.sectionPadding,
    "--element-gap": sg.spacing.elementGap,
    "--max-content-width": sg.spacing.maxContentWidth,
    ...buildCtaCSSVars(sg),
    ...generateShadeCSSVars(sg.colors),
  } as React.CSSProperties;
}

// Scoped reset applied only inside [data-lsi] wrappers, so library sections
// inherit the style guide tokens without polluting native sections.
const LIBRARY_SCOPED_CSS = `
[data-lsi] * { box-sizing: border-box; }
[data-lsi] h1,[data-lsi] h2,[data-lsi] h3,[data-lsi] h4,[data-lsi] h5,[data-lsi] h6 {
  font-family: var(--font-heading, Inter, sans-serif) !important;
}
[data-lsi] body,[data-lsi] p,[data-lsi] span,[data-lsi] a,
[data-lsi] button,[data-lsi] input,[data-lsi] textarea,[data-lsi] select,[data-lsi] li {
  font-family: var(--font-body, Inter, sans-serif);
}
[data-lsi] .card,[data-lsi] [class*="shadow-"],[data-lsi] .rounded-card {
  border-radius: var(--card-radius) !important;
}
[data-lsi] img,[data-lsi] picture,[data-lsi] video {
  border-radius: var(--card-image-radius);
}
/* Prevent images escaping their container on the deployed site. We avoid
   !important on height so sections that explicitly size their images via
   classes like h-full (e.g. carousel tiles in Layout414) keep working;
   forcing height: auto !important would distort their aspect ratios and
   make the parent overflow: hidden clip the bottom (= reported "rounded
   only on top" bug). The synchronously-loaded Tailwind CDN provides the
   same defaults via its preflight. */
[data-lsi] img,[data-lsi] picture,[data-lsi] video { max-width: 100%; }
[data-lsi] .cta-primary {
  background-color: var(--btn-primary-bg) !important;
  color: var(--btn-primary-text) !important;
  border: var(--btn-primary-border-width) solid var(--btn-primary-border-color) !important;
  border-radius: var(--btn-primary-radius) !important;
  padding: var(--btn-primary-padding) !important;
  box-shadow: var(--btn-primary-shadow) !important;
  transition: transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease;
}
[data-lsi] .cta-secondary {
  background-color: var(--btn-secondary-bg) !important;
  color: var(--btn-secondary-text) !important;
  border: var(--btn-secondary-border-width) solid var(--btn-secondary-border-color) !important;
  border-radius: var(--btn-secondary-radius) !important;
  padding: var(--btn-secondary-padding) !important;
  box-shadow: var(--btn-secondary-shadow) !important;
  transition: transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease;
}
[data-lsi] .cta-primary:hover { filter: brightness(0.92); transform: translateY(-1px); }
[data-lsi] .cta-secondary:hover { filter: brightness(0.96); transform: translateY(-1px); }
`;

interface DynamicPageRendererProps {
  siteId: string;
  pageSlug: string;
  styleGuide?: StyleGuide | null;
  variables?: Record<string, string>;
  reviews?: ReviewItem[];
  /** Global site menus snapshot. Injected into navbar/footer sections. */
  menus?: SiteMenus | null;
  /** Pre-loaded published snapshot of instances. When provided, skips the DB query. */
  preloadedInstances?: Array<unknown> | null;
}

/** Server component: renders a dynamic-sections page for the public site */
export async function DynamicPageRenderer({ siteId, pageSlug, styleGuide, variables = {}, reviews = [], menus, preloadedInstances }: DynamicPageRendererProps) {
  const supabase = getServiceClient();

  type RenderInstance = SiteSectionInstance & { section_def: SiteSectionDef | null };
  const allInstances = (preloadedInstances ?? []) as RenderInstance[];

  let instances: RenderInstance[];
  if (preloadedInstances) {
    instances = allInstances
      .filter((inst) => inst.page_slug === pageSlug && !inst.is_hidden)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  } else {
    const { data: instanceRows } = await supabase
      .from("site_section_instances")
      .select(`
        *,
        section_def:site_sections (*)
      `)
      .eq("site_id", siteId)
      .eq("page_slug", pageSlug)
      .eq("is_hidden", false)
      .order("sort_order");
    instances = (instanceRows ?? []) as RenderInstance[];
  }

  // Drop sections tagged with a service the enterprise doesn't have.
  instances = instances.filter((inst) =>
    isInstanceVisibleForTags(inst.content as Record<string, unknown> | null, variables),
  );

  const guide = styleGuide ?? DEFAULT_STYLE_GUIDE;
  const cssVars = styleGuideToCSSVars(guide);

  // Home navbar / footer are inherited by every other page so the chrome is
  // defined once (on the home page) and stays consistent everywhere.
  const homeChrome =
    pageSlug !== "/" && preloadedInstances
      ? allInstances
          .filter((i) => i.page_slug === "/" && !i.is_hidden)
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      : [];

  const refOf = (inst: { content?: unknown }) =>
    (inst.content as Record<string, unknown> | null)?.__library as
      | { theme_slug: string; section_id: string }
      | undefined;

  // Resolve every library section's theme code/category in one query —
  // covering both this page's sections and the inherited home chrome.
  const themeSectionMap = new Map<string, { code: string; example_data: Record<string, unknown> | null; category: string | null }>();
  const lookupRefs = [...instances, ...homeChrome]
    .map(refOf)
    .filter((r): r is { theme_slug: string; section_id: string } => Boolean(r));
  if (lookupRefs.length > 0) {
    const themeSlugs = [...new Set(lookupRefs.map((r) => r.theme_slug))];
    const { data: themeSections } = await supabase
      .from("theme_sections")
      .select("theme_slug, section_id, code, example_data, category")
      .in("theme_slug", themeSlugs);
    for (const ts of themeSections ?? []) {
      themeSectionMap.set(`${ts.theme_slug}:${ts.section_id}`, {
        code: ts.code,
        example_data: ts.example_data,
        category: ts.category ?? null,
      });
    }
  }

  const categoryOf = (inst: RenderInstance): string | null => {
    if (inst.section_def?.category) return inst.section_def.category;
    const ref = refOf(inst);
    return ref ? themeSectionMap.get(`${ref.theme_slug}:${ref.section_id}`)?.category ?? null : null;
  };

  // Prepend home's navbar / append home's footer when this page has none.
  if (homeChrome.length > 0) {
    const has = (set: Set<string>) =>
      instances.some((i) => { const c = categoryOf(i); return !!c && set.has(c); });
    if (!has(NAVBAR_CATEGORIES)) {
      const navbars = homeChrome.filter((i) => { const c = categoryOf(i); return !!c && NAVBAR_CATEGORIES.has(c); });
      instances = [...navbars, ...instances];
    }
    if (!has(FOOTER_CATEGORIES)) {
      const footers = homeChrome.filter((i) => { const c = categoryOf(i); return !!c && FOOTER_CATEGORIES.has(c); });
      instances = [...instances, ...footers];
    }
  }

  if (instances.length === 0) {
    return (
      <div style={{ padding: "80px 24px", textAlign: "center", color: "#6b7280" }}>
        Aucun contenu pour cette page.
      </div>
    );
  }

  // Library refs for the FINAL instances list (drives Tailwind JIT + render).
  const libRefs = instances
    .map(refOf)
    .filter((ref): ref is { theme_slug: string; section_id: string } => Boolean(ref));

  // Aggregate Tailwind class tokens from all library section codes and
  // generate a single CSS blob for the page (cached by token hash).
  const hasLibrarySections = libRefs.length > 0;
  let tailwindCss = "";
  if (hasLibrarySections) {
    const allTokens: string[] = [];
    for (const ts of themeSectionMap.values()) {
      allTokens.push(...extractClassTokens(ts.code ?? ""));
    }
    tailwindCss = await generateTailwindCSS(allTokens);
  }

  return (
    <div style={{ ...cssVars, fontFamily: "var(--font-body)", color: "var(--color-text)" } as React.CSSProperties}>
      {/* Inject library-section styles once for the whole page */}
      {hasLibrarySections && (
        <>
          <style
            data-library-styles
            dangerouslySetInnerHTML={{
              __html: tailwindCss + LIBRARY_SCOPED_CSS,
            }}
          />
          {/* Tailwind CDN as a runtime fallback — generateTailwindCSS extracts
              class tokens via regex and misses ternaries, template-string
              interpolations, and object-map classes. Loaded SYNCHRONOUSLY
              (no async / defer) so it's available before the browser paints
              the section HTML. With async/defer, first paint used incomplete
              CSS → images rendered at natural size, layout flashed when CDN
              caught up. The +200-300ms TTFB cost is deliberate: we trade it
              for stable, consistent rendering across reloads on a marketing
              site. Replace once Tailwind extraction is AST-complete. */}
          {/* eslint-disable-next-line @next/next/no-sync-scripts */}
          <script src="https://cdn.tailwindcss.com" />
        </>
      )}

      {instances.map((instance) => {
        const sectionDef = instance.section_def;
        const libRef = (instance.content as Record<string, unknown> | null)?.__library as { theme_slug: string; section_id: string } | undefined;
        const libThemeSection = libRef ? themeSectionMap.get(`${libRef.theme_slug}:${libRef.section_id}`) : null;
        // For library sections section_def is null; pull category from theme_sections instead.
        const category: string | null = sectionDef?.category ?? libThemeSection?.category ?? null;
        const menuOverrides = deriveMenuOverrides(category, menus ?? undefined);
        const isNavbar = !!category && NAVBAR_CATEGORIES.has(category);
        const isTestimonial = !!category && TESTIMONIAL_CATEGORIES.has(category);
        const navLayout = isNavbar ? resolveNavbarLayout(instance.content as Record<string, unknown>) : null;
        const navWrapperStyle = navLayout ? buildNavbarWrapperStyle(navLayout) : undefined;

        const testimonialOverrides: Record<string, unknown> = {};
        if (isTestimonial && reviews.length > 0) {
          const existing = (instance.content as Record<string, unknown> | null)?.testimonials;
          const hasCustom = Array.isArray(existing) && existing.length > 0;
          if (!hasCustom) {
            testimonialOverrides.testimonials = reviews.slice(0, 6);
            testimonialOverrides.reviews = reviews.slice(0, 6);
          }
          testimonialOverrides.hasReviews = reviews.length > 0;
        }

        const isStats = !!category && STATS_CATEGORIES.has(category);
        const statsOverrides: Record<string, unknown> = {};
        if (isStats) {
          const stats = buildStatsForEnterprise(variables);
          if (stats && stats.length > 0) {
            const existing = (instance.content as Record<string, unknown> | null)?.stats;
            const hasCustom = Array.isArray(existing) && existing.length > 0;
            if (!hasCustom) statsOverrides.stats = stats;
            statsOverrides.hasStats = true;
          } else {
            statsOverrides.hasStats = false;
          }
        }

        // Filter blocks by enterprise service_tags. The filtered list is passed
        // both to LibrarySectionInline (which uses content adapter) and to the
        // native renderer (DynamicSectionPublic), replacing `instance.blocks`.
        const filteredBlocks = filterBlocksByEnterpriseTags(instance.blocks ?? [], variables);

        const adaptiveOverrides = { ...testimonialOverrides, ...statsOverrides };

        // Library section: render inline (SSR) — no iframe
        if (libRef) {
          const ts = libThemeSection;
          if (!ts?.code) return null;
          // adaptContentForRender folds blocks into the content via legacy
          // mappings. For library sections we apply it here so the filtered
          // blocks list (rather than instance.blocks) drives the result.
          const content = {
            ...(ts.example_data ?? {}),
            ...(instance.content as Record<string, unknown> ?? {}),
            ...menuOverrides,
            ...adaptiveOverrides,
            ...adaptContentForRender({}, filteredBlocks),
          };
          const node = (
            <LibrarySectionInline
              key={instance.id}
              instanceId={instance.id}
              code={ts.code}
              content={content}
              styleGuide={guide}
              variables={variables}
            />
          );
          if (navLayout && navLayout.position !== "static") {
            return (
              <div
                key={instance.id}
                data-navbar-wrapper={instance.id}
                data-headroom={navLayout.headroom ? "1" : undefined}
                data-overlay={navLayout.overlay ? "1" : undefined}
                data-top-offset={navLayout.overlay ? String(navLayout.topOffset) : undefined}
                style={navWrapperStyle}
              >
                {node}
              </div>
            );
          }
          return node;
        }

        // Native section with structure: render server-side
        if (!sectionDef) return null;
        const native = (
          <DynamicSectionPublic
            key={instance.id}
            instance={{ ...instance, blocks: filteredBlocks }}
            sectionDef={sectionDef}
            guide={guide}
            variables={variables}
            reviews={reviews}
            menuOverrides={{ ...menuOverrides, ...adaptiveOverrides }}
          />
        );
        if (navLayout && navLayout.position !== "static") {
          return (
            <div
              key={instance.id}
              data-navbar-wrapper={instance.id}
              data-headroom={navLayout.headroom ? "1" : undefined}
              data-overlay={navLayout.overlay ? "1" : undefined}
              data-top-offset={navLayout.overlay ? String(navLayout.topOffset) : undefined}
              style={navWrapperStyle}
            >
              {native}
            </div>
          );
        }
        return native;
      })}

      {/* Headroom: hide-on-scroll-down for sticky/fixed navbars */}
      {instances.some(
        (i) => i.section_def?.category === "navigation" && resolveNavbarLayout(i.content as Record<string, unknown>).headroom,
      ) && (
        <script dangerouslySetInnerHTML={{ __html: HEADROOM_SCRIPT }} />
      )}

      {/* Overlay-sticky: navbar floats over first section, promotes to fixed on scroll */}
      {instances.some(
        (i) => i.section_def?.category === "navigation" && resolveNavbarLayout(i.content as Record<string, unknown>).overlay,
      ) && (
        <script dangerouslySetInnerHTML={{ __html: OVERLAY_STICKY_SCRIPT }} />
      )}

      {/* Mount interactive React on each library section after hydration */}
      {hasLibrarySections && <LibrarySectionHydrator />}
    </div>
  );
}

// ─── Static section renderer (server-side, no editor chrome) ─────────────────

function resolveVal(val: unknown, content: Record<string, unknown>, variables: Record<string, string> = {}): unknown {
  if (typeof val !== "string") return val;
  return val.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
    const k = key.trim();
    const resolved = content[k] ?? variables[k];
    return resolved !== undefined && resolved !== null ? String(resolved) : "";
  });
}

interface DynamicSectionPublicProps {
  instance: SiteSectionInstance;
  sectionDef: SiteSectionDef;
  guide: StyleGuide;
  variables?: Record<string, string>;
  reviews?: ReviewItem[];
  menuOverrides?: Record<string, unknown>;
}

function DynamicSectionPublic({ instance, sectionDef, guide, variables = {}, reviews = [], menuOverrides = {} }: DynamicSectionPublicProps) {
  const { structure } = sectionDef;
  const adapted = adaptContentForRender(instance.content ?? {}, instance.blocks ?? []);
  const content = { ...sectionDef.default_content, ...adapted, ...menuOverrides };

  if (reviews.length > 0 && sectionDef.type === "testimonials") {
    const existing = content.testimonials as Array<unknown> | undefined;
    const isPlaceholder = !existing || existing.length === 0 ||
      (existing.length > 0 && typeof existing[0] === "object" &&
        (existing[0] as Record<string, string>).name?.startsWith("Marie"));
    if (isPlaceholder) {
      content.testimonials = reviews;
    }
  }
  const cssVars = styleGuideToCSSVars(guide);

  const padding = structure.padding ?? {};
  const layoutStyle = getLayoutStyle(structure.layout);

  const sectionStyle: React.CSSProperties = {
    ...cssVars,
    paddingTop: padding.top ?? guide.spacing.sectionPadding,
    paddingBottom: padding.bottom ?? guide.spacing.sectionPadding,
    paddingLeft: padding.left ?? "24px",
    paddingRight: padding.right ?? "24px",
    backgroundColor: structure.background ?? guide.colors.background,
    ...(instance.custom_style as React.CSSProperties ?? {}),
  };

  // Section-level gap override: a `gap` set in custom_style targets the inner
  // flex/grid wrapper (not the <section>), so a section can relax a too-tight
  // forced gap without touching the global style guide. Additive — falls back
  // to the section's own layout gap.
  const customGap = (instance.custom_style as Record<string, unknown> | undefined)?.gap;
  const innerStyle: React.CSSProperties = {
    ...layoutStyle,
    ...(typeof customGap === "string" && customGap ? { gap: customGap } : {}),
    maxWidth: guide.spacing.maxContentWidth,
    margin: "0 auto",
    width: "100%",
  };

  return (
    <section style={sectionStyle}>
      <div style={innerStyle}>
        {structure.snippets.map((snippet) => (
          <StaticSnippet key={snippet.id} snippet={snippet} content={content} guide={guide} variables={variables} reviews={reviews} />
        ))}
      </div>
    </section>
  );
}

function getLayoutStyle(layout: SiteSectionDef["structure"]["layout"]): React.CSSProperties {
  const alignMap: Record<string, string> = { left: "flex-start", center: "center", right: "flex-end" };

  if (layout.type === "grid") {
    const cols = Array.isArray(layout.columns)
      ? layout.columns.map(() => "1fr").join(" ")
      : `repeat(${layout.columns ?? 2}, minmax(0, 1fr))`;
    return { display: "grid", gridTemplateColumns: cols, gap: layout.gap ?? "24px", alignItems: "center" };
  }
  if (layout.type === "flex-row") {
    return {
      display: "flex", flexDirection: "row", flexWrap: "wrap",
      gap: layout.gap ?? "24px",
      justifyContent: alignMap[layout.align ?? "left"],
      alignItems: "center",
    };
  }
  return {
    display: "flex", flexDirection: "column",
    gap: layout.gap ?? "24px",
    alignItems: alignMap[layout.align ?? "left"],
  };
}

// ─── Static snippet (SSR, no interactivity) ────────────────────────────────────────────

import type { SnippetDefinition } from "@/types";

function StaticSnippet({ snippet, content, guide, variables = {}, reviews = [] }: { snippet: SnippetDefinition; content: Record<string, unknown>; guide: StyleGuide; variables?: Record<string, string>; reviews?: ReviewItem[] }) {
  const rp = (key: string) => String(resolveVal(snippet.props[key], content, variables) ?? "");

  if (snippet.type === "heading") {
    const Tag = `h${Math.min(Math.max(parseInt(rp("level")) || 2, 1), 6)}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
    const sizeMap: Record<number, string> = { 1: "2.5rem", 2: "2rem", 3: "1.5rem", 4: "1.25rem", 5: "1.1rem", 6: "1rem" };
    const level = parseInt(rp("level")) || 2;
    return (
      <Tag style={{ fontFamily: guide.fonts.heading + ", Inter, sans-serif", fontSize: sizeMap[level] ?? "2rem", fontWeight: 700, color: rp("color") || guide.colors.text, textAlign: (rp("align") as React.CSSProperties["textAlign"]) || "left", lineHeight: 1.2, margin: 0 }}>
        {rp("text")}
      </Tag>
    );
  }

  if (snippet.type === "paragraph") {
    return (
      <p style={{ fontFamily: guide.fonts.body + ", Inter, sans-serif", color: rp("color") || guide.colors.textMuted, textAlign: (rp("align") as React.CSSProperties["textAlign"]) || "left", maxWidth: rp("maxWidth") || undefined, margin: rp("align") === "center" ? "0 auto" : 0, lineHeight: 1.7 }}>
        {rp("text")}
      </p>
    );
  }

  if (snippet.type === "badge") {
    return (
      <div style={{ textAlign: (rp("align") as React.CSSProperties["textAlign"]) || "left" }}>
        <span style={{ display: "inline-flex", alignItems: "center", padding: "4px 12px", borderRadius: "9999px", fontSize: "0.875rem", fontWeight: 600, backgroundColor: `${guide.colors.primary}18`, color: guide.colors.primary }}>
          {rp("text")}
        </span>
      </div>
    );
  }

  if (snippet.type === "button") {
    const btnStyle = guide.buttons.style;
    const btnBg = btnStyle === "outline" ? "transparent" : btnStyle === "soft" ? guide.colors.primary + "22" : guide.colors.primary;
    const btnText = btnStyle === "filled" ? getContrastColor(guide.colors.primary) : guide.colors.primary;
    const btnBorder = btnStyle === "soft" ? "transparent" : guide.colors.primary;
    return (
      <a href={rp("href") || "#"} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: guide.buttons.padding, borderRadius: guide.buttons.borderRadius, backgroundColor: btnBg, color: btnText, textDecoration: "none", fontWeight: 600, border: `2px solid ${btnBorder}` }}>
        {rp("text")}
      </a>
    );
  }

  if (snippet.type === "image") {
    const src = rp("src");
    if (!src) return null;
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={rp("alt")} style={{ width: rp("width") || "100%", borderRadius: rp("borderRadius") || guide.cards.borderRadius, display: "block", objectFit: "cover" }} />;
  }

  if (snippet.type === "flex-col" && snippet.children) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: guide.spacing.elementGap, flex: snippet.props.flex as number | undefined }}>
        {snippet.children.map((child) => (
          <StaticSnippet key={child.id} snippet={child} content={content} guide={guide} variables={variables} reviews={reviews} />
        ))}
      </div>
    );
  }

  if (snippet.type === "card-grid") {
    const cards = (content[snippet.props.cards as string] ?? snippet.props.cards) as Array<{ icon?: string; title?: string; description?: string }> ?? [];
    const cols = Number(snippet.props.columns) || 3;
    return (
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: guide.spacing.elementGap, width: "100%" }}>
        {cards.map((card, i) => (
          <div key={i} style={{ backgroundColor: guide.colors.backgroundAlt, borderRadius: guide.cards.borderRadius, padding: guide.cards.padding, display: "flex", flexDirection: "column", gap: "12px" }}>
            {card.title && <h3 style={{ fontFamily: guide.fonts.heading + ", Inter, sans-serif", fontWeight: 600, color: guide.colors.text, margin: 0 }}>{card.title}</h3>}
            {card.description && <p style={{ color: guide.colors.textMuted, fontSize: "0.875rem", lineHeight: 1.6, margin: 0 }}>{card.description}</p>}
          </div>
        ))}
      </div>
    );
  }

  if (snippet.type === "testimonial-grid") {
    const fromContent = (content[snippet.props.testimonials as string] ?? snippet.props.testimonials) as Array<{ name?: string; role?: string; text?: string; rating?: number }> | undefined;
    const testimonials = (fromContent && fromContent.length > 0 ? fromContent : reviews.length > 0 ? reviews : []) as Array<{ name?: string; role?: string; text?: string; rating?: number }>;
    const cols = Number(snippet.props.columns) || 3;
    return (
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: guide.spacing.elementGap, width: "100%" }}>
        {testimonials.map((t, i) => (
          <div key={i} style={{ backgroundColor: guide.colors.backgroundAlt, borderRadius: guide.cards.borderRadius, padding: guide.cards.padding }}>
            {t.rating && <div style={{ color: "#f59e0b", marginBottom: "8px" }}>{"★".repeat(t.rating)}</div>}
            {t.text && <p style={{ color: guide.colors.textMuted, fontStyle: "italic", fontSize: "0.875rem", margin: "0 0 12px 0" }}>"{ t.text}"</p>}
            {t.name && <div style={{ fontWeight: 600, color: guide.colors.text, fontSize: "0.875rem" }}>{t.name}</div>}
            {t.role && <div style={{ color: guide.colors.textMuted, fontSize: "0.75rem" }}>{t.role}</div>}
          </div>
        ))}
      </div>
    );
  }

  if (snippet.type === "stat-grid") {
    const stats = (content[snippet.props.stats as string] ?? snippet.props.stats) as Array<{ value?: string; label?: string }> ?? [];
    const cols = Number(snippet.props.columns) || 4;
    return (
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: guide.spacing.elementGap, width: "100%" }}>
        {stats.map((s, i) => (
          <div key={i} style={{ textAlign: "center", padding: "24px", backgroundColor: guide.colors.backgroundAlt, borderRadius: guide.cards.borderRadius }}>
            <div style={{ fontSize: "2rem", fontWeight: 700, color: guide.colors.primary, fontFamily: guide.fonts.heading + ", Inter, sans-serif" }}>{s.value}</div>
            <div style={{ color: guide.colors.textMuted, fontSize: "0.875rem", marginTop: "4px" }}>{s.label}</div>
          </div>
        ))}
      </div>
    );
  }

  if (snippet.type === "faq-accordion") {
    const faqs = (content[snippet.props.items as string] ?? snippet.props.items) as Array<{ question?: string; answer?: string }> ?? [];
    return (
      <div style={{ width: "100%", maxWidth: "768px", margin: "0 auto" }}>
        {faqs.map((faq, i) => (
          <div key={i} style={{ borderBottom: `1px solid ${guide.colors.backgroundAlt}`, padding: "16px 0" }}>
            <div style={{ fontWeight: 600, color: guide.colors.text, marginBottom: "8px" }}>{faq.question}</div>
            <div style={{ color: guide.colors.textMuted, fontSize: "0.875rem", lineHeight: 1.6 }}>{faq.answer}</div>
          </div>
        ))}
      </div>
    );
  }

  if (snippet.type === "contact-info") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {rp("phone") && <div style={{ color: guide.colors.text, fontSize: "0.875rem" }}>📞 <a href={`tel:${rp("phone")}`} style={{ color: "inherit" }}>{rp("phone")}</a></div>}
        {rp("email") && <div style={{ color: guide.colors.text, fontSize: "0.875rem" }}>✉️ <a href={`mailto:${rp("email")}`} style={{ color: "inherit" }}>{rp("email")}</a></div>}
        {rp("address") && <div style={{ color: guide.colors.text, fontSize: "0.875rem" }}>📍 {rp("address")}</div>}
      </div>
    );
  }

  return null;
}
