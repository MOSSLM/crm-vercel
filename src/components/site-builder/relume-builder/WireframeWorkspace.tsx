"use client";

import React from "react";
import {
  Laptop, Tablet, Smartphone, Plus, Trash2, Layers,
  Search, Sparkles, GripVertical, MoreHorizontal,
  ChevronDown, RefreshCw
} from "lucide-react";
import type { SiteSectionDef, SiteSectionInstance } from "@/types";
import { useRelumeBuilder, nanoid } from "./RelumeBuilderProvider";

// ─── Pan/Zoom hook ────────────────────────────────────────────────────────────

function useCanvasPanZoom(initialPan = { x: 40, y: 40 }) {
  const [pan, setPan] = React.useState(initialPan);
  const [scale, setScale] = React.useState(0.75);
  const isPanning = React.useRef(false);
  const lastPos = React.useRef({ x: 0, y: 0 });
  const spaceHeld = React.useRef(false);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      spaceHeld.current = e.type === "keydown" && e.code === "Space";
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onKey); };
  }, []);

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || spaceHeld.current) {
      isPanning.current = true;
      lastPos.current = { x: e.clientX, y: e.clientY };
      e.preventDefault();
    }
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!isPanning.current) return;
    setPan((p) => ({ x: p.x + e.clientX - lastPos.current.x, y: p.y + e.clientY - lastPos.current.y }));
    lastPos.current = { x: e.clientX, y: e.clientY };
  };
  const onMouseUp = () => { isPanning.current = false; };
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setScale((s) => Math.min(2, Math.max(0.2, s * (e.deltaY > 0 ? 0.9 : 1.1))));
  };

  return { pan, scale, onMouseDown, onMouseMove, onMouseUp, onWheel };
}

// ─── Section type categories ──────────────────────────────────────────────────

const CATEGORIES = ["Tous", "Hero", "Services", "Content", "Social Proof", "Contact", "CTA", "Media"];

// ─── Wireframe block renderers ────────────────────────────────────────────────

