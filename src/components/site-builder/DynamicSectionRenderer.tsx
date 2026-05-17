"use client";

import React, { useEffect, useState } from "react";
import type { SiteSectionInstance, SiteSectionDef, StyleGuide, SiteMenus } from "@/types";
import { SnippetRenderer } from "./dynamic-snippets";
import { LibrarySectionIframe, type IframeElementClickInfo, type IframeDomTreeNode } from "./LibrarySectionIframe";
import { adaptContentForRender } from "@/lib/site-builder/legacy-content-adapter";
import {
  resolveColorScheme,
  generateShadeCSSVars,
  type ColorSchemePreset,
  type SectionColorScheme,
} from "@/lib/color-utils";
import { buildCtaCSSVars } from "@/lib/button-style";
import { deriveMenuOverrides, TESTIMONIAL_CATEGORIES } from "@/lib/site-builder/menu-overrides";

interface DynamicSectionRendererProps {
  instance: SiteSectionInstance;
  sectionDef: SiteSectionDef;
  styleGuide: StyleGuide;
  /** Enterprise variables (entreprise.nom, entreprise.telephone, etc.) */
  variables?: Record<string, string>;
  /** Site menus injected into navbar/footer sections automatically */
  menus?: SiteMenus;
  /** Editor mode: shows selection highlight and click handlers */
  editorMode?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  selectedSnippetId?: string | null;
  onSelectSnippet?: (id: string) => void;
  /** Wireframe rendering: B&W with neutralised colors, real section layout. */
  wireframe?: boolean;
  /** Enable element click selection inside library iframes. */
  selectionEnabled?: boolean;
  onElementClick?: (info: IframeElementClickInfo) => void;
  onDomTree?: (tree: IframeDomTreeNode) => void;
  /** Editor-only: forward wheel/pinch events that originate inside a
   *  library iframe back to the parent canvas so the user can still
   *  pan/zoom even while hovering an iframe section. */
  onCanvasWheel?: (e: { deltaX: number; deltaY: number; ctrlKey: boolean; metaKey: boolean }) => void;
}

/** Convert StyleGuide into CSS custom properties object */
const DSR_SHADOW_MAP: Record<string, string> = {
  none: "none",
  sm: "0 1px 2px rgba(0,0,0,0.05)",
  md: "0 4px 6px -1px rgba(0,0,0,0.10)",
  lg: "0 10px 15px -3px rgba(0,0,0,0.10)",
};

function resolveCardShadowDSR(cards: StyleGuide["cards"]): string {
  if (cards.shadowCustom) {
    const s = cards.shadowCustom;
    return `${s.x}px ${s.y}px ${s.blur}px ${s.spread}px ${s.color}`;
  }
  return DSR_SHADOW_MAP[cards.shadow] ?? DSR_SHADOW_MAP.md;
}

export function styleGuideToCSSVars(sg: StyleGuide): React.CSSProperties {
  const shadeVars = generateShadeCSSVars(sg.colors);
  const ctaVars = buildCtaCSSVars(sg);

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
    "--card-shadow": resolveCardShadowDSR(sg.cards),
    "--card-padding": sg.cards.padding,
    "--card-border-width": sg.cards.borderWidth ?? "0px",
    "--card-border-color": sg.cards.borderColor ?? "transparent",
    "--card-image-radius": sg.cards.imageRadius ?? sg.cards.borderRadius,
    "--section-padding": sg.spacing.sectionPadding,
    "--element-gap": sg.spacing.elementGap,
    "--max-content-width": sg.spacing.maxContentWidth,
    ...ctaVars,
    ...shadeVars,
  } as React.CSSProperties;
}

/** Resolve the color scheme from content.__color_scheme and return CSS overrides */
interface ColorSchemeVars extends React.CSSProperties {
  "--color-background"?: string;
  "--color-text"?: string;
  "--color-text-muted"?: string;
}

function resolveColorSchemeVars(
  content: Record<string, unknown>,
  styleGuide: StyleGuide,
): ColorSchemeVars {
  const raw = content.__color_scheme;
  if (!raw || raw === "default") return {};

  let scheme: SectionColorScheme;
  if (typeof raw === "string") {
    scheme = { preset: raw as ColorSchemePreset };
  } else if (typeof raw === "object" && raw !== null) {
    scheme = raw as SectionColorScheme;
  } else {
    return {};
  }

  const resolved = resolveColorScheme(scheme, styleGuide.colors);
  return {
    "--color-background": resolved.bg,
    "--color-text": resolved.text,
    "--color-text-muted": resolved.textMuted,
  };
}

