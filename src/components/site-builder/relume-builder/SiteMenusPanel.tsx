"use client";

import React from "react";
import {
  Plus, Trash2, GripVertical, ChevronDown, ChevronRight,
  Navigation, List, ExternalLink, RefreshCw, X,
} from "lucide-react";
import type { SiteMenuItem, SiteMenus } from "@/types";
import { useRelumeBuilder, nanoid } from "./RelumeBuilderProvider";

// ─── MenuItem row (recursive for sub-items) ───────────────────────────────────

function MenuItemRow({
  item,
  depth = 0,
  onUpdate,
  onRemove,
  onAddChild,
}: {
  item: SiteMenuItem;
  depth?: number;
  onUpdate: (updated: SiteMenuItem) => void;
  onRemove: () => void;
  onAddChild: () => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const hasChildren = (item.children ?? []).length > 0;

  return (
    <div className={`${depth > 0 ? "ml-4 border-l border-gray-100 pl-2" : ""}`}>
      <div className="group flex items-center gap-1.5 py-1">
        <GripVertical size={12} className="text-gray-300 flex-shrink-0 cursor-grab" />
        {hasChildren || depth === 0 ? (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-gray-400 hover:text-gray-600 flex-shrink-0"
          >
            {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          </button>
        ) : (
          <span className="w-[14px] flex-shrink-0" />
        )}
        <input
          value={item.label}
          onChange={(e) => onUpdate({ ...item, label: e.target.value })}
          placeholder="Libellé"
          className="flex-1 bg-gray-50 border border-gray-200 rounded px-2 py-1 text-xs text-gray-800 focus:outline-none focus:border-blue-400 min-w-0"
        />
        <input
          value={item.url}
          onChange={(e) => onUpdate({ ...item, url: e.target.value })}
          placeholder="URL ou /chemin"
          className="flex-1 bg-gray-50 border border-gray-200 rounded px-2 py-1 text-xs text-gray-600 font-mono focus:outline-none focus:border-blue-400 min-w-0"
        />
        <button
          onClick={() => onUpdate({ ...item, external: !item.external })}
          title="Ouvrir dans un nouvel onglet"
          className={`p-1 rounded transition-colors flex-shrink-0 ${item.external ? "text-blue-500 bg-blue-50" : "text-gray-300 hover:text-gray-500"}`}
        >
          <ExternalLink size={10} />
        </button>
        {depth === 0 && (
          <button
            onClick={onAddChild}
            title="Ajouter un sous-lien"
            className="p-1 rounded text-gray-300 hover:text-gray-600 hover:bg-gray-50 flex-shrink-0"
          >
            <Plus size={10} />
          </button>
        )}
        <button
          onClick={onRemove}
          className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Trash2 size={10} />
        </button>
      </div>
      {expanded && hasChildren && (
        <div className="ml-2">
          {(item.children ?? []).map((child, ci) => (
            <MenuItemRow
              key={child.id}
              item={child}
              depth={depth + 1}
              onUpdate={(updated) => {
                const children = [...(item.children ?? [])];
                children[ci] = updated;
                onUpdate({ ...item, children });
              }}
              onRemove={() => {
                const children = (item.children ?? []).filter((_, i) => i !== ci);
                onUpdate({ ...item, children });
              }}
              onAddChild={() => {}}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Single menu editor ───────────────────────────────────────────────────────

function MenuEditor({
  label,
  items,
  onChange,
  allowChildren = false,
}: {
  label: string;
  items: SiteMenuItem[];
  onChange: (items: SiteMenuItem[]) => void;
  allowChildren?: boolean;
}) {
  const addItem = () => {
    onChange([...items, { id: nanoid(), label: "Nouveau lien", url: "/" }]);
  };

  const updateItem = (idx: number, updated: SiteMenuItem) => {
    const next = [...items];
    next[idx] = updated;
    onChange(next);
  };

  const removeItem = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx));
  };

  const addChild = (parentIdx: number) => {
    const parent = items[parentIdx];
    const children = [...(parent.children ?? []), { id: nanoid(), label: "Sous-lien", url: "/" }];
    updateItem(parentIdx, { ...parent, children });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{label}</span>
        <button
          onClick={addItem}
          className="flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-700 px-2 py-1 rounded hover:bg-blue-50 transition-colors"
        >
          <Plus size={10} />
          Ajouter
        </button>
      </div>
      <div className="border border-gray-100 rounded-lg overflow-hidden bg-gray-50/50">
        {items.length === 0 && (
          <p className="text-[10px] text-gray-400 text-center py-4 italic">Aucun lien. Cliquez sur Ajouter.</p>
        )}
        {items.map((item, idx) => (
          <div key={item.id} className="border-b border-gray-100 last:border-b-0 px-2 py-0.5">
            <MenuItemRow
              item={item}
              onUpdate={(updated) => updateItem(idx, updated)}
              onRemove={() => removeItem(idx)}
              onAddChild={allowChildren ? () => addChild(idx) : () => {}}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Menus Panel ─────────────────────────────────────────────────────────

export function SiteMenusPanel() {
  const { state, dispatch } = useRelumeBuilder();
  const { menus, sitemap } = state;

  const updateMenu = (key: keyof SiteMenus, items: SiteMenuItem[]) => {
    dispatch({ type: "UPDATE_MENUS", payload: { [key]: items } });
  };

  const syncFromSitemap = () => {
    dispatch({ type: "SYNC_MENUS_FROM_SITEMAP" });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <Navigation size={14} className="text-gray-500" />
          <span className="text-sm font-semibold text-gray-800">Menus de navigation</span>
        </div>
        <button
          onClick={syncFromSitemap}
          title="Réinitialiser depuis le sitemap"
          className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-700 px-2 py-1 border border-gray-200 rounded hover:bg-gray-50"
        >
          <RefreshCw size={10} />
          Sync sitemap
        </button>
      </div>

      {/* Info */}
      <div className="mx-4 mt-3 mb-1 p-2 bg-blue-50 rounded-md text-[10px] text-blue-700 leading-relaxed">
        Ces menus sont automatiquement transmis aux sections Navbar et Footer. Modifiez-les ici pour mettre à jour la navigation sur toutes les pages.
      </div>

      {/* Menus */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-6">
        <MenuEditor
          label="Menu principal (Navbar)"
          items={menus.nav}
          onChange={(items) => updateMenu("nav", items)}
          allowChildren
        />
        <MenuEditor
          label="Menu footer"
          items={menus.footer}
          onChange={(items) => updateMenu("footer", items)}
        />
        <MenuEditor
          label="Liens légaux (footer bas)"
          items={menus.footerLegal}
          onChange={(items) => updateMenu("footerLegal", items)}
        />
      </div>

      {/* Sitemap reference */}
      <div className="px-4 py-3 border-t border-gray-100 flex-shrink-0">
        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Pages du sitemap</div>
        <div className="flex flex-wrap gap-1">
          {sitemap.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 rounded text-[10px] text-gray-600">
              <List size={8} />
              {p.title}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