function WireframeBlock({ type, name }: { type: string; name: string }) {
  const lname = (name + " " + type).toLowerCase();

  if (lname.includes("hero")) {
    return (
      <div className="bg-gray-100 px-4 py-6 flex flex-col items-center gap-3">
        <div className="w-2/3 h-3 bg-gray-300 rounded" />
        <div className="w-1/2 h-2 bg-gray-200 rounded" />
        <div className="w-1/3 h-2 bg-gray-200 rounded" />
        <div className="flex gap-2 mt-1">
          <div className="w-16 h-5 bg-gray-400 rounded" />
          <div className="w-16 h-5 bg-gray-200 border border-gray-300 rounded" />
        </div>
        <div className="w-full h-20 bg-gray-200 rounded-lg mt-2 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-gray-400 text-xs">▶</div>
        </div>
      </div>
    );
  }

  if (lname.includes("service") || lname.includes("feature")) {
    return (
      <div className="bg-white px-4 py-4 flex flex-col gap-2">
        <div className="w-1/3 h-2 bg-gray-300 rounded" />
        <div className="w-2/3 h-2 bg-gray-200 rounded" />
        <div className="grid grid-cols-3 gap-2 mt-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-gray-100 rounded p-2 flex flex-col gap-1">
              <div className="w-5 h-5 bg-gray-300 rounded" />
              <div className="w-full h-1.5 bg-gray-200 rounded" />
              <div className="w-3/4 h-1.5 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (lname.includes("testimonial")) {
    return (
      <div className="bg-gray-50 px-4 py-4 flex flex-col gap-2">
        <div className="w-1/3 h-2 bg-gray-300 rounded" />
        <div className="grid grid-cols-3 gap-2 mt-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-white border border-gray-100 rounded p-2 flex flex-col gap-1">
              <div className="flex gap-1 mb-1">
                {[0, 1, 2].map((s) => <div key={s} className="w-2 h-2 bg-amber-300 rounded-full" />)}
              </div>
              <div className="w-full h-1 bg-gray-200 rounded" />
              <div className="w-full h-1 bg-gray-200 rounded" />
              <div className="flex items-center gap-1 mt-1">
                <div className="w-4 h-4 rounded-full bg-gray-200" />
                <div className="w-10 h-1 bg-gray-200 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (lname.includes("contact")) {
    return (
      <div className="bg-white px-4 py-4 flex flex-col gap-2">
        <div className="w-1/3 h-2 bg-gray-300 rounded" />
        <div className="flex gap-3 mt-1">
          <div className="flex-1 flex flex-col gap-2">
            <div className="w-full h-5 bg-gray-100 border border-gray-200 rounded" />
            <div className="w-full h-5 bg-gray-100 border border-gray-200 rounded" />
            <div className="w-full h-12 bg-gray-100 border border-gray-200 rounded" />
            <div className="w-20 h-5 bg-gray-400 rounded" />
          </div>
          <div className="flex-1 bg-gray-100 rounded flex items-center justify-center">
            <div className="text-gray-300 text-xs">📍</div>
          </div>
        </div>
      </div>
    );
  }

  if (lname.includes("faq")) {
    return (
      <div className="bg-white px-4 py-4 flex flex-col gap-1.5">
        <div className="w-1/3 h-2 bg-gray-300 rounded mb-2" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center justify-between p-2 border border-gray-100 rounded">
            <div className="w-3/4 h-1.5 bg-gray-200 rounded" />
            <div className="w-3 h-3 bg-gray-200 rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  if (lname.includes("stat") || lname.includes("chiffre")) {
    return (
      <div className="bg-gray-900 px-4 py-4 flex flex-col gap-2">
        <div className="w-1/3 h-2 bg-gray-600 rounded" />
        <div className="grid grid-cols-3 gap-3 mt-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <div className="w-12 h-5 bg-gray-500 rounded" />
              <div className="w-8 h-1.5 bg-gray-600 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (lname.includes("cta") || lname.includes("banner")) {
    return (
      <div className="bg-blue-600 px-4 py-4 flex flex-col items-center gap-2">
        <div className="w-2/3 h-3 bg-blue-400 rounded" />
        <div className="w-1/2 h-2 bg-blue-400/70 rounded" />
        <div className="w-20 h-5 bg-white rounded mt-1" />
      </div>
    );
  }

  // Generic section
  return (
    <div className="bg-white px-4 py-4 flex flex-col gap-2">
      <div className="w-1/3 h-2 bg-gray-300 rounded" />
      <div className="w-full h-2 bg-gray-200 rounded" />
      <div className="w-3/4 h-2 bg-gray-200 rounded" />
      <div className="w-full h-16 bg-gray-100 rounded mt-1" />
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface WireframeWorkspaceProps {
  sectionDefs: Record<string, SiteSectionDef>;
  availableSections: SiteSectionDef[];
  onRegenerateSection?: (instanceId: string, prompt: string) => Promise<void>;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function WireframeWorkspace({ sectionDefs, availableSections }: WireframeWorkspaceProps) {
  const { state, dispatch } = useRelumeBuilder();
  const canvas = useCanvasPanZoom();
  const [leftPanel, setLeftPanel] = React.useState<"library" | "ai" | null>("library");
  const [search, setSearch] = React.useState("");
  const [activeCategory, setActiveCategory] = React.useState("Tous");
  const [sectionMenuOpen, setSectionMenuOpen] = React.useState<string | null>(null);
  const [sectionTypePicker, setSectionTypePicker] = React.useState<string | null>(null);

  const filteredSections = availableSections.filter((s) => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.tags ?? []).some((t) => t.toLowerCase().includes(search.toLowerCase()));
    const matchCat = activeCategory === "Tous" || s.category === activeCategory;
    return matchSearch && matchCat;
  });

  const addSection = (pageSlug: string, sectionDef: SiteSectionDef) => {
    const newInstance: SiteSectionInstance = {
      id: nanoid(),
      site_id: state.siteId,
      section_id: sectionDef.id,
      page_slug: pageSlug,
      sort_order: (state.instancesByPage[pageSlug] ?? []).length,
      content: { ...sectionDef.default_content },
      custom_style: {},
      is_hidden: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      section_def: sectionDef,
    };
    dispatch({ type: "ADD_INSTANCE", payload: { instance: newInstance, pageSlug } });
  };

  const swapSectionType = (instanceId: string, newDef: SiteSectionDef) => {
    const inst = state.instances[instanceId];
    if (!inst) return;
    dispatch({
      type: "UPDATE_INSTANCE_CONTENT",
      payload: { id: instanceId, content: { ...newDef.default_content } },
    });
    dispatch({
      type: "UPDATE_INSTANCE_STYLE",
      payload: { id: instanceId, style: { _section_def_id: newDef.id, _section_def_type: newDef.type } },
    });
    setSectionTypePicker(null);
  };

  const PAGE_COL_WIDTH = 240;
  const PAGE_COL_GAP = 48;

  return (
    <div className="flex h-full bg-[#f0f0f0] overflow-hidden">

      {/* ─ Left Panel ──────────────────────────────────────────────────────────── */}
      {leftPanel && (
        <div className="w-[260px] flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
          {/* Panel tabs */}
          <div className="flex border-b border-gray-100">
            <button
              onClick={() => setLeftPanel("library")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-colors ${leftPanel === "library" ? "text-gray-900 border-b-2 border-gray-900" : "text-gray-400 hover:text-gray-600"}`}
            >
              <Layers size={12} />
              Sections
            </button>
            <button
              onClick={() => setLeftPanel("ai")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-colors ${leftPanel === "ai" ? "text-purple-600 border-b-2 border-purple-600" : "text-gray-400 hover:text-gray-600"}`}
            >
              <Sparkles size={12} />
              IA
            </button>
          </div>

          {leftPanel === "library" && (
            <>
              <div className="p-3 border-b border-gray-100">
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Rechercher..."
                    className="w-full pl-7 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-gray-400 text-gray-800"
                  />
                </div>
                <div className="flex gap-1 mt-2 flex-wrap">
                  {CATEGORIES.slice(0, 5).map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setActiveCategory(cat)}
                      className={`px-2 py-0.5 text-[10px] rounded-full transition-colors ${activeCategory === cat ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {filteredSections.map((sec) => (
                  <div
                    key={sec.id}
                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 group cursor-default"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-gray-800 truncate">{sec.name}</div>
                      <div className="text-[10px] text-gray-400 truncate">{sec.category}</div>
                    </div>
                    <button
                      onClick={() => addSection(state.activePage, sec)}
                      className="opacity-0 group-hover:opacity-100 p-1 bg-gray-900 text-white rounded transition-all"
                      title="Ajouter à la page active"
                    >
                      <Plus size={10} />
                    </button>
                  </div>
                ))}
                {filteredSections.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-8">Aucune section trouvée</p>
                )}
              </div>
            </>
          )}

          {leftPanel === "ai" && (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
              <Sparkles size={24} className="text-purple-400 mb-3" />
              <p className="text-sm font-medium text-gray-700 mb-1">Assistant IA</p>
              <p className="text-xs text-gray-400">Générez du contenu textuel pour vos sections depuis le Sitemap.</p>
            </div>
          )}
        </div>
      )}

      {/* Panel toggle */}
      <button
        onClick={() => setLeftPanel(leftPanel ? null : "library")}
        className="absolute left-[260px] top-1/2 -translate-y-1/2 z-20 w-5 h-12 bg-white border border-gray-200 border-l-0 rounded-r-md flex items-center justify-center text-gray-400 hover:text-gray-600 shadow-sm"
        style={{ left: leftPanel ? 260 : 0 }}
      >
        <ChevronDown size={12} className={`transition-transform ${leftPanel ? "-rotate-90" : "rotate-90"}`} />
      </button>

      {/* ─ Canvas ──────────────────────────────────────────────────────────────── */}
      <div
        className="flex-1 overflow-hidden relative"
        onMouseDown={canvas.onMouseDown}
        onMouseMove={canvas.onMouseMove}
        onMouseUp={canvas.onMouseUp}
        onWheel={canvas.onWheel}
      >
        {/* Dot grid */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(circle, #c8c8c8 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />

        <div
          style={{
            transform: `translate(${canvas.pan.x}px, ${canvas.pan.y}px) scale(${canvas.scale})`,
            transformOrigin: "0 0",
            position: "absolute",
            display: "flex",
            gap: PAGE_COL_GAP,
            alignItems: "flex-start",
          }}
        >
          {state.sitemap.map((page) => {
            const instanceIds = state.instancesByPage[page.slug] ?? [];

            return (
              <div
                key={page.id}
                style={{ width: PAGE_COL_WIDTH, flexShrink: 0 }}
                className="flex flex-col"
              >
                {/* Page header */}
                <div
                  className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-t-xl mb-0 cursor-pointer select-none"
                  onClick={() => dispatch({ type: "SET_ACTIVE_PAGE", payload: page.slug })}
                >
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${state.activePage === page.slug ? "bg-blue-500" : "bg-gray-300"}`} />
                  <span className="text-xs font-semibold text-gray-800 flex-1 truncate">{page.title}</span>
                  <span className="text-[10px] text-gray-400">{page.slug}</span>
                </div>

                {/* Page column body */}
                <div className="bg-white border border-t-0 border-gray-200 rounded-b-xl overflow-hidden shadow-sm flex flex-col">
                  {instanceIds.map((instanceId, idx) => {
                    const instance = state.instances[instanceId];
                    if (!instance) return null;
                    const secDef = instance.section_def ?? (instance.section_id ? sectionDefs[instance.section_id] : null);
                    const isSelected = state.selectedInstanceId === instanceId;

                    return (
                      <div
                        key={instanceId}
                        className={`relative group border-b border-gray-100 last:border-b-0 ${isSelected ? "ring-2 ring-inset ring-blue-500" : ""}`}
                        onClick={() => dispatch({ type: "SELECT_INSTANCE", payload: instanceId })}
                      >
                        {/* Wireframe block */}
                        <WireframeBlock
                          type={secDef?.type ?? ""}
                          name={secDef?.name ?? "Section"}
                        />

                        {/* Section label */}
                        <div className="px-2 py-1.5 bg-white flex items-center gap-1.5 border-t border-gray-50">
                          <GripVertical size={10} className="text-gray-300" />
                          <span className="text-[10px] text-gray-500 flex-1 truncate font-medium">
                            {secDef?.name ?? "Section"}
                          </span>

                          {/* Controls: only on hover */}
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            {/* Switch section type */}
                            <div className="relative">
                              <button
                                onClick={(e) => { e.stopPropagation(); setSectionTypePicker(sectionTypePicker === instanceId ? null : instanceId); }}
                                className="p-0.5 hover:bg-gray-100 rounded text-gray-400"
                                title="Changer de section"
                              >
                                <RefreshCw size={9} />
                              </button>
                              {sectionTypePicker === instanceId && (
                                <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-xl z-30 py-1 max-h-48 overflow-y-auto">
                                  <div className="px-2 py-1 text-[9px] text-gray-400 uppercase tracking-wider font-medium">Changer de type</div>
                                  {availableSections.map((s) => (
                                    <button
                                      key={s.id}
                                      onClick={(e) => { e.stopPropagation(); swapSectionType(instanceId, s); }}
                                      className="flex items-center gap-2 w-full px-2 py-1.5 text-[10px] text-gray-700 hover:bg-gray-50"
                                    >
                                      {s.name}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* More menu */}
                            <div className="relative">
                              <button
                                onClick={(e) => { e.stopPropagation(); setSectionMenuOpen(sectionMenuOpen === instanceId ? null : instanceId); }}
                                className="p-0.5 hover:bg-gray-100 rounded text-gray-400"
                              >
                                <MoreHorizontal size={9} />
                              </button>
                              {sectionMenuOpen === instanceId && (
                                <div className="absolute right-0 top-full mt-1 w-36 bg-white border border-gray-200 rounded-lg shadow-xl z-30 py-1">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      dispatch({ type: "REORDER_INSTANCES", payload: { pageSlug: page.slug, fromIndex: idx, toIndex: idx - 1 } });
                                      setSectionMenuOpen(null);
                                    }}
                                    disabled={idx === 0}
                                    className="flex items-center gap-2 w-full px-3 py-1.5 text-[10px] text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                                  >
                                    ↑ Monter
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      dispatch({ type: "REORDER_INSTANCES", payload: { pageSlug: page.slug, fromIndex: idx, toIndex: idx + 1 } });
                                      setSectionMenuOpen(null);
                                    }}
                                    disabled={idx === instanceIds.length - 1}
                                    className="flex items-center gap-2 w-full px-3 py-1.5 text-[10px] text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                                  >
                                    ↓ Descendre
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      dispatch({ type: "REMOVE_INSTANCE", payload: instanceId });
                                      setSectionMenuOpen(null);
                                    }}
                                    className="flex items-center gap-2 w-full px-3 py-1.5 text-[10px] text-red-600 hover:bg-red-50"
                                  >
                                    <Trash2 size={9} />
                                    Supprimer
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Add section button */}
                  <button
                    onClick={() => {
                      dispatch({ type: "SET_ACTIVE_PAGE", payload: page.slug });
                      setLeftPanel("library");
                    }}
                    className="flex items-center justify-center gap-1.5 py-3 text-[10px] text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors border-t border-dashed border-gray-200"
                  >
                    <Plus size={10} />
                    Ajouter une section
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom controls */}
        <div className="absolute bottom-4 right-4 flex items-center gap-2">
          {/* Device switcher */}
          <div className="flex items-center bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
            {(["desktop", "tablet", "mobile"] as const).map((device) => {
              const Icon = device === "desktop" ? Laptop : device === "tablet" ? Tablet : Smartphone;
              return (
                <button
                  key={device}
                  onClick={() => dispatch({ type: "SET_DEVICE_VIEW", payload: device })}
                  className={`p-2 transition-colors ${state.deviceView === device ? "bg-gray-900 text-white" : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"}`}
                  title={device}
                >
                  <Icon size={14} />
                </button>
              );
            })}
          </div>

          {/* Zoom indicator */}
          <div className="text-xs text-gray-400 bg-white border border-gray-200 rounded-md px-2 py-1 shadow-sm select-none">
            {Math.round(canvas.scale * 100)}%
          </div>
        </div>
      </div>
    </div>
  );
}
