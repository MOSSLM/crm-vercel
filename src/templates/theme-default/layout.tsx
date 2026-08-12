import React from "react";
import type { SiteGlobalSettings, ThemeGlobalVariables } from "@/types";
import { getGoogleFontsHref } from "@/lib/site-builder/google-fonts";

interface ThemeLayoutProps {
  children: React.ReactNode;
  variables: Record<string, string>;
  settings: ThemeGlobalVariables & { siteSettings?: SiteGlobalSettings };
  companyName?: string;
  logoUrl?: string;
  phone?: string;
  /** True when the page below is an imported Claude design, which brings its own
   *  typeface and palette. See `INHERITED` below — the difference is not
   *  cosmetic, this wrapper was silently re-typesetting those sites. */
  claudeDesign?: boolean;
}

const ThemeLayout: React.FC<ThemeLayoutProps> = ({ children, settings, claudeDesign }) => {
  const cssVars = {
    "--color-primary": settings.colors.primary,
    "--color-secondary": settings.colors.secondary,
    "--color-accent": settings.colors.accent,
    "--color-background": settings.colors.background,
    "--color-text": settings.colors.text,
    "--font-heading": settings.fonts.heading,
    "--font-body": settings.fonts.body,
  } as React.CSSProperties;

  /**
   * The two INHERITED properties, and why a Claude design must not get them.
   *
   * An imported design applies its typeface through its own stylesheet —
   * `body{font-family:var(--sans)}` — with `--sans` / `--serif` set from the
   * operator's tweaks by ClaudeDesignAssets. This wrapper sits BETWEEN `<body>`
   * and the design, so a `font-family` declared here beats that `body` rule for
   * every element the design typesets by inheritance instead of by an explicit
   * rule. `--font-body` here comes from the legacy style guide (usually plain
   * "Inter"), so the published site rendered its body copy in Inter while
   * headings — which the design names explicitly on `h1`/`h2` — kept the right
   * face. That asymmetry is exactly the "only the secondary font is missing"
   * symptom: the Google stylesheet loads fine, its faces just never get used.
   *
   * Neither preview goes through this layout — the editor iframe builds its own
   * document, and the draft-preview route renders DynamicPageRenderer directly —
   * which is why the bug only ever showed on the published site.
   *
   * The custom properties above stay in both cases: nothing in a Claude design
   * reads them (it uses --sans/--serif/--azur/--cream), and the blog pages
   * served under this same layout style themselves with `var(--color-text)`.
   * Same carve-out as DynamicPageRenderer's own wrapper.
   */
  const inherited: React.CSSProperties = claudeDesign
    ? {}
    : { fontFamily: "var(--font-body, Inter, sans-serif)", color: "var(--color-text)" };

  // A Claude design loads its own faces (ClaudeDesignAssets). Requesting the
  // style guide's on top is a second render-blocking Google round trip for a
  // family no rule on the page ever names.
  const googleFontsHref = claudeDesign ? null : getGoogleFontsHref(settings.fonts);

  return (
    <div style={{ ...cssVars, ...inherited }}>
      {/* Load the site's heading + body fonts so library sections render with
          the chosen typography on the deployed site (parity with editor iframe). */}
      {googleFontsHref && (
        <>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link rel="stylesheet" href={googleFontsHref} />
        </>
      )}
      {children}
    </div>
  );
};

export default ThemeLayout;
