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
  type Tweaks,
} from "@/lib/site-builder/claude-design/apply-tweaks";
import { CLAUDE_DESIGN_RUNTIME } from "@/lib/site-builder/claude-design/runtime";

export interface ClaudeDesignAssetsData {
  sharedCss: string;
  fontLinks: string[];
  tweaks: Tweaks;
}

export function ClaudeDesignAssets({ sharedCss, fontLinks, tweaks }: ClaudeDesignAssetsData) {
  const cssVars = tweaksToCssVars(tweaks);
  const dataAttrs = tweaksDataAttrs(tweaks);
  const fontHref = tweaksFontLinkHref(tweaks);

  // Base theme vars at :root so first paint is correct (no flash); the template
  // stylesheet derives the rest via color-mix from these.
  const rootVars = `:root{${Object.entries(cssVars)
    .map(([k, v]) => `${k}:${v}`)
    .join(";")}}`;

  // The template's `html[data-font]` / `html[data-weight]` rules need those
  // attributes on <html>; set them client-side (mirrors theme-apply.js), then
  // seed cvc-theme for panel parity, then boot the interactions.
  const setAttrsJs = `try{var d=document.documentElement;${Object.entries(dataAttrs)
    .map(([k, v]) => `d.setAttribute(${JSON.stringify(k)},${JSON.stringify(v)});`)
    .join("")}${seedThemeScript(tweaks)}}catch(e){}`;

  return (
    <>
      <link rel="stylesheet" href={fontHref} />
      {fontLinks.map((href, i) => (
        <link key={i} rel="stylesheet" href={href} />
      ))}
      <style data-cd-theme dangerouslySetInnerHTML={{ __html: `${rootVars}\n${sharedCss}` }} />
      <script dangerouslySetInnerHTML={{ __html: `${setAttrsJs}\n${CLAUDE_DESIGN_RUNTIME}` }} />
    </>
  );
}
