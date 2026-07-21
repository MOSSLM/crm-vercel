import React from "react";
import type { Viewport } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { resolveSite } from "@/lib/site-resolver";
import ThemeLayout from "@/templates/theme-default/layout";
import { DemoPaywallBar } from "@/components/site-builder/DemoPaywallBar";

// Imported Claude designs (and responsive templates generally) rely on their
// own `<meta viewport>`, which is stripped on import. Re-emit it site-wide so
// mobile `@media` fires on real devices.
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

interface SiteLayoutProps {
  children: React.ReactNode;
  params: Promise<{ subdomain: string }>;
}

export default async function SiteLayout({ children, params }: SiteLayoutProps) {
  const { subdomain } = await params;
  const headersList = await headers();
  const host = headersList.get("host") ?? "";

  const site = await resolveSite(subdomain, host);
  if (!site) notFound();

  const { config, enterpriseVariables, companyName, logoUrl, phone } = site;

  return (
    <ThemeLayout
      settings={config.settings}
      variables={enterpriseVariables}
      companyName={companyName}
      logoUrl={logoUrl}
      phone={phone}
    >
      {children}
      {site.paywallEnabled && (
        <DemoPaywallBar siteId={site.siteId} bookingUrl={site.bookingUrl} companyName={companyName} />
      )}
    </ThemeLayout>
  );
}
