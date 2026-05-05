"use client";

import React from "react";
import { Plus, X, MoreHorizontal } from "lucide-react";
import type { SitemapPage } from "@/types";
import { useRelumeBuilder, nanoid } from "./RelumeBuilderProvider";

export function PageTabsBar() {
  const { state, dispatch } = useRelumeBuilder();
  const [showAddPage, setShowAddPage] = React.useState(false);
  const [newPageTitle, setNewPageTitle] = React.useState("");
  const [newPageSlug, setNewPageSlug] = React.useState("");

  const addPage = () => {
    if (!newPageTitle.trim()) return;
    const slug = newPageSlug.trim() || `/${newPageTitle.toLowerCase().replace(/\s+/g, "-")}`;
    const page: SitemapPage = {
      id: `page-${nanoid()}`,
      slug,
      title: newPageTitle.trim(),
    };
    dispatch({ type: "ADD_PAGE", payload: page });
    setNewPageTitle("");
    setNewPageSlug("");
    setShowAddPage(false);
  };

  return (
    <div className="flex items-center border-b border-white/10 bg-[#0f0f11] px-4 overflow-x-auto">
      {state.sitemap.map((page) => (
        <PageTab key={page.id} page={page} />
      ))}

      {/* Add page */}
      {showAddPage ? (
        <div className="flex items-center gap-2 ml-2 py-2">
          <input
            autoFocus
            type="text"
            value={newPageTitle}
            onChange={(e) => setNewPageTitle(e.target.value)}
            placeholder="Titre de la page"
            className="bg-white/5 border border-white/20 rounded px-2 py-1 text-xs text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 w-32"
            onKeyDown={(e) => { if (e.key === "Enter") addPage(); if (e.key === "Escape") setShowAddPage(false); }}
          />
          <input
            type="text"
            value={newPageSlug}
            onChange={(e) => setNewPageSlug(e.target.value)}
            placeholder="/slug"
            className="bg-white/5 border border-white/20 rounded px-2 py-1 text-xs text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 w-24"
            onKeyDown={(e) => { if (e.key === "Enter") addPage(); if (e.key === "Escape") setShowAddPage(false); }}
          />
          <button
            onClick={addPage}
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            OK
          </button>
          <button
            onClick={() => setShowAddPage(false)}
            className="text-xs text-white/30 hover:text-white/60 transition-colors"
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowAddPage(true)}
          className="flex items-center gap-1 ml-2 px-2 py-1 text-white/30 hover:text-white/60 text-xs transition-colors flex-shrink-0"
          title="Ajouter une page"
        >
          <Plus size={14} />
        </button>
      )}
    </div>
  );
}

function PageTab({ page }: { page: SitemapPage }) {
  const { state, dispatch } = useRelumeBuilder();
  const isActive = state.activePage === page.slug;
  const isHome = page.slug === "/";

  return (
    <button
      onClick={() => dispatch({ type: "SET_ACTIVE_PAGE", payload: page.slug })}
      className={`flex items-center gap-1.5 px-3 py-2.5 text-xs border-b-2 transition-all flex-shrink-0 ${
        isActive
          ? "border-blue-500 text-white font-medium"
          : "border-transparent text-white/40 hover:text-white/70"
      }`}
    >
      {isHome && <span className="text-xs">🏠</span>}
      {page.title}
      {!isHome && isActive && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`Supprimer la page "${page.title}" ?`)) {
              dispatch({ type: "REMOVE_PAGE", payload: page.id });
            }
          }}
          className="ml-1 text-white/30 hover:text-red-400 transition-colors"
        >
          <X size={10} />
        </button>
      )}
    </button>
  );
}
