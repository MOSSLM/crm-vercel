"use client";

import React from "react";
import type { SiteSectionInstance, SiteSectionDef, StyleGuide } from "@/types";
import { SnippetRenderer } from "./dynamic-snippets";

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
    "--btn-radius": sg.buttons.borderRadius,
    "--btn-padding": sg.buttons.padding,
    "--card-radius": sg.cards.borderRadius,
    "--card-shadow": shadowMap[sg.cards.shadow] ?? shadowMap.md,
    "--card-padding": sg.cards.padding,
    "--section-padding": sg.spacing.sectionPadding,
    "--element-gap": sg.spacing.elementGap,
    "--max-content-width": sg.spacing.maxContentWidth,
  } as React.CSSProperties;
}

function layoutToCSS(
  layout: SiteSectionDef["structure"]["layout"],
  isMobile = false
): React.CSSProperties {
  const effectiveLayout = isMobile ? layout : layout;
  const alignMap: Record<string, string> = { left: "flex-start", center: "center", right: "flex-end" };

  if (effectiveLayout.type === "grid") {
    const cols = Array.isArray(effectiveLayout.columns)
      ? effectiveLayout.columns.map(() => "1fr").join(" ")
      : `repeat(${effectiveLayout.columns ?? 2}, minmax(0, 1fr))`;
    return {
      display: "grid",
      gridTemplateColumns: cols,
      gap: effectiveLayout.gap ?? "var(--element-gap)",
      alignItems: "center",
    };
  }

  if (effectiveLayout.type === "flex-row") {
    return {
      display: "flex",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: effectiveLayout.gap ?? "var(--element-gap)",
      justifyContent: alignMap[effectiveLayout.align ?? "left"] ?? "flex-start",
      alignItems: "center",
    };
  }

  // stack
  return {
    display: "flex",
    flexDirection: "column",
    gap: effectiveLayout.gap ?? "var(--element-gap)",
    alignItems: alignMap[effectiveLayout.align ?? "left"] ?? "flex-start",
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
  const { structure } = sectionDef;
  const content = { ...sectionDef.default_content, ...instance.content };

  const cssVars = styleGuideToCSSVars(styleGuide);

  const padding = structure.padding ?? {};
  const sectionStyle: React.CSSProperties = {
    ...cssVars,
    paddingTop: padding.top ?? "var(--section-padding)",
    paddingBottom: padding.bottom ?? "var(--section-padding)",
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
            outline: selected ? "none" : undefined,
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
