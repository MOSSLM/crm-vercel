"use client";

import React from "react";
import type { SitemapPage } from "@/types";

/**
 * Per-page service-tag editor. Setting a page's tag makes that page only deploy
 * for companies whose service_tags include it (page-level conditioning is
 * already enforced by SitePageView + buildPublicMenus at render time).
 */
export function TagToggles({
  sitemap,
  onChange,
}: {
  sitemap: SitemapPage[];
  onChange: (slug: string, serviceTag: string | null) => void;
}) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-xs text-muted-foreground">
        Une page avec un tag de service ne s&apos;affiche que pour les entreprises ayant ce service.
      </p>
      <ul className="flex flex-col divide-y rounded-md border">
        {sitemap.map((p) => (
          <li key={p.slug} className="flex items-center justify-between gap-2 px-3 py-2">
            <span className="text-xs truncate">{p.title || p.slug}</span>
            <input
              className="w-36 rounded-md border bg-background px-2 py-1 text-xs"
              placeholder="ex. climatisation"
              defaultValue={p.service_tag ?? ""}
              onBlur={(e) => {
                const v = e.target.value.trim();
                onChange(p.slug, v || null);
              }}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

export default TagToggles;
