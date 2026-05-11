"use client";

import React from "react";
import type { ThemeGlobalVariables, SiteGlobalSettings } from "@/types";

type SiteSettings = ThemeGlobalVariables & { siteSettings?: SiteGlobalSettings };

interface SiteSettingsPanelProps {
  settings: SiteSettings;
  onUpdate: (patch: Partial<SiteSettings>) => void;
  onClose: () => void;
}

export default function SiteSettingsPanel({ settings, onUpdate, onClose }: SiteSettingsPanelProps) {
  const [tab, setTab] = React.useState<"style" | "seo">("style");

  const updateColor = (key: keyof ThemeGlobalVariables["colors"], value: string) => {
    onUpdate({ colors: { ...settings.colors, [key]: value } });
  };

  const updateFont = (key: keyof ThemeGlobalVariables["fonts"], value: string) => {
    onUpdate({ fonts: { ...settings.fonts, [key]: value } });
  };

  const updateSiteSettings = (patch: Partial<SiteGlobalSettings>) => {
    onUpdate({ siteSettings: { ...settings.siteSettings, ...patch } });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h2 className="font-semibold text-gray-900">Paramètres du site</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
      </div>

      <div className="flex border-b border-gray-200">
        {(["style", "seo"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-sm font-medium ${tab === t ? "border-b-2 border-blue-500 text-blue-600" : "text-gray-500 hover:text-gray-700"}`}
          >
            {t === "style" ? "Style global" : "SEO & Meta"}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {tab === "style" && (
          <>
            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Couleurs</h3>
              <div className="space-y-2">
                {(["primary", "secondary", "accent", "background", "text"] as const).map((key) => (
                  <label key={key} className="flex items-center justify-between gap-3">
                    <span className="text-sm text-gray-700 capitalize">{key}</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={settings.colors?.[key] ?? "#000000"}
                        onChange={(e) => updateColor(key, e.target.value)}
                        className="w-8 h-8 rounded cursor-pointer border border-gray-200"
                      />
                      <input
                        type="text"
                        value={settings.colors?.[key] ?? ""}
                        onChange={(e) => updateColor(key, e.target.value)}
                        className="w-24 text-xs border border-gray-200 rounded px-2 py-1 font-mono"
                      />
                    </div>
                  </label>
                ))}
              </div>
            </section>

            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Typographie</h3>
              <div className="space-y-2">
                <label className="flex flex-col gap-1">
                  <span className="text-sm text-gray-700">Police titres</span>
                  <input
                    type="text"
                    value={settings.fonts?.heading ?? ""}
                    onChange={(e) => updateFont("heading", e.target.value)}
                    placeholder="Inter"
                    className="border border-gray-200 rounded px-2 py-1 text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-sm text-gray-700">Police corps</span>
                  <input
                    type="text"
                    value={settings.fonts?.body ?? ""}
                    onChange={(e) => updateFont("body", e.target.value)}
                    placeholder="Inter"
                    className="border border-gray-200 rounded px-2 py-1 text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-sm text-gray-700">Taille de base</span>
                  <input
                    type="text"
                    value={settings.fonts?.baseSize ?? ""}
                    onChange={(e) => updateFont("baseSize", e.target.value)}
                    placeholder="16px"
                    className="border border-gray-200 rounded px-2 py-1 text-sm"
                  />
                </label>
              </div>
            </section>
          </>
        )}

        {tab === "seo" && (
          <section className="space-y-3">
            <label className="flex flex-col gap-1">
              <span className="text-sm text-gray-700">Titre du site</span>
              <input
                type="text"
                value={settings.siteSettings?.metaTitle ?? ""}
                onChange={(e) => updateSiteSettings({ metaTitle: e.target.value })}
                className="border border-gray-200 rounded px-2 py-1 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm text-gray-700">Description</span>
              <textarea
                rows={3}
                value={settings.siteSettings?.metaDescription ?? ""}
                onChange={(e) => updateSiteSettings({ metaDescription: e.target.value })}
                className="border border-gray-200 rounded px-2 py-1 text-sm resize-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm text-gray-700">URL favicon</span>
              <input
                type="text"
                value={settings.siteSettings?.faviconUrl ?? ""}
                onChange={(e) => updateSiteSettings({ faviconUrl: e.target.value })}
                placeholder="https://..."
                className="border border-gray-200 rounded px-2 py-1 text-sm"
              />
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.siteSettings?.isActive ?? false}
                onChange={(e) => updateSiteSettings({ isActive: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm text-gray-700">Site actif (public)</span>
            </label>
          </section>
        )}
      </div>
    </div>
  );
}
