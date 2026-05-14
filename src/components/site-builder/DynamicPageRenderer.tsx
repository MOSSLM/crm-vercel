import React from "react";
import { getSupabaseServiceClient } from "@/lib/supabase-service";
import type { SiteSectionInstance, SiteSectionDef, StyleGuide } from "@/types";
import { DEFAULT_STYLE_GUIDE } from "@/types";
import { adaptContentForRender } from "@/lib/site-builder/legacy-content-adapter";
import { generateShadeCSSVars } from "@/lib/color-utils";
import { buildCtaCSSVars } from "@/lib/button-style";
import type { ReviewItem } from "@/lib/site-resolver";
import { LibrarySectionIframe } from "./LibrarySectionIframe";

// Pure server-safe version of styleGuideToCSSVars (no "use client" dependency)
function styleGuideToCSSVars(sg: StyleGuide): React.CSSProperties {
  const shadowMap: Record<string, string> = {
    none: "none",
    sm: "0 1px 2px rgba(0,0,0,0.05)",
    md: "0 4px 6px -1px rgba(0,0,0,0.10)",
    lg: "0 10px 15px -3px rgba(0,0,0,0.10)",
  };
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
    "--card-radius": sg.cards.borderRadius,
    "--card-shadow": shadowMap[sg.cards.shadow] ?? shadowMap.md,
    "--card-padding": sg.cards.padding,
    "--section-padding": sg.spacing.sectionPadding,
    "--element-gap": sg.spacing.elementGap,
    "--max-content-width": sg.spacing.maxContentWidth,
    ...buildCtaCSSVars(sg),
    ...generateShadeCSSVars(sg.colors),
  } as React.CSSProperties;
}

interface DynamicPageRendererProps {
  siteId: string;
  pageSlug: string;
  styleGuide?: StyleGuide | null;
  variables?: Record<string, string>;
  reviews?: ReviewItem[];
}

/** Server component: renders a dynamic-sections page for the public site */
export async function DynamicPageRenderer({ siteId, pageSlug, styleGuide, variables = {}, reviews = [] }: DynamicPageRendererProps) {
  const supabase = getSupabaseServiceClient();

  // Fetch instances with joined section definitions
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

  const instances = (instanceRows ?? []) as (SiteSectionInstance & { section_def: SiteSectionDef | null })[];
  const guide = styleGuide ?? DEFAULT_STYLE_GUIDE;
  const cssVars = styleGuideToCSSVars(guide);

  if (instances.length === 0) {
    return (
      <div style={{ padding: "80px 24px", textAlign: "center", color: "#6b7280" }}>
        Aucun contenu pour cette page.
      </div>
    );
  }

  // Collect library refs (section_def is null) and fetch their theme_sections code
  const libRefs = instances
    .map((inst) => (inst.content as Record<string, unknown> | null)?.__library as { theme_slug: string; section_id: string } | undefined)
    .filter((ref): ref is { theme_slug: string; section_id: string } => Boolean(ref));

  const themeSectionMap = new Map<string, { code: string; example_data: Record<string, unknown> | null }>();
  if (libRefs.length > 0) {
    const themeSlugs = [...new Set(libRefs.map((r) => r.theme_slug))];
    const { data: themeSections } = await supabase
      .from("theme_sections")
      .select("theme_slug, section_id, code, example_data")
      .in("theme_slug", themeSlugs);
    for (const ts of themeSections ?? []) {
      themeSectionMap.set(`${ts.theme_slug}:${ts.section_id}`, { code: ts.code, example_data: ts.example_data });
    }
  }

  return (
    <div style={{ ...cssVars, fontFamily: "var(--font-body)", color: "var(--color-text)" } as React.CSSProperties}>
      {instances.map((instance) => {
        const sectionDef = instance.section_def;
        const libRef = (instance.content as Record<string, unknown> | null)?.__library as { theme_slug: string; section_id: string } | undefined;

        // Library section: render via iframe (client component)
        if (libRef) {
          const ts = themeSectionMap.get(`${libRef.theme_slug}:${libRef.section_id}`);
          if (!ts?.code) return null;
          const content = { ...(ts.example_data ?? {}), ...(instance.content as Record<string, unknown> ?? {}) };
          return (
            <LibrarySectionIframe
              key={instance.id}
              code={ts.code}
              content={content}
              styleGuide={guide}
              variables={variables}
            />
          );
        }

        // Native section with structure: render server-side
        if (!sectionDef) return null;
        return (
          <DynamicSectionPublic key={instance.id} instance={instance} sectionDef={sectionDef} guide={guide} variables={variables} reviews={reviews} />
        );
      })}
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
}

function DynamicSectionPublic({ instance, sectionDef, guide, variables = {}, reviews = [] }: DynamicSectionPublicProps) {
  const { structure } = sectionDef;
  const adapted = adaptContentForRender(instance.content ?? {}, instance.blocks ?? []);
  const content = { ...sectionDef.default_content, ...adapted };

  // Auto-inject reviews into testimonial sections when the site has linked reviews
  // and the section content hasn't been manually overridden with real testimonials.
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

  const innerStyle: React.CSSProperties = {
    ...layoutStyle,
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
