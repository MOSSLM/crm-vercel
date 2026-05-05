import React from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { resolveSite } from "@/lib/site-resolver";
import ThemeLayout from "@/templates/theme-default/layout";

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
    </ThemeLayout>
  );
}
