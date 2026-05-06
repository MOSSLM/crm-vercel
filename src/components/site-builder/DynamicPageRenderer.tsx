import React from "react";
import { createClient } from "@supabase/supabase-js";
import type { SiteSectionInstance, SiteSectionDef, StyleGuide } from "@/types";
import { DEFAULT_STYLE_GUIDE } from "@/types";
import { styleGuideToCSSVars } from "./DynamicSectionRenderer";
import { adaptContentForRender } from "@/lib/site-builder/legacy-content-adapter";

interface DynamicPageRendererProps {
  siteId: string;
  pageSlug: string;
  styleGuide?: StyleGuide | null;
}

/** Server component: renders a dynamic-sections page for the public site */
export async function DynamicPageRenderer({ siteId, pageSlug, styleGuide }: DynamicPageRendererProps) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

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

  const instances = (instanceRows ?? []) as (SiteSectionInstance & { section_def: SiteSectionDef })[];
  const guide = styleGuide ?? DEFAULT_STYLE_GUIDE;
  const cssVars = styleGuideToCSSVars(guide);

  if (instances.length === 0) {
    return (
      <div style={{ padding: "80px 24px", textAlign: "center", color: "#6b7280" }}>
        Aucun contenu pour cette page.
      </div>
    );
  }

  return (
    <div style={{ ...cssVars, fontFamily: "var(--font-body)", color: "var(--color-text)" } as React.CSSProperties}>
      {instances.map((instance) => {
        const sectionDef = instance.section_def;
        if (!sectionDef) return null;
        return (
          <DynamicSectionPublic key={instance.id} instance={instance} sectionDef={sectionDef} guide={guide} />
        );
      })}
    </div>
  );
}

// ─── Static section renderer (server-side, no editor chrome) ─────────────────

function resolveVal(val: unknown, content: Record<string, unknown>): unknown {
  if (typeof val !== "string") return val;
  return val.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
    const resolved = content[key.trim()];
    return resolved !== undefined && resolved !== null ? String(resolved) : "";
  });
}

interface DynamicSectionPublicProps {
  instance: SiteSectionInstance;
  sectionDef: SiteSectionDef;
  guide: StyleGuide;
}

function DynamicSectionPublic({ instance, sectionDef, guide }: DynamicSectionPublicProps) {
  const { structure } = sectionDef;
  const adapted = adaptContentForRender(instance.content ?? {}, instance.blocks ?? []);
  const content = { ...sectionDef.default_content, ...adapted };
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
          <StaticSnippet key={snippet.id} snippet={snippet} content={content} guide={guide} />
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

// ─── Static snippet (SSR, no interactivity) ───────────────────────────────────

import type { SnippetDefinition } from "@/types";

function StaticSnippet({ snippet, content, guide }: { snippet: SnippetDefinition; content: Record<string, unknown>; guide: StyleGuide }) {
  const rp = (key: string) => String(resolveVal(snippet.props[key], content) ?? "");

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
    return (
      <a href={rp("href") || "#"} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: guide.buttons.padding, borderRadius: guide.buttons.borderRadius, backgroundColor: guide.colors.primary, color: "#fff", textDecoration: "none", fontWeight: 600, border: `2px solid ${guide.colors.primary}` }}>
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
          <StaticSnippet key={child.id} snippet={child} content={content} guide={guide} />
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
    const testimonials = (content[snippet.props.testimonials as string] ?? snippet.props.testimonials) as Array<{ name?: string; role?: string; text?: string; rating?: number }> ?? [];
    const cols = Number(snippet.props.columns) || 3;
    return (
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: guide.spacing.elementGap, width: "100%" }}>
        {testimonials.map((t, i) => (
          <div key={i} style={{ backgroundColor: guide.colors.backgroundAlt, borderRadius: guide.cards.borderRadius, padding: guide.cards.padding }}>
            {t.rating && <div style={{ color: "#f59e0b", marginBottom: "8px" }}>{"★".repeat(t.rating)}</div>}
            {t.text && <p style={{ color: guide.colors.textMuted, fontStyle: "italic", fontSize: "0.875rem", margin: "0 0 12px 0" }}>"{t.text}"</p>}
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