function layoutToCSS(
  layout: SiteSectionDef["structure"]["layout"],
): React.CSSProperties {
  const alignMap: Record<string, string> = { left: "flex-start", center: "center", right: "flex-end" };

  if (layout.type === "grid") {
    const cols = Array.isArray(layout.columns)
      ? layout.columns.map(() => "1fr").join(" ")
      : `repeat(${layout.columns ?? 2}, minmax(0, 1fr))`;
    return {
      display: "grid",
      gridTemplateColumns: cols,
      gap: layout.gap ?? "var(--element-gap)",
      alignItems: "center",
    };
  }

  if (layout.type === "flex-row") {
    return {
      display: "flex",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: layout.gap ?? "var(--element-gap)",
      justifyContent: alignMap[layout.align ?? "left"] ?? "flex-start",
      alignItems: "center",
    };
  }

  // stack
  return {
    display: "flex",
    flexDirection: "column",
    gap: layout.gap ?? "var(--element-gap)",
    alignItems: alignMap[layout.align ?? "left"] ?? "flex-start",
  };
}

export function DynamicSectionRenderer({
  instance,
  sectionDef,
  styleGuide,
  variables,
  menus,
  editorMode,
  selected,
  onSelect,
  selectedSnippetId,
  onSelectSnippet,
  wireframe = false,
  selectionEnabled = false,
  onElementClick,
  onDomTree,
  onCanvasWheel,
}: DynamicSectionRendererProps) {
  // Filter out __ meta keys from content passed to section components
  const contentWithoutMeta = Object.fromEntries(
    Object.entries(instance.content).filter(([k]) => !k.startsWith("__"))
  );

  // Menus override for navbar/footer sections (only when blocks have no nav_link content)
  const menuOverrides = deriveMenuOverrides(sectionDef.category, menus);

  // Auto-inject reviews into testimonial-category sections (live preview).
  // Reviews are stringified into variables['__reviews'] by resolveEnterpriseVariables.
  const testimonialOverrides: Record<string, unknown> = (() => {
    if (!sectionDef.category || !TESTIMONIAL_CATEGORIES.has(sectionDef.category)) return {};
    const reviewsRaw = variables?.__reviews;
    if (!reviewsRaw) return { hasReviews: false };
    let parsed: unknown[];
    try {
      parsed = JSON.parse(reviewsRaw) as unknown[];
    } catch {
      return { hasReviews: false };
    }
    if (!Array.isArray(parsed) || parsed.length === 0) return { hasReviews: false };
    const existing = instance.content.testimonials;
    const hasCustom = Array.isArray(existing) && existing.length > 0;
    if (hasCustom) return { hasReviews: true };
    const six = parsed.slice(0, 6);
    return { testimonials: six, reviews: six, hasReviews: true };
  })();

  // Color scheme override computed from content.__color_scheme
  const colorSchemeVars = resolveColorSchemeVars(instance.content, styleGuide);

  // Form block section
  if (sectionDef.type === 'form_block') {
    const formId = instance.content.form_id as string | undefined;
    const renderMode = (instance.content.render_mode as 'step' | 'scroll') ?? 'step';
    if (!formId) {
      if (!editorMode) return null;
      return (
        <div
          onClick={editorMode ? (e) => { e.stopPropagation(); onSelect?.(); } : undefined}
          data-section-id={instance.id}
          className={editorMode ? 'group/section' : ''}
          style={{ padding: '40px 24px', textAlign: 'center', background: '#f8f6f1', color: '#8A877F', fontSize: 14, cursor: editorMode ? 'pointer' : undefined, position: 'relative', border: selected ? '2px solid #3b82f6' : '2px solid transparent' }}
        >
          Formulaire non configuré — sélectionnez un formulaire dans l'éditeur.
        </div>
      );
    }
    return (
      <FormBlockSection
        formId={formId}
        renderMode={renderMode}
        siteId={instance.site_id as string | undefined}
        editorMode={editorMode}
        selected={selected}
        onSelect={onSelect}
        instanceId={instance.id}
        variables={variables}
      />
    );
  }

  // Library section: render via iframe using the section code
  if (sectionDef.code) {
    const handleClick = editorMode ? (e: React.MouseEvent) => { e.stopPropagation(); onSelect?.(); } : undefined;

    const effectiveStyleGuide: StyleGuide = {
      ...styleGuide,
      colors: {
        ...styleGuide.colors,
        background: (colorSchemeVars["--color-background"] as string) || styleGuide.colors.background,
        text: (colorSchemeVars["--color-text"] as string) || styleGuide.colors.text,
        textMuted: (colorSchemeVars["--color-text-muted"] as string) || styleGuide.colors.textMuted,
      },
    };

    // Compute wrapper height/spacing from content meta-keys (same as snippet sections)
    const libHeightMode = instance.content.__height_mode as string | undefined;
    const libHeightValue = instance.content.__height_value as string | undefined;
    const libPadTop = typeof instance.content.__padding_top === "number" ? `${instance.content.__padding_top}px` : undefined;
    const libPadBottom = typeof instance.content.__padding_bottom === "number" ? `${instance.content.__padding_bottom}px` : undefined;
    const libMarginTop = typeof instance.content.__margin_top === "number" ? `${instance.content.__margin_top}px` : undefined;
    const libMarginBottom = typeof instance.content.__margin_bottom === "number" ? `${instance.content.__margin_bottom}px` : undefined;
    let libMinHeight: string | undefined;
    if (libHeightMode === "fullscreen") libMinHeight = "100vh";
    else if (libHeightMode === "large") libMinHeight = "80vh";
    else if (libHeightMode === "fixed" && libHeightValue) libMinHeight = libHeightValue;

    const wrapperStyle: React.CSSProperties = {
      position: "relative",
      cursor: editorMode ? "pointer" : undefined,
      ...(libMinHeight ? { minHeight: libMinHeight } : {}),
      ...(libPadTop ? { paddingTop: libPadTop } : {}),
      ...(libPadBottom ? { paddingBottom: libPadBottom } : {}),
      ...(libMarginTop ? { marginTop: libMarginTop } : {}),
      ...(libMarginBottom ? { marginBottom: libMarginBottom } : {}),
      ...((instance.custom_style ?? {}) as React.CSSProperties),
    };

    return (
      <div
        onClick={handleClick}
        data-section-id={instance.id}
        style={wrapperStyle}
        className={editorMode ? "group/section" : ""}
      >
        {editorMode && (
          <div
            className="absolute inset-0 pointer-events-none z-10 transition-all"
            style={{ border: selected ? "2px solid #3b82f6" : "2px solid transparent" }}
          />
        )}
        {instance.is_hidden && editorMode && (
          <div className="absolute top-2 right-2 text-xs bg-gray-800 text-white px-2 py-1 rounded z-20">
            Masquée
          </div>
        )}
        {(!instance.is_hidden || editorMode) && (
          <LibrarySectionIframe
            code={sectionDef.code}
            content={{
              ...sectionDef.default_content,
              ...menuOverrides,
              ...testimonialOverrides,
              ...adaptContentForRender(contentWithoutMeta, instance.blocks ?? []),
            }}
            overrides={instance.content.__overrides as Record<string, unknown> | undefined}
            styleGuide={effectiveStyleGuide}
            variables={variables}
            wireframe={wireframe}
            selectionEnabled={selectionEnabled}
            onElementClick={onElementClick}
            onDomTree={onDomTree}
            onCanvasWheel={onCanvasWheel}
          />
        )}
      </div>
    );
  }

  const { structure } = sectionDef;
  const adapted = adaptContentForRender(instance.content, instance.blocks ?? []);
  const content = { ...sectionDef.default_content, ...menuOverrides, ...testimonialOverrides, ...adapted };

  const cssVars = styleGuideToCSSVars(styleGuide);

  // ── Height from schema __height_mode / __height_value ────────────────────────
  const heightMode = instance.content.__height_mode as string | undefined;
  const heightValue = instance.content.__height_value as string | undefined;
  let minHeight: string | undefined;
  if (heightMode === "fullscreen") minHeight = "100vh";
  else if (heightMode === "large") minHeight = "80vh";
  else if (heightMode === "fixed" && heightValue) minHeight = heightValue;

  // ── Padding from schema: __padding_top / __padding_bottom > __padding_y > CSS var ──
  const paddingY = typeof instance.content.__padding_y === "number"
    ? `${instance.content.__padding_y}px`
    : undefined;
  const padTop = typeof instance.content.__padding_top === "number"
    ? `${instance.content.__padding_top}px`
    : paddingY;
  const padBottom = typeof instance.content.__padding_bottom === "number"
    ? `${instance.content.__padding_bottom}px`
    : paddingY;
  const padX = typeof instance.content.__padding_x === "number"
    ? `${instance.content.__padding_x}px`
    : undefined;

  // ── Margin from schema ─────────────────────────────────────────────────────
  const marginTop = typeof instance.content.__margin_top === "number"
    ? `${instance.content.__margin_top}px`
    : undefined;
  const marginBottom = typeof instance.content.__margin_bottom === "number"
    ? `${instance.content.__margin_bottom}px`
    : undefined;

  const padding = structure.padding ?? {};
  const sectionStyle: React.CSSProperties = {
    ...cssVars,
    // Color scheme overrides (applied after base vars so they take precedence)
    ...colorSchemeVars,
    paddingTop: padTop ?? padding.top ?? "var(--section-padding)",
    paddingBottom: padBottom ?? padding.bottom ?? "var(--section-padding)",
    paddingLeft: padX ?? padding.left ?? "24px",
    paddingRight: padX ?? padding.right ?? "24px",
    ...(minHeight ? { minHeight } : {}),
    ...(marginTop ? { marginTop } : {}),
    ...(marginBottom ? { marginBottom } : {}),
    backgroundColor: structure.background ?? "var(--color-background)",
    position: "relative",
    fontFamily: "var(--font-body)",
    fontSize: "var(--font-base-size)",
    color: "var(--color-text)",
    ...(instance.custom_style as React.CSSProperties ?? {}),
  };

  const innerLayoutStyle = layoutToCSS(structure.layout);
  const innerStyle: React.CSSProperties = {
    ...innerLayoutStyle,
    maxWidth: "var(--max-content-width)",
    margin: "0 auto",
    width: "100%",
  };

  const handleSectionClick = editorMode
    ? (e: React.MouseEvent) => { e.stopPropagation(); onSelect?.(); }
    : undefined;

  if (instance.is_hidden && !editorMode) return null;

  return (
    <section
      style={sectionStyle}
      onClick={handleSectionClick}
      data-section-id={instance.id}
      className={editorMode ? "group/section" : ""}
    >
      {/* Editor: hover border + action buttons */}
      {editorMode && (
        <div
          className="absolute inset-0 pointer-events-none transition-all"
          style={{
            border: selected ? "2px solid #3b82f6" : "2px solid transparent",
          }}
        />
      )}

      {instance.is_hidden && editorMode && (
        <div className="absolute top-2 right-2 text-xs bg-gray-800 text-white px-2 py-1 rounded z-10">
          Masquée
        </div>
      )}

      <div style={innerStyle}>
        {structure.snippets.map((snippet) => (
          <SnippetRenderer
            key={snippet.id}
            snippet={snippet}
            content={content}
            selected={editorMode && selectedSnippetId === snippet.id}
            onSelect={editorMode ? onSelectSnippet : undefined}
          />
        ))}
      </div>
    </section>
  );
}

