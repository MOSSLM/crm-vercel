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
}

const ThemeLayout: React.FC<ThemeLayoutProps> = ({ children, settings }) => {
  const cssVars = {
    "--color-primary": settings.colors.primary,
    "--color-secondary": settings.colors.secondary,
    "--color-accent": settings.colors.accent,
    "--color-background": settings.colors.background,
    "--color-text": settings.colors.text,
    "--font-heading": settings.fonts.heading,
    "--font-body": settings.fonts.body,
  } as React.CSSProperties;

  const googleFontsHref = getGoogleFontsHref(settings.fonts);

  return (
    <div style={{ ...cssVars, fontFamily: "var(--font-body, Inter, sans-serif)", color: "var(--color-text)" }}>
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
