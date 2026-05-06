"use client";

import React from "react";
import type { SiteSectionInstance, SiteSectionDef, StyleGuide } from "@/types";
import { SnippetRenderer } from "./dynamic-snippets";
import { LibrarySectionIframe } from "./LibrarySectionIframe";
import {
  resolveColorScheme,
  generateShadeCSSVars,
  type ColorSchemePreset,
  type SectionColorScheme,
} from "@/lib/color-utils";

interface DynamicSectionRendererProps {
  instance: SiteSectionInstance;
  sectionDef: SiteSectionDef;
  styleGuide: StyleGuide;
  /** Editor mode: shows selection highlight and click handlers */
  editorMode?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  selectedSnippetId?: string | null;
  onSelectSnippet?: (id: string) => void;
}

/** Convert StyleGuide into CSS custom properties object */
export function styleGuideToCSSVars(sg: StyleGuide): React.CSSProperties {
  const shadowMap: Record<string, string> = {
    none: "none",
    sm: "0 1px 2px rgba(0,0,0,0.05)",
    md: "0 4px 6px -1px rgba(0,0,0,0.10)",
    lg: "0 10px 15px -3px rgba(0,0,0,0.10)",
  };

  // Generate shade CSS vars for primary, secondary, accent
  const shadeVars = generateShadeCSSVars(sg.colors);

  return {
    // Core colors
    "--color-primary": sg.colors.primary,
    "--color-secondary": sg.colors.secondary,
    "--color-accent": sg.colors.accent,
    "--color-background": sg.colors.background,
    "--color-bg-alt": sg.colors.backgroundAlt,
    "--color-text": sg.colors.text,
    "--color-text-muted": sg.colors.textMuted,
    // Typography
    "--font-heading": sg.fonts.heading + ", Inter, sans-serif",
    "--font-body": sg.fonts.body + ", Inter, sans-serif",
    "--font-base-size": sg.fonts.baseSize,
    // Buttons
    "--btn-radius": sg.buttons.borderRadius,
    "--btn-padding": sg.buttons.padding,
    // Cards
    "--card-radius": sg.cards.borderRadius,
    "--card-shadow": shadowMap[sg.cards.shadow] ?? shadowMap.md,
    "--card-padding": sg.cards.padding,
    // Spacing
    "--section-padding": sg.spacing.sectionPadding,
    "--element-gap": sg.spacing.elementGap,
    "--max-content-width": sg.spacing.maxContentWidth,
    // Shade scales (--color-primary-50 ... --color-primary-950, etc.)
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
  editorMode,
  selected,
  onSelect,
  selectedSnippetId,
  onSelectSnippet,
}: DynamicSectionRendererProps) {
  // Filter out __ meta keys from content passed to section components
  const contentWithoutMeta = Object.fromEntries(
    Object.entries(instance.content).filter(([k]) => !k.startsWith("__"))
  );

  // Color scheme override computed from content.__color_scheme
  const colorSchemeVars = resolveColorSchemeVars(instance.content, styleGuide);

  // Library section: render via iframe using the section code
  if (sectionDef.code) {
    const handleClick = editorMode ? (e: React.MouseEvent) => { e.stopPropagation(); onSelect?.(); } : undefined;

    // Merge color scheme into a modified styleGuide for the iframe
    const effectiveStyleGuide: StyleGuide = {
      ...styleGuide,
      colors: {
        ...styleGuide.colors,
        // Apply color scheme overrides to the background/text colors passed to the iframe
        background: (colorSchemeVars["--color-background"] as string) || styleGuide.colors.background,
        text: (colorSchemeVars["--color-text"] as string) || styleGuide.colors.text,
        textMuted: (colorSchemeVars["--color-text-muted"] as string) || styleGuide.colors.textMuted,
      },
    };

    return (
      <div
        onClick={handleClick}
        data-section-id={instance.id}
        style={{ position: "relative", cursor: editorMode ? "pointer" : undefined }}
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
            content={{ ...sectionDef.default_content, ...contentWithoutMeta }}
            styleGuide={effectiveStyleGuide}
          />
        )}
      </div>
    );
  }

  const { structure } = sectionDef;
  const content = { ...sectionDef.default_content, ...instance.content };

  const cssVars = styleGuideToCSSVars(styleGuide);

  // Apply padding from schema field __padding_y if set
  const paddingY = typeof instance.content.__padding_y === "number"
    ? `${instance.content.__padding_y}px`
    : undefined;

  const padding = structure.padding ?? {};
  const sectionStyle: React.CSSProperties = {
    ...cssVars,
    // Color scheme overrides (applied after base vars so they take precedence)
    ...colorSchemeVars,
    paddingTop: paddingY ?? padding.top ?? "var(--section-padding)",
    paddingBottom: paddingY ?? padding.bottom ?? "var(--section-padding)",
    paddingLeft: padding.left ?? "24px",
    paddingRight: padding.right ?? "24px",
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

export default DynamicSectionRenderer;