// Lazily loaded form block — avoids bundling FormRuntime into every page
function FormBlockSection({
  formId, renderMode, siteId, editorMode, selected, onSelect, instanceId, variables,
}: {
  formId: string;
  renderMode: 'step' | 'scroll';
  siteId?: string;
  editorMode?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  instanceId?: string;
  variables?: Record<string, string>;
}) {
  const [form, setForm] = useState<import('@/types').Form | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`/api/forms/public/${formId}`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then(setForm)
      .catch(() => setError(true));
  }, [formId]);

  const FormRuntime = React.lazy(() => import('@/components/form-builder/runtime/FormRuntime').then(m => ({ default: m.FormRuntime })));

  if (error) {
    if (!editorMode) return null;
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#8A877F', fontSize: 14 }}>
        Formulaire introuvable ou non publié.
      </div>
    );
  }

  if (!form) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#8A877F', fontSize: 14 }}>
        Chargement du formulaire…
      </div>
    );
  }

  return (
    <div
      onClick={editorMode ? (e) => { e.stopPropagation(); onSelect?.(); } : undefined}
      data-section-id={instanceId}
      className={editorMode ? 'group/section' : ''}
      style={{ position: 'relative', border: selected ? '2px solid #3b82f6' : '2px solid transparent' }}
    >
      <React.Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#8A877F' }}>Chargement…</div>}>
        <FormRuntime
          form={form}
          mode={renderMode}
          siteId={siteId}
          embedded={editorMode}
          variables={variables}
        />
      </React.Suspense>
    </div>
  );
}

export default DynamicSectionRenderer;
