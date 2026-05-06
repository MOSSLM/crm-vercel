"use client";

import React from "react";
import { Search, X, Plus } from "lucide-react";
import type { SiteSectionDef, SiteSectionInstance } from "@/types";
import { useRelumeBuilder, nanoid } from "./RelumeBuilderProvider";

interface SectionLibraryPanelProps {
  sections: SiteSectionDef[];
}

const CATEGORIES = [
  { id: "Tous", label: "Tous" },
  { id: "headers", label: "Headers" },
  { id: "heros", label: "Héros" },
  { id: "features", label: "Features" },
  { id: "layouts", label: "Layouts" },
  { id: "testimonials", label: "Avis" },
  { id: "logos", label: "Logos" },
  { id: "gallery", label: "Galerie" },
  { id: "faq", label: "FAQ" },
  { id: "cta", label: "CTA" },
  { id: "footers", label: "Footers" },
  { id: "misc", label: "Divers" },
];

export function SectionLibraryPanel({ sections }: SectionLibraryPanelProps) {
  const { state, dispatch } = useRelumeBuilder();
  const [search, setSearch] = React.useState("");
  const [activeCategory, setActiveCategory] = React.useState("Tous");

  const filtered = sections.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.tags ?? []).some((t) => t.toLowerCase().includes(search.toLowerCase())) ||
      (s.type ?? "").toLowerCase().includes(search.toLowerCase());
    const matchesCat = activeCategory === "Tous" || s.category === activeCategory;
    return matchesSearch && matchesCat;
  });

  const addSection = (sectionDef: SiteSectionDef) => {
    // Build content: merge default_content + library reference for persistence
    const baseContent: Record<string, unknown> = { ...sectionDef.default_content };
    if (sectionDef.theme_slug && sectionDef.theme_section_id) {
      baseContent.__library = {
        theme_slug: sectionDef.theme_slug,
        section_id: sectionDef.theme_section_id,
      };
    }

    const newInstance: SiteSectionInstance = {
      id: nanoid(),
      site_id: state.siteId,
      section_id: null,
      page_slug: state.activePage,
      sort_order: (state.instancesByPage[state.activePage] ?? []).length,
      content: baseContent,
      custom_style: {},
      is_hidden: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      section_def: sectionDef,
    };
    dispatch({ type: "ADD_INSTANCE", payload: { instance: newInstance, pageSlug: state.activePage } });
  };

  const presentCategories = React.useMemo(() => {
    const used = new Set(sections.map((s) => s.category ?? "misc"));
    return CATEGORIES.filter((c) => c.id === "Tous" || used.has(c.id));
  }, [sections]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-white/10">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">
            Sections ({sections.length})
          </span>
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
        {presentCategories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              activeCategory === cat.id
                ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                : "text-white/40 hover:text-white/70"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {sections.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 py-10 px-4 text-center">
          <p className="text-white/30 text-xs">
            Aucune section dans la bibliothèque.
          </p>
          <a
            href="/sections-library"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-400 hover:text-blue-300 underline underline-offset-2"
          >
            Créer des sections →
          </a>
        </div>
      )}

      {/* Sections list */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {sections.length > 0 && filtered.length === 0 && (
          <p className="text-white/30 text-xs text-center py-6">Aucune section trouvée</p>
        )}
        {filtered.map((section) => (
          <button
            key={section.id}
            onClick={() => addSection(section)}
            className="w-full text-left group border border-white/10 rounded-lg p-3 hover:border-blue-500/40 hover:bg-blue-500/5 transition-all"
          >
            <div className="w-full h-14 rounded-md mb-2 bg-white/5 flex items-center justify-center overflow-hidden">
              {section.preview_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={section.preview_image_url}
                  alt={section.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <SectionPreviewMini category={section.category} name={section.name} />
              )}
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-medium text-white/80 group-hover:text-white transition-colors">
                  {section.name}
                </div>
                {section.category && (
                  <div className="text-xs text-white/30 mt-0.5 capitalize">
                    {CATEGORIES.find((c) => c.id === section.category)?.label ?? section.category}
                  </div>
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

function SectionPreviewMini({ category, name }: { category?: string; name: string }) {
  const lname = (category + " " + name).toLowerCase();

  const isHero = lname.includes("hero");
  const isHeader = lname.includes("header") || lname.includes("navbar") || lname.includes("nav");
  const isFooter = lname.includes("footer");
  const isCta = lname.includes("cta");
  const isTestimonial = lname.includes("testim") || lname.includes("avis");
  const isGallery = lname.includes("gallery") || lname.includes("galerie");
  const isFaq = lname.includes("faq");
  const isLogos = lname.includes("logo");

  if (isHeader) {
    return (
      <div className="w-full h-full flex items-center justify-between px-3 py-2">
        <div className="w-10 h-2 bg-white/30 rounded" />
        <div className="flex gap-1.5">
          {[1, 2, 3].map((i) => <div key={i} className="w-6 h-1.5 bg-white/20 rounded" />)}
        </div>
        <div className="w-8 h-4 bg-blue-400/30 rounded" />
      </div>
    );
  }
  if (isFooter) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-end px-3 pb-2 gap-1">
        <div className="w-full h-px bg-white/10 mb-1" />
        <div className="flex gap-3">
          {[1, 2, 3].map((i) => <div key={i} className="w-6 h-1.5 bg-white/20 rounded" />)}
        </div>
        <div className="w-16 h-1 bg-white/10 rounded" />
      </div>
    );
  }
  if (isHero) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 px-3">
        <div className="w-2/3 h-2.5 bg-white/40 rounded" />
        <div className="w-1/2 h-1.5 bg-white/20 rounded" />
        <div className="flex gap-1.5 mt-1">
          <div className="w-10 h-3 bg-blue-400/40 rounded" />
          <div className="w-10 h-3 bg-white/10 rounded border border-white/20" />
        </div>
      </div>
    );
  }
  if (isGallery) {
    return (
      <div className="w-full h-full grid grid-cols-3 gap-1 p-2">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="bg-white/15 rounded" />
        ))}
      </div>
    );
  }
  if (isLogos) {
    return (
      <div className="w-full h-full flex items-center justify-center gap-2 px-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="w-8 h-4 bg-white/15 rounded" />
        ))}
      </div>
    );
  }
  if (isFaq) {
    return (
      <div className="w-full h-full flex flex-col justify-center gap-1.5 px-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="w-full h-2 bg-white/15 rounded" />
        ))}
      </div>
    );
  }
  if (isCta) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-1.5">
        <div className="w-1/2 h-2 bg-white/30 rounded" />
        <div className="w-14 h-4 bg-blue-400/40 rounded" />
      </div>
    );
  }
  if (isTestimonial) {
    return (
      <div className="w-full h-full flex items-center justify-center gap-1.5 px-2">
        {[1, 2].map((i) => (
          <div key={i} className="flex-1 h-full bg-white/10 rounded p-1 flex flex-col gap-1">
            <div className="w-full h-1.5 bg-white/20 rounded" />
            <div className="w-2/3 h-1 bg-white/15 rounded" />
          </div>
        ))}
      </div>
    );
  }
  // Default layout preview
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 px-3">
      <div className="w-2/3 h-2 bg-white/25 rounded" />
      <div className="w-full h-1.5 bg-white/15 rounded" />
      <div className="w-4/5 h-1.5 bg-white/15 rounded" />
    </div>
  );
}
