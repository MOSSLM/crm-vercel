"use client";

import React, { useState, useEffect, useCallback } from "react";
import { ImageIcon, Link, X, Upload, Library, Loader2, Trash2, Sparkles, ChevronDown } from "lucide-react";
import type { SectionImagePickerField, MediaLibraryItemRanked } from "@/types";
import { authedFetch } from "@/utils/authedFetch";

interface SiteAssetItem {
  id: string;
  public_url: string;
  filename: string;
  size?: number;
  mime_type?: string;
}

interface ImagePickerFieldProps {
  setting: SectionImagePickerField;
  value: string;
  onChange: (url: string) => void;
  siteId?: string;
  /** Light theme — for the inline trigger on light surfaces (Contenu workspace). */
  light?: boolean;
}

type Tab = "url" | "upload" | "library" | "site";

export function ImagePickerField({ setting, value, onChange, siteId, light }: ImagePickerFieldProps) {
  const [tab, setTab] = useState<Tab>("url");
  const [open, setOpen] = useState(false);
  const [urlInput, setUrlInput] = useState(value ?? "");
  const [uploading, setUploading] = useState(false);

  // Site-specific assets (existing behaviour)
  const [siteAssets, setSiteAssets] = useState<SiteAssetItem[]>([]);
  const [loadingSiteAssets, setLoadingSiteAssets] = useState(false);

  // Central media library, ranked by the linked entreprise
  const [suggested, setSuggested] = useState<MediaLibraryItemRanked[]>([]);
  const [others, setOthers] = useState<MediaLibraryItemRanked[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [othersOpen, setOthersOpen] = useState(false);
  const [enterpriseId, setEnterpriseId] = useState<number | null>(null);

  const hasImage = value && value.length > 0;

  // Resolve the linked enterprise from the site once.
  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;
    authedFetch(`/api/site-builder/sites/${encodeURIComponent(siteId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.enterprise_id) {
          setEnterpriseId(Number(data.enterprise_id));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  const fetchSiteAssets = useCallback(async () => {
    if (!siteId) return;
    setLoadingSiteAssets(true);
    try {
      const res = await authedFetch(`/api/site-builder/assets?site=${encodeURIComponent(siteId)}`);
      if (res.ok) setSiteAssets(await res.json());
    } finally {
      setLoadingSiteAssets(false);
    }
  }, [siteId]);

  const fetchLibrary = useCallback(async () => {
    setLoadingLibrary(true);
    try {
      if (enterpriseId) {
        const res = await authedFetch(
          `/api/media/by-company-tags?entreprise_id=${enterpriseId}`,
        );
        if (res.ok) {
          const data = (await res.json()) as {
            suggested: MediaLibraryItemRanked[];
            others: MediaLibraryItemRanked[];
          };
          setSuggested(data.suggested);
          setOthers(data.others);
          return;
        }
      }
      // Fallback: no enterprise -> flat list, all in "others"
      const res = await authedFetch(`/api/media?limit=200`);
      if (res.ok) {
        const data = (await res.json()) as { items: MediaLibraryItemRanked[] };
        setSuggested([]);
        setOthers(data.items);
      }
    } finally {
      setLoadingLibrary(false);
    }
  }, [enterpriseId]);

  useEffect(() => {
    if (!open) return;
    if (tab === "library") void fetchLibrary();
    if (tab === "site") void fetchSiteAssets();
  }, [open, tab, fetchLibrary, fetchSiteAssets]);

  function handleUrlConfirm() {
    onChange(urlInput.trim());
    setOpen(false);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!siteId) {
      onChange(URL.createObjectURL(file));
      setOpen(false);
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await authedFetch(`/api/site-builder/assets?site=${encodeURIComponent(siteId)}`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw new Error(await res.text());
      const asset: SiteAssetItem = await res.json();
      onChange(asset.public_url);
      setSiteAssets((prev) => [asset, ...prev]);
      setOpen(false);
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteSiteAsset(asset: SiteAssetItem, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Supprimer "${asset.filename}" ?`)) return;
    await authedFetch(`/api/site-builder/assets/${asset.id}`, { method: "DELETE" });
    setSiteAssets((prev) => prev.filter((a) => a.id !== asset.id));
    if (value === asset.public_url) onChange("");
  }

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "url", label: "URL", icon: Link },
    { id: "upload", label: "Upload", icon: Upload },
    { id: "library", label: "Bibliothèque", icon: Library },
    ...(siteId ? [{ id: "site" as Tab, label: "Ce site", icon: ImageIcon }] : []),
  ];

  return (
    <div className="space-y-1.5">
      {/* Preview / trigger */}
      {hasImage ? (
        <div
          className={`relative group rounded-lg overflow-hidden border ${
            light ? "border-[var(--border-2)]" : "border-white/10"
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className="w-full h-24 object-cover" />
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <button
              onClick={() => { setUrlInput(value); setOpen(true); }}
              className="text-xs text-white bg-white/20 hover:bg-white/30 px-2 py-1 rounded backdrop-blur-sm"
            >
              Modifier
            </button>
            <button
              onClick={() => onChange("")}
              className="text-xs text-red-300 bg-red-500/20 hover:bg-red-500/30 px-2 py-1 rounded backdrop-blur-sm"
            >
              Supprimer
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => { setTab(siteId ? "library" : "url"); setOpen(true); }}
          className={
            light
              ? "w-full h-16 border border-dashed border-[var(--border-2)] rounded-lg flex flex-col items-center justify-center gap-1.5 text-[var(--text-3)] hover:border-[var(--border-strong)] hover:text-[var(--text-2)] hover:bg-[var(--hover)] transition-all"
              : "w-full h-16 border border-dashed border-white/15 rounded-lg flex flex-col items-center justify-center gap-1.5 text-white/30 hover:border-white/30 hover:text-white/50 hover:bg-white/3 transition-all"
          }
        >
          <ImageIcon size={16} />
          <span className="text-[10px]">Ajouter une image</span>
        </button>
      )}

      {/* Picker dialog */}
      {open && (
        <div className="bg-[#111827] border border-white/10 rounded-xl p-3 space-y-2.5 shadow-2xl">
          {/* Tabs */}
          <div className="flex items-center justify-between">
            <div className="flex gap-1 flex-wrap">
              {tabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`text-[10px] px-2 py-1 rounded transition-colors flex items-center gap-1 ${
                    tab === id ? "bg-white/15 text-white" : "text-white/40 hover:text-white/60"
                  }`}
                >
                  <Icon size={9} />
                  {label}
                </button>
              ))}
            </div>
            <button onClick={() => setOpen(false)} className="text-white/30 hover:text-white/60">
              <X size={12} />
            </button>
          </div>

          {/* URL tab */}
          {tab === "url" && (
            <div className="space-y-1.5">
              <input
                type="url"
                placeholder="https://example.com/image.jpg"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleUrlConfirm()}
                className="w-full bg-white/5 border border-white/10 rounded text-white text-xs px-2.5 py-1.5 placeholder-white/20 focus:outline-none focus:border-white/30"
              />
              {urlInput && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={urlInput} alt="" className="w-full h-20 object-cover rounded border border-white/10" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              )}
              <button
                onClick={handleUrlConfirm}
                className="w-full bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 text-xs py-1.5 rounded transition-colors"
              >
                Confirmer
              </button>
            </div>
          )}

          {/* Upload tab */}
          {tab === "upload" && (
            <label className="block cursor-pointer">
              {uploading ? (
                <div className="w-full h-16 flex items-center justify-center gap-2 text-white/40 text-xs">
                  <Loader2 size={14} className="animate-spin" />
                  Upload en cours…
                </div>
              ) : (
                <div className="w-full h-16 border border-dashed border-white/15 rounded-lg flex flex-col items-center justify-center gap-1.5 text-white/30 hover:border-blue-400/40 hover:text-white/50 transition-all">
                  <Upload size={16} />
                  <span className="text-[10px]">Cliquer ou déposer un fichier</span>
                  <span className="text-[9px] text-white/20">JPEG, PNG, WebP, GIF — max 10 Mo</span>
                </div>
              )}
              <input type="file" accept="image/*" className="sr-only" onChange={handleFileUpload} disabled={uploading} />
            </label>
          )}

          {/* Library tab — central media, ranked by linked enterprise */}
          {tab === "library" && (
            <div>
              {loadingLibrary ? (
                <div className="flex items-center justify-center py-6 text-white/30 gap-2 text-xs">
                  <Loader2 size={14} className="animate-spin" />
                  Chargement…
                </div>
              ) : suggested.length === 0 && others.length === 0 ? (
                <div className="text-center py-6 text-white/30 text-xs">
                  Bibliothèque vide. <a href="/media-library" className="underline">L&apos;alimenter</a>.
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {suggested.length > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-1 text-[10px] text-amber-300/80">
                        <Sparkles size={9} />
                        Suggérées pour cette entreprise ({suggested.length})
                      </div>
                      <LibraryGrid
                        items={suggested}
                        currentValue={value}
                        onPick={(url) => { onChange(url); setOpen(false); }}
                      />
                    </div>
                  )}
                  {others.length > 0 && (
                    <div className="space-y-1">
                      <button
                        onClick={() => setOthersOpen((p) => !p)}
                        className="flex items-center gap-1 text-[10px] text-white/40 hover:text-white/60 transition-colors"
                      >
                        <ChevronDown
                          size={9}
                          className={`transition-transform ${othersOpen ? "rotate-0" : "-rotate-90"}`}
                        />
                        Autres images ({others.length})
                      </button>
                      {othersOpen && (
                        <LibraryGrid
                          items={others}
                          currentValue={value}
                          onPick={(url) => { onChange(url); setOpen(false); }}
                        />
                      )}
                    </div>
                  )}
                </div>
              )}
              <a
                href="/media-library"
                target="_blank"
                rel="noreferrer"
                className="block mt-2 text-center text-[10px] text-white/30 hover:text-white/60 transition-colors"
              >
                Gérer la bibliothèque →
              </a>
            </div>
          )}

          {/* Site assets tab (existing per-site uploads) */}
          {tab === "site" && (
            <div>
              {loadingSiteAssets ? (
                <div className="flex items-center justify-center py-6 text-white/30 gap-2 text-xs">
                  <Loader2 size={14} className="animate-spin" />
                  Chargement…
                </div>
              ) : siteAssets.length === 0 ? (
                <div className="text-center py-6 text-white/30 text-xs">
                  Aucune image uploadée pour ce site.
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-1.5 max-h-44 overflow-y-auto">
                  {siteAssets.map((asset) => (
                    <div
                      key={asset.id}
                      className={`relative group rounded cursor-pointer overflow-hidden border-2 transition-all ${
                        value === asset.public_url ? "border-blue-400" : "border-transparent hover:border-white/30"
                      }`}
                      onClick={() => { onChange(asset.public_url); setOpen(false); }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={asset.public_url} alt={asset.filename} className="w-full h-16 object-cover" />
                      <button
                        onClick={(e) => handleDeleteSiteAsset(asset, e)}
                        className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-red-500/80 text-white rounded p-0.5"
                        title="Supprimer"
                      >
                        <Trash2 size={9} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LibraryGrid({
  items,
  currentValue,
  onPick,
}: {
  items: MediaLibraryItemRanked[];
  currentValue: string;
  onPick: (url: string) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => onPick(item.public_url)}
          className={`relative group rounded overflow-hidden border-2 transition-all ${
            currentValue === item.public_url
              ? "border-blue-400"
              : "border-transparent hover:border-white/30"
          }`}
          title={item.alt_text ?? item.file_name}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.public_url}
            alt={item.alt_text ?? item.file_name}
            className="w-full h-16 object-cover"
          />
          {item.is_universal && (
            <div className="absolute top-0.5 right-0.5 bg-amber-500/90 rounded-sm p-0.5">
              <Sparkles size={8} className="text-white" />
            </div>
          )}
        </button>
      ))}
    </div>
  );
}
