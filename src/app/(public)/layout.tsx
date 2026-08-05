import React from "react";
import { VisitBeacon } from "@/components/site-builder/VisitBeacon";

/**
 * Root layout for everything served on a CLIENT's domain: published sites
 * (`/site/**`) and draft previews (`/preview/**`).
 *
 * These pages used to inherit the CRM's root layout, so every visitor to a
 * client's demo downloaded the CRM's chrome before seeing the design:
 * globals.css + studio.css, three self-hosted font families preloaded, a
 * render-blocking Google Fonts stylesheet for three more, and the whole
 * Providers tree (theme context, toaster). None of it is referenced by a
 * generated site — the design brings its own stylesheet and its own fonts.
 *
 * Removing it required a second ROOT layout, not a nested one: a nested layout
 * renders inside the CRM's <html>, so it can add but never remove. Hence the
 * `(crm)` / `(public)` route groups — they don't appear in URLs, so every path
 * is unchanged.
 *
 * Keep this file minimal. Anything added here ships on every client site.
 *
 * Deliberately no `metadata` export: each page below supplies its own, and a
 * default here would be a CRM string on a client's page — which is what the
 * shared root layout was doing.
 */

/**
 * The two reset rules that dropping `globals.css` actually took away here.
 *
 * `LIBRARY_BASE_CSS` in DynamicPageRenderer already applies `box-sizing` and
 * `img { max-width: 100% }` inside `[data-lsi]`, which is every design section,
 * and the Tailwind CDN re-supplies a full preflight at runtime. What was left
 * uncovered is the page chrome *outside* the sections — the demo paywall bar,
 * the preview diagnosis page — plus iOS text inflation.
 *
 * Deliberately nothing that changes a display mode. A rule like
 * `img { display: block }` is part of Tailwind's preflight but it is a
 * rendering decision, not a reset, and imported designs lay out their inline
 * images assuming the browser default.
 */
const PUBLIC_RESET_CSS = `
*,::before,::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
`;

export default function PublicSiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: PUBLIC_RESET_CSS }} />
      </head>
      <body style={{ margin: 0 }}>
        {children}
        {/* Mesure des visites de démo — sans cookie ni tiers, et rendu null.
            C'est la seule chose que ce layout ajoute au poids d'une page
            client : un effet, aucun markup. */}
        <VisitBeacon />
      </body>
    </html>
  );
}
