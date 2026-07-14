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
import { applyOverridesToHTML, type OverrideEntry } from "@/lib/library-section/apply-overrides-html";
import { conditionServiceMarkup } from "@/lib/site-builder/claude-design/condition-service-markup";
import { resolveImageSets } from "@/lib/site-builder/claude-design/resolve-image-sets";
import { fillEmptyPlaceholders, type CompanyImage } from "@/lib/site-builder/claude-design/fill-empty-placeholders";
import { hydrateReviews } from "@/lib/site-builder/claude-design/hydrate-reviews";
import { interpolateData } from "@/lib/library-section/interpolate";
import { generateColorShades } from "@/lib/color-utils";
import type { StyleGuide } from "@/types";

interface Props {
  instanceId: string;
  code: string;
  content: Record<string, unknown>;
  styleGuide?: StyleGuide;
  variables?: Record<string, string>;
  /**
   * Raw (unmanaged) mode: marks the container with `data-raw` so the page's
   * scoped coherence CSS (`[data-lsi]:not([data-raw])`) skips this section,
   * keeping the imported design faithful.
   */
  unmanaged?: boolean;
  /**
   * Claude Design only: slug → service_tag for the site's service pages. Links
   * to a service the enterprise lacks (nav / footer / expertise cards) are
   * removed so the deployed page only shows the company's services.
   */
  serviceTagBySlug?: Record<string, string>;
  /**
   * Claude Design only: the linked company's ranked library images. When
   * provided (a real deployed/previewed company), any image placeholder still
   * empty after overrides + set resolution is auto-filled with the best-matching
   * one — a safety net so a deployed demo never shows an empty "Photo — …" box.
   */
  companyImages?: CompanyImage[];
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
  unmanaged = false,
  serviceTagBySlug,
  companyImages,
}: Props) {
  let html = "";
  let compiledJs = "";
  let renderName: string | null = null;
  let errorMsg: string | undefined;

  // Split out __overrides — they're not data fields, they're DOM-path edits
  // applied after render. Keep them server-side; the client hydrator gets
  // them via the JSON payload (still inside `data`).
  const overrides = (content.__overrides as Record<string, OverrideEntry> | undefined) ?? {};

  // Pre-interpolate {{ var }} tokens inside data string fields so React
  // renders the resolved text directly (matches the iframe behaviour).
  const interpolatedData = interpolateData(content, variables);

  try {
    const compiled = await compileSection(code);
    compiledJs = compiled.js;
    renderName = compiled.renderName;

    const result = renderSectionToHTML({
      js: compiledJs,
      renderName,
      data: interpolatedData,
      variables,
      styleGuide,
    });
    html = result.html;
    errorMsg = result.error;
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : String(err);
  }

  // Apply DOM-path overrides server-side so the deployed HTML reflects user
  // edits on first paint (no flash) and works without JS. The client
  // hydrator re-applies them post-hydration as a safety net.
  let applied = 0;
  let failed = 0;
  if (html && Object.keys(overrides).length > 0) {
    const result = applyOverridesToHTML(html, overrides, variables);
    html = result.html;
    applied = result.applied;
    failed = result.failed;
  }

  // The linked company's service tags — drive image-set resolution, service
  // conditioning and placeholder auto-fill below.
  let enterpriseTags: string[] = [];
  try {
    const parsed = JSON.parse(variables["__service_tags"] ?? "[]");
    if (Array.isArray(parsed)) enterpriseTags = parsed.map((t) => String(t));
  } catch { /* no tags */ }

  // Resolve multi-candidate image sets to a SINGLE image for this company.
  // Runs AFTER overrides (applyOverridesToHTML skips :image_set) and BEFORE
  // conditioning, so it only touches attributes/inline style, never the tree.
  if (Object.keys(overrides).some((k) => k.endsWith(":image_set"))) {
    html = resolveImageSets(html, overrides, enterpriseTags);
  }

  // Section-level service-tag conditioning for raw Claude Design markup. Runs
  // AFTER overrides so positional override paths aren't shifted by stripping.
  // Only relevant when the design carries data-service-tag regions.
  if (html.includes("data-service-tag") || (serviceTagBySlug && Object.keys(serviceTagBySlug).length > 0)) {
    html = conditionServiceMarkup(html, serviceTagBySlug, enterpriseTags);
  }

  // Safety net: fill any placeholder still empty with the best-matching library
  // image for this company, so a deployed demo never ships an empty framed
  // "Photo — …" box. Only runs when companyImages was provided (a real company).
  if (companyImages && companyImages.length > 0 && html.includes("ph-label")) {
    html = fillEmptyPlaceholders(html, companyImages, enterpriseTags);
  }

  // Hydrate review cards ([data-reviews]) from lead_magnet_reviews. Runs after
  // service-tag conditioning; no-op when the design has no data-reviews grid or
  // the company has no reviews (static example cards are kept as a fallback).
  if (html.includes("data-reviews")) {
    html = hydrateReviews(html, variables?.["__reviews"]);
  }
  if (typeof console !== "undefined") {
    console.info("[SB:ssr]", {
      instanceId,
      overrideCount: Object.keys(overrides).length,
      applied,
      failed,
      hasError: !!errorMsg,
    });
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
          data-raw={unmanaged ? "" : undefined}
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
        data-raw={unmanaged ? "" : undefined}
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
