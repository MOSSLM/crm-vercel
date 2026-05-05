"use client";

import React from "react";
import { Search, X, Plus } from "lucide-react";
import type { SiteSectionDef, SiteSectionInstance } from "@/types";
import { useRelumeBuilder, nanoid } from "./RelumeBuilderProvider";

interface SectionLibraryPanelProps {
  sections: SiteSectionDef[];
}

const CATEGORIES = ["Tous", "Hero", "Services", "Content", "Social Proof", "Contact", "CTA", "Media"];

export function SectionLibraryPanel({ sections }: SectionLibraryPanelProps) {
  const { state, dispatch } = useRelumeBuilder();
  const [search, setSearch] = React.useState("");
  const [activeCategory, setActiveCategory] = React.useState("Tous");

  const filtered = sections.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.tags ?? []).some((t) => t.toLowerCase().includes(search.toLowerCase()));
    const matchesCat = activeCategory === "Tous" || s.category === activeCategory;
    return matchesSearch && matchesCat;
  });

  const addSection = (sectionDef: SiteSectionDef) => {
    const newInstance: SiteSectionInstance = {
      id: nanoid(),
      site_id: state.siteId,
      section_id: sectionDef.id,
      page_slug: state.activePage,
      sort_order: (state.instancesByPage[state.activePage] ?? []).length,
      content: { ...sectionDef.default_content },
      custom_style: {},
      is_hidden: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      section_def: sectionDef,
    };
    dispatch({ type: "ADD_INSTANCE", payload: { instance: newInstance, pageSlug: state.activePage } });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-white/10">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">Sections</span>
          <button
            onClick={() => dispatch({ type: "TOGGLE_LIBRARY" })}
            className="text-white/40 hover:text-white/80 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher..."
            className="w-full pl-8 pr-3 py-2 text-xs rounded-md bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50"
          />
        </div>
      </div>

      {/* Category tabs */}
      <div className="px-3 py-2 flex gap-1 flex-wrap border-b border-white/10">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              activeCategory === cat
                ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                : "text-white/40 hover:text-white/70"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Sections list */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {filtered.length === 0 && (
          <p className="text-white/30 text-xs text-center py-6">Aucune section trouvée</p>
        )}
        {filtered.map((section) => (
          <button
            key={section.id}
            onClick={() => addSection(section)}
            className="w-full text-left group border border-white/10 rounded-lg p-3 hover:border-blue-500/40 hover:bg-blue-500/5 transition-all"
          >
            {/* Preview thumbnail placeholder */}
            <div
              className="w-full h-16 rounded-md mb-2 bg-white/5 flex items-center justify-center overflow-hidden"
            >
              {section.preview_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={section.preview_image_url} alt={section.name} className="w-full h-full object-cover" />
              ) : (
                <SectionPreviewMini sectionDef={section} />
              )}
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-medium text-white/80 group-hover:text-white transition-colors">
                  {section.name}
                </div>
                {section.category && (
                  <div className="text-xs text-white/30 mt-0.5">{section.category}</div>
                )}
              </div>
              <Plus size={14} className="text-white/30 group-hover:text-blue-400 transition-colors flex-shrink-0" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Minimal visual preview of a section's layout */
function SectionPreviewMini({ sectionDef }: { sectionDef: SiteSectionDef }) {
  const { structure } = sectionDef;
  const snippetCount = structure.snippets.length;

  return (
    <div className="w-full h-full p-2 flex flex-col gap-1 items-center justify-center">
      {Array.from({ length: Math.min(snippetCount, 4) }).map((_, i) => {
        const snippet = structure.snippets[i];
        const isHeading = snippet.type === "heading";
        const isImage = snippet.type === "image";
        const isButton = snippet.type === "button" || snippet.type === "button-group";

        return (
          <div
            key={i}
            className="rounded"
            style={{
              backgroundColor: isButton ? "#3b82f620" : "#ffffff15",
              height: isHeading ? "8px" : isImage ? "20px" : isButton ? "10px" : "5px",
              width: isHeading ? "70%" : isImage ? "80%" : isButton ? "40%" : "55%",
            }}
          />
        );
      })}
    </div>
  );
}
