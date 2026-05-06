"use client";

import React, { useState } from "react";
import { ImageIcon, Link, X, Upload } from "lucide-react";
import type { SectionImagePickerField } from "@/types";

interface ImagePickerFieldProps {
  setting: SectionImagePickerField;
  value: string;
  onChange: (url: string) => void;
}

export function ImagePickerField({ setting, value, onChange }: ImagePickerFieldProps) {
  const [tab, setTab] = useState<"url" | "upload">("url");
  const [open, setOpen] = useState(false);
  const [urlInput, setUrlInput] = useState(value ?? "");

  const hasImage = value && value.length > 0;

  function handleUrlConfirm() {
    onChange(urlInput);
    setOpen(false);
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Convert to object URL for preview; in production would upload to Supabase
    const objectUrl = URL.createObjectURL(file);
    onChange(objectUrl);
    setOpen(false);
  }

  return (
    <div className="space-y-1.5">
      {/* Preview / trigger */}
      {hasImage ? (
        <div className="relative group rounded-lg overflow-hidden border border-white/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className="w-full h-24 object-cover" />
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <button
              onClick={() => setOpen(true)}
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
          onClick={() => setOpen(true)}
          className="w-full h-16 border border-dashed border-white/15 rounded-lg flex flex-col items-center justify-center gap-1.5 text-white/30 hover:border-white/30 hover:text-white/50 hover:bg-white/3 transition-all"
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
            <div className="flex gap-1">
              {(["url", "upload"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`text-[10px] px-2 py-1 rounded transition-colors ${
                    tab === t ? "bg-white/15 text-white" : "text-white/40 hover:text-white/60"
                  }`}
                >
                  {t === "url" ? <><Link size={9} className="inline mr-1" />URL</> : <><Upload size={9} className="inline mr-1" />Upload</>}
                </button>
              ))}
            </div>
            <button onClick={() => setOpen(false)} className="text-white/30 hover:text-white/60">
              <X size={12} />
            </button>
          </div>

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

          {tab === "upload" && (
            <label className="block cursor-pointer">
              <div className="w-full h-16 border border-dashed border-white/15 rounded-lg flex flex-col items-center justify-center gap-1.5 text-white/30 hover:border-blue-400/40 hover:text-white/50 transition-all">
                <Upload size={16} />
                <span className="text-[10px]">Cliquer ou déposer un fichier</span>
              </div>
              <input type="file" accept="image/*" className="sr-only" onChange={handleFileUpload} />
            </label>
          )}
        </div>
      )}
    </div>
  );
}
