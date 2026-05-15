"use client";

import React from "react";
import { Search, X } from "lucide-react";
import type { SiteSectionDef } from "@/types";

interface Props {
  open: boolean;
  /** Sections to choose from. */
  sections: SiteSectionDef[];
  /** Pre-filter to this category. Pass null to start unfiltered. */
  initialCategory?: string | null;
  onPick: (sectionDef: SiteSectionDef) => void;
  /** Fires on mouse-enter / mouse-leave for live in-canvas preview. */
  onHover: (sectionDef: SiteSectionDef | null) => void;
  onClose: () => void;
}

export function SectionPickerModal({ open, sections, initialCategory, onPick, onHover, onClose }: Props) {
  const [search, setSearch] = React.useState("");
  const [filterCategory, setFilterCategory] = React.useState<string | null>(initialCategory ?? null);

  React.useEffect(() => {
    if (open) {
      setFilterCategory(initialCategory ?? null);
      setSearch("");
    }
  }, [open, initialCategory]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onHover(null);
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, onHover]);

  const categories = React.useMemo(() => {
    const set = new Set<string>();
    for (const s of sections) {
      if (s.category) set.add(s.category);
    }
    return Array.from(set).sort();
  }, [sections]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return sections.filter((s) => {
      if (filterCategory && s.category !== filterCategory) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        (s.category ?? "").toLowerCase().includes(q) ||
        (s.tags ?? []).some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [sections, filterCategory, search]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={() => {
        onHover(null);
        onClose();
      }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
          <div className="flex-1">
            <div className="text-sm font-semibold text-gray-800">Remplacer la section</div>
            <div className="text-[11px] text-gray-400 mt-0.5">
              Survolez une section pour la prévisualiser dans le canvas, cliquez pour confirmer.
            </div>
          </div>
          <button
            onClick={() => {
              onHover(null);
              onClose();
            }}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher une section..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-blue-400 text-gray-800"
            />
          </div>
          <button
            onClick={() => setFilterCategory(null)}
            className={`px-2 py-1 text-[10px] rounded-md transition-colors ${
              filterCategory === null
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            Tout
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`px-2 py-1 text-[10px] rounded-md transition-colors ${
                filterCategory === cat
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div
          className="flex-1 overflow-y-auto p-3 grid grid-cols-2 sm:grid-cols-3 gap-3"
          onMouseLeave={() => onHover(null)}
        >
          {filtered.length === 0 && (
            <p className="col-span-full text-center text-xs text-gray-400 py-12">
              Aucune section ne correspond à votre recherche.
            </p>
          )}
          {filtered.map((s) => (
            <button
              key={s.id}
              onMouseEnter={() => onHover(s)}
              onClick={() => {
                onPick(s);
                onHover(null);
              }}
              className="text-left border border-gray-200 hover:border-blue-400 hover:shadow-md rounded-lg p-3 transition-all bg-white"
            >
              <div className="h-16 bg-gray-50 rounded mb-2 flex items-center justify-center overflow-hidden">
                {s.preview_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.preview_image_url} alt={s.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[10px] text-gray-400 px-2 text-center">{s.category ?? "—"}</span>
                )}
              </div>
              <div className="text-xs font-medium text-gray-800 truncate">{s.name}</div>
              {s.category && (
                <div className="text-[10px] text-gray-400 mt-0.5 capitalize">{s.category}</div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
