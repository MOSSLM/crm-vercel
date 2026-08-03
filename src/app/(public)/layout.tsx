import React from "react";

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
export default function PublicSiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
