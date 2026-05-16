"use client";

import React from "react";
import { Search, X, Layers } from "lucide-react";
import type { SiteSectionDef } from "@/types";
import { Btn, ModalBody, ModalFt, ModalHd, ModalShell, Pill } from "./skin-primitives";

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

  const handleClose = () => {
    onHover(null);
    onClose();
  };

  return (
    <ModalShell open={open} onClose={handleClose} size="lg">
      <ModalHd
        icon={<Layers size={14} />}
        title="Remplacer la section"
        subtitle="Survolez pour prévisualiser dans le canvas, cliquez pour confirmer."
        right={<Btn variant="ghost" size="sm" icon onClick={handleClose}><X size={13} /></Btn>}
      />

      <div className="modal-search">
        <div className="search-wrap">
          <Search size={12} />
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher une section…"
            className="input"
          />
        </div>
      </div>

      <div className="modal-tabs">
        <button
          className="modal-tab"
          aria-selected={filterCategory === null ? "true" : "false"}
          onClick={() => setFilterCategory(null)}
        >
          Tout
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            className="modal-tab"
            aria-selected={filterCategory === cat ? "true" : "false"}
            onClick={() => setFilterCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      <ModalBody>
        <div className="card-grid" onMouseLeave={() => onHover(null)}>
          {filtered.length === 0 && (
            <p style={{ gridColumn: "1 / -1", textAlign: "center", fontSize: 12, color: "var(--text-4)", padding: 40, margin: 0 }}>
              Aucune section ne correspond à votre recherche.
            </p>
          )}
          {filtered.map((s) => (
            <button
              key={s.id}
              onMouseEnter={() => onHover(s)}
              onClick={() => { onPick(s); onHover(null); }}
              className="picker-card"
              style={{ textAlign: "left", appearance: "none", border: "1px solid var(--border)", background: "var(--surface)", padding: 0, font: "inherit", color: "inherit", cursor: "default" }}
            >
              <div className="preview" style={{ height: 70 }}>
                {s.preview_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.preview_image_url} alt={s.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span style={{ fontSize: 10, color: "var(--text-4)", padding: "0 8px", textAlign: "center", fontFamily: "var(--font-mono)" }}>
                    {s.category ?? "—"}
                  </span>
                )}
              </div>
              <div className="meta">
                <div className="name">{s.name}</div>
                {s.category && <div className="cat">{s.category}</div>}
              </div>
            </button>
          ))}
        </div>
      </ModalBody>
      <ModalFt>
        <Pill>{filtered.length} sections</Pill>
        <span className="grow" />
        <Btn variant="outline" onClick={handleClose}>Annuler</Btn>
      </ModalFt>
    </ModalShell>
  );
}
