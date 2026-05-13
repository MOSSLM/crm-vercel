"use client";

import React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { RelumeEditor } from "@/components/site-builder/relume-builder/RelumeEditor";
import type { SiteV2, SiteSectionDef, SiteSectionInstance, StyleGuide, SitemapPage, SiteMenus } from "@/types";

export default function SiteBuilderV2Page() {
  const { siteId } = useParams<{ siteId: string }>();
  const [site, setSite] = React.useState<SiteV2 | null>(null);
  const [sections, setSections] = React.useState<SiteSectionDef[]>([]);
  const [instances, setInstances] = React.useState<SiteSectionInstance[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    Promise.all([
      fetch(`/api/site-builder/sites/${siteId}`).then((r) => r.json()),
      fetch(`/api/site-builder/sections`).then((r) => r.json()),
      fetch(`/api/site-builder/sites/${siteId}/instances`).then((r) => r.json()),
    ])
      .then(([siteData, sectionsData, instancesData]) => {
        setSite(siteData);
        setSections(Array.isArray(sectionsData) ? sectionsData : []);
        setInstances(Array.isArray(instancesData) ? instancesData : []);
      })
      .catch(() => toast.error("Erreur lors du chargement"))
      .finally(() => setLoading(false));
  }, [siteId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0f0f11]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          <div className="text-white/30 text-sm">Chargement du builder…</div>
        </div>
      </div>
    );
  }

  if (!site) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#0f0f11]">
        <p className="text-white/40 text-sm mb-3">Site introuvable</p>
        <Link href="/site-builder" className="text-blue-400 hover:underline text-sm">
          ← Retour aux sites
        </Link>
      </div>
    );
  }

  const siteExtra = site as unknown as { style_guide?: StyleGuide; sitemap?: SitemapPage[]; site_config?: { menus?: SiteMenus }; lead_magnet_project_id?: string };

  return (
    <RelumeEditor
      siteId={site.id}
      siteName={site.name}
      enterpriseId={site.enterprise_id ?? undefined}
      initialProjectId={siteExtra.lead_magnet_project_id ?? undefined}
      isPublished={!!site.is_published}
      publishedSubdomain={site.published_subdomain ?? undefined}
      initialSections={sections}
      initialInstances={instances}
      initialStyleGuide={siteExtra.style_guide ?? undefined}
      initialSitemap={siteExtra.sitemap ?? undefined}
      initialMenus={siteExtra.site_config?.menus ?? undefined}
    />
  );
}
