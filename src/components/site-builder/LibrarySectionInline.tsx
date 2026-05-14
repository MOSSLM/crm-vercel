/**
 * Server Component: renders one library section (theme_sections.code) inline in
 * the page HTML — no iframe. Used by DynamicPageRenderer on the public site.
 *
 * 1. Babel-compiles the TSX code server-side.
 * 2. Calls renderToString to produce static HTML.
 * 3. Emits a <script type="application/json"> hydration payload so
 *    LibrarySectionHydrator can mount the interactive React tree client-side.
 */
import React from "react";
import { compileSection } from "@/lib/library-section/compile";
import { renderSectionToHTML } from "@/lib/library-section/render-server";
import { generateColorShades } from "@/lib/color-utils";
import type { StyleGuide } from "@/types";

interface Props {
  instanceId: string;
  code: string;
  content: Record<string, unknown>;
  styleGuide?: StyleGuide;
  variables?: Record<string, string>;
}

/** Safely embeds an arbitrary value as inline JSON without breaking the HTML parser. */
function safeJson(obj: unknown): string {
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

export async function LibrarySectionInline({
  instanceId,
  code,
  content,
  styleGuide,
  variables = {},
}: Props) {
  let html = "";
  let compiledJs = "";
  let renderName: string | null = null;
  let errorMsg: string | undefined;

  try {
    const compiled = await compileSection(code);
    compiledJs = compiled.js;
    renderName = compiled.renderName;

    const result = renderSectionToHTML({
      js: compiledJs,
      renderName,
      data: content,
      variables,
      styleGuide,
    });
    html = result.html;
    errorMsg = result.error;
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : String(err);
  }

  const tokens = styleGuide
    ? {
        primary: styleGuide.colors.primary,
        secondary: styleGuide.colors.secondary,
        accent: styleGuide.colors.accent,
        background: styleGuide.colors.background,
        backgroundAlt: styleGuide.colors.backgroundAlt,
        text: styleGuide.colors.text,
        textMuted: styleGuide.colors.textMuted,
        fontHeading: styleGuide.fonts.heading,
        fontBody: styleGuide.fonts.body,
        baseSize: styleGuide.fonts.baseSize,
        primaryShades: generateColorShades(styleGuide.colors.primary),
        secondaryShades: generateColorShades(styleGuide.colors.secondary),
        accentShades: generateColorShades(styleGuide.colors.accent),
      }
    : {};

  const payload = safeJson({
    instanceId,
    js: compiledJs,
    renderName,
    data: content,
    variables,
    tokens,
  });

  if (!html && errorMsg) {
    // Section failed to render — emit an invisible placeholder so hydration
    // can still attempt a client-side recovery.
    return (
      <>
        <div
          data-lsi={instanceId}
          suppressHydrationWarning
          style={{ minHeight: 0 }}
        />
        <script
          type="application/json"
          data-lsi-id={instanceId}
          dangerouslySetInnerHTML={{ __html: payload }}
        />
      </>
    );
  }

  return (
    <>
      {/* suppressHydrationWarning: tolerate minor server/client HTML differences */}
      <div
        data-lsi={instanceId}
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <script
        type="application/json"
        data-lsi-id={instanceId}
        dangerouslySetInnerHTML={{ __html: payload }}
      />
    </>
  );
}
