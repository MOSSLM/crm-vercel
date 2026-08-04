/**
 * Server component that re-creates a Claude Design site's environment on the
 * page: the shared stylesheet, the chosen Google font(s), the theme (as CSS
 * vars on :root for a flash-free first paint), and the trusted runtime.
 *
 * Rendered once per page by DynamicPageRenderer when the site is a Claude
 * design. Mirrors what the standalone template gets from styles.css +
 * theme-apply.js + site.js, without shipping any operator script.
 */
import React from "react";
import {
  tweaksToCssVars,
  tweaksDataAttrs,
  tweaksFontLinkHref,
  seedThemeScript,
  tweaksExtrasScript,
  type Tweaks,
} from "@/lib/site-builder/claude-design/apply-tweaks";
import { coerceThemeSets } from "@/lib/site-builder/claude-design/parse-theme-sets";
import { resolveFontLinkTags } from "@/lib/site-builder/claude-design/font-links";

export interface ClaudeDesignAssetsData {
  sharedCss: string;
  fontLinks: string[];
  tweaks: Tweaks;
  /** This design's own font/weight/corner tables, parsed from its
   *  `theme-apply.js` at import time. Without them a skin's typeface silently
   *  falls back to the first design's. */
  themeSets?: unknown;
  /** The design's own runtime JS (site.js …). Injected at the BOTTOM of the page
   *  by DynamicPageRenderer — NOT here — so it runs after the section DOM exists. */
  js: string;
  /** Remote runtime `<script src>` libs (leaflet/gsap/…). Also bottom-injected. */
  scriptLinks: string[];
}

export function ClaudeDesignAssets({ sharedCss, fontLinks, tweaks, themeSets }: ClaudeDesignAssetsData) {
  const sets = coerceThemeSets(themeSets);
  const cssVars = tweaksToCssVars(tweaks, sets);
  const dataAttrs = tweaksDataAttrs(tweaks, sets);
  const fontHref = tweaksFontLinkHref(tweaks, sets);

  // Base theme vars at :root so first paint is correct (no flash); the template
  // stylesheet derives the rest via color-mix from these. These MUST come AFTER
  // sharedCss in the cascade: the imported styles.css ships its own `:root`
  // defaults (--azur/--cream/…), so emitting our vars first would let those
  // defaults win and the operator's tweaks (colours/angles/fonts) would no-op.
  const rootVars = `:root{${Object.entries(cssVars)
    .map(([k, v]) => `${k}:${v}`)
    .join(";")}}`;

  // The template's `html[data-font]` / `html[data-weight]` rules need those
  // attributes on <html>; set them client-side (mirrors theme-apply.js), then
  // seed cvc-theme for panel parity. Runs at the top of <body> before the DOM,
  // so it must NOT touch section elements — the interactions (site.js / runtime)
  // are injected at the BOTTOM by DynamicPageRenderer.
  const setAttrsJs = `try{var d=document.documentElement;${Object.entries(dataAttrs)
    .map(([k, v]) => `d.setAttribute(${JSON.stringify(k)},${JSON.stringify(v)});`)
    .join("")}${seedThemeScript(tweaks)}}catch(e){}`;

  // Per-page section tweaks (stepper / pro / rayon de zone). Self-guarded: the
  // localStorage seeds run now — the design's runtime reads them as it builds
  // the stepper and the map, further down the page — and the element work waits
  // for DOMContentLoaded on its own. Safe to emit here at the top.
  const extrasJs = tweaksExtrasScript(tweaks);

  return (
    <>
      {fontHref ? <link rel="stylesheet" href={fontHref} /> : null}
      {/* The stored list is hrefs only — the `rel` is recovered from each URL
          shape. See font-links.ts: emitting the harvested preconnect hints as
          stylesheets meant two render-blocking 404s on every page. */}
      {resolveFontLinkTags(fontLinks).map((tag, i) => (
        <link key={i} rel={tag.rel} href={tag.href} crossOrigin={tag.crossOrigin} />
      ))}
      <style data-cd-theme dangerouslySetInnerHTML={{ __html: `${sharedCss}\n${rootVars}` }} />
      <script dangerouslySetInnerHTML={{ __html: `${setAttrsJs}\n${extrasJs}` }} />
    </>
  );
}
