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
import { renderRawSection, unwrapRawHtml } from "@/lib/site-builder/render-raw-section";
import { applyOverridesToHTML, type OverrideEntry } from "@/lib/library-section/apply-overrides-html";
import { conditionServiceMarkup } from "@/lib/site-builder/claude-design/condition-service-markup";
import { resolveImageSets } from "@/lib/site-builder/claude-design/resolve-image-sets";
import { stampDomPaths } from "@/lib/site-builder/claude-design/dom-paths";
import { hydrateReviews } from "@/lib/site-builder/claude-design/hydrate-reviews";
import { hydrateCertifications, logosDepuisVariables } from "@/lib/site-builder/claude-design/certifications-from-variables";
import { hydrateStats } from "@/lib/site-builder/claude-design/hydrate-stats";
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

  // A whole-page Claude design is a constant HTML string plus {{ token }}
  // substitution. Compiling that with Babel, evaluating it, and asking
  // renderToString to serialise it back into the string we started from costs a
  // few hundred ms per request on a ~200 KB source — and the compile cache is
  // process-local, so every new serverless instance pays it again.
  //
  // `unwrapRawHtml` only recognises the exact shape `wrapRawHtml` emits and
  // returns null for anything else, so a hand-written section still compiles.
  // Byte parity with the compiled path is asserted in render-raw-section.test.ts
  // against the real Babel + renderToString chain, over the markup these
  // templates actually contain — that test is what makes this safe to skip.
  //
  // `compiledJs` deliberately stays empty: there is no React component to
  // hydrate, the design's interactivity comes from its own site.js injected by
  // DynamicPageRenderer. The client still applies the overrides and mounts form
  // slots — LibrarySectionHydrator guards only its hydration block on `js`, and
  // override-reapply.test.tsx covers exactly that case.
  const rawHtml = unwrapRawHtml(code);
  if (rawHtml !== null) {
    html = renderRawSection(rawHtml, variables);
  } else {
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
  }

  // Apply DOM-path overrides server-side so the deployed HTML reflects user
  // edits on first paint (no flash) and works without JS. The client
  // hydrator re-applies them post-hydration as a safety net.
  let applied = 0;
  let failed = 0;
  if (html && Object.keys(overrides).length > 0) {
    // Tamponner AVANT toute chose : le conditionnement par service retire des
    // nœuds, ce qui décale les chemins positionnels. Le tampon voyage jusqu'au
    // navigateur, donc l'hydrateur retrouve lui aussi le bon nœud. On ne
    // tamponne que les chemins réellement ciblés — quelques dizaines d'octets.
    html = stampDomPaths(html, { mode: "section-root", only: Object.keys(overrides) });
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
  // Relevant when the design carries data-service-tag regions, service-page
  // links, or a lead/"devis" form with [data-svc] service tiles.
  if (
    html.includes("data-service-tag") ||
    html.includes("data-svc") ||
    (serviceTagBySlug && Object.keys(serviceTagBySlug).length > 0)
  ) {
    html = conditionServiceMarkup(html, serviceTagBySlug, enterpriseTags);
  }

  // Aucun remplissage automatique d'image : un emplacement laissé vide dans le
  // template le reste. Les photos sont posées à la main, et seule une image
  // multi-candidats (`:image_set`) s'adapte aux services de l'entreprise.

  // Hydrate review cards ([data-reviews]) from lead_magnet_reviews. Runs after
  // service-tag conditioning; no-op when the design has no data-reviews grid or
  // the company has no reviews (static example cards are kept as a fallback).
  if (html.includes("data-reviews")) {
    html = hydrateReviews(html, variables?.["__reviews"]);
  }

  // Chiffres clés ([data-stats]) depuis `__stats`. Même contrat que les avis :
  // sans stat disponible, les cartes d'exemple du design restent en place —
  // jamais un chiffre vide à côté d'un libellé orphelin.
  if (html.includes("data-stats")) {
    html = hydrateStats(html, variables?.["__stats"]);
  }
  // Certifications RGE ([data-certifications]). Repli INVERSE de celui des
  // stats : sans qualification vérifiée, le bloc entier disparaît au lieu de
  // garder les logos d'exemple du design — ceux-ci attribueraient au client des
  // certifications qu'il ne détient pas.
  if (html.includes("data-certifications")) {
    html = hydrateCertifications(html, logosDepuisVariables(variables?.["__certifications"]));
  }
  // One line per section per request, on every published page — noise in the
  // platform logs, and billed there. Keep it for the cases worth knowing about:
  // a render error, or overrides that resolved to no node (a design edit whose
  // target disappeared, which is exactly what you want to find in the logs).
  if (errorMsg || failed > 0) {
    console.warn("[SB:ssr]", {
      instanceId,
      overrideCount: Object.keys(overrides).length,
      applied,
      failed,
      error: errorMsg,
    });
  }

  // `tokens` are style-guide props for the hydrated React component, and the
  // three shade tables are computed. When compilation failed there is no
  // component to hydrate, so the hydrator never reads them — don't compute or
  // ship them for a section that is already emitting a placeholder.
  const willHydrate = Boolean(compiledJs && renderName);
  const tokens =
    willHydrate && styleGuide
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
