"use client";

import React from "react";
import {
  Laptop, Tablet, Smartphone, Plus, Trash2, Layers,
  Search, Sparkles, GripVertical, MoreHorizontal,
  ChevronDown, RefreshCw, Loader2, MessageSquare, Send,
  ZoomIn, ZoomOut
} from "lucide-react";
import { toast } from "sonner";
import type { SiteSectionDef, SiteSectionInstance } from "@/types";
import { useRelumeBuilder, nanoid } from "./RelumeBuilderProvider";
import { type AIModelId, ModelDropdown } from "./SitemapWorkspace";

// ─── Pan/Zoom hook ────────────────────────────────────────────────────────────

function useCanvasPanZoom(initialPan = { x: 40, y: 40 }) {
  const [pan, setPan] = React.useState(initialPan);
  const [scale, setScale] = React.useState(0.75);
  const isPanning = React.useRef(false);
  const didPan = React.useRef(false);
  const lastPos = React.useRef({ x: 0, y: 0 });

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0 || e.button === 1) {
      isPanning.current = true;
      didPan.current = false;
      lastPos.current = { x: e.clientX, y: e.clientY };
      if (e.button === 1) e.preventDefault();
    }
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!isPanning.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) didPan.current = true;
    if (didPan.current) {
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
    }
    lastPos.current = { x: e.clientX, y: e.clientY };
  };
  const onMouseUp = () => { isPanning.current = false; };
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      setScale((s) => Math.min(2, Math.max(0.2, s * (e.deltaY > 0 ? 0.9 : 1.1))));
    } else {
      setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
    }
  };

  const zoomIn = () => setScale((s) => Math.min(2, parseFloat((s + 0.1).toFixed(2))));
  const zoomOut = () => setScale((s) => Math.max(0.2, parseFloat((s - 0.1).toFixed(2))));
  const resetZoom = () => { setScale(0.75); setPan({ x: 40, y: 40 }); };

  return { pan, scale, didPan, onMouseDown, onMouseMove, onMouseUp, onWheel, zoomIn, zoomOut, resetZoom };
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

  if (lname.includes("cta") || lname.includes("banner")) {
    return (
      <div className="bg-blue-600 px-4 py-4 flex flex-col items-center gap-2">
        <div className="w-2/3 h-3 bg-blue-400 rounded" />
        <div className="w-1/2 h-2 bg-blue-400/70 rounded" />
        <div className="w-20 h-5 bg-white rounded mt-1" />
      </div>
    );
  }

  return (
    <div className="bg-white px-4 py-4 flex flex-col gap-2">
      <div className="w-1/3 h-2 bg-gray-300 rounded" />
      <div className="w-full h-2 bg-gray-200 rounded" />
      <div className="w-3/4 h-2 bg-gray-200 rounded" />
      <div className="w-full h-16 bg-gray-100 rounded mt-1" />
    </div>
  );
}

// ─── Section type picker with search ─────────────────────────────────────────

function SectionTypePicker({
  availableSections,
  onSelect,
  onClose,
}: {
  availableSections: SiteSectionDef[];
  onSelect: (s: SiteSectionDef) => void;
  onClose: () => void;
}) {
  const [q, setQ] = React.useState("");
  const filtered = availableSections.filter((s) =>
    s.name.toLowerCase().includes(q.toLowerCase()) ||
    (s.category ?? "").toLowerCase().includes(q.toLowerCase())
  );

  // Group by category
  const groups = React.useMemo(() => {
    const map: Record<string, SiteSectionDef[]> = {};
    for (const s of filtered) {
      if (!map[s.category]) map[s.category] = [];
      map[s.category].push(s);
    }
    return map;
  }, [filtered]);

  return (
    <div
      className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-xl shadow-xl z-30 flex flex-col max-h-64"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="p-2 border-b border-gray-100 flex-shrink-0">
        <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Changer de section</div>
        <div className="relative">
          <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher..."
            className="w-full pl-6 pr-2 py-1 text-[10px] bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-blue-400"
          />
        </div>
      </div>
      <div className="overflow-y-auto flex-1 py-1">
        {Object.entries(groups).map(([cat, sections]) => (
          <React.Fragment key={cat}>
            <div className="px-2 pt-1.5 pb-0.5 text-[9px] font-semibold uppercase tracking-wider text-gray-400">{cat}</div>
            {sections.map((s) => (
              <button
                key={s.id}
                onClick={(e) => { e.stopPropagation(); onSelect(s); onClose(); }}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-[10px] text-gray-700 hover:bg-gray-50 text-left"
              >
                {s.name}
              </button>
            ))}
          </React.Fragment>
        ))}
        {filtered.length === 0 && (
          <p className="text-[10px] text-gray-400 text-center py-4">Aucune section trouvée</p>
        )}
      </div>
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface WireframeWorkspaceProps {
  sectionDefs: Record<string, SiteSectionDef>;
  availableSections: SiteSectionDef[];
  onRegenerateSection?: (instanceId: string, prompt: string, model: string) => Promise<void>;
}

// ─── Section AI popover ───────────────────────────────────────────────────────

function SectionAIPopover({
  instanceId,
  onRegenerate,
  onClose,
  model,
  onModelChange,
}: {
  instanceId: string;
  onRegenerate: (prompt: string) => Promise<void>;
  onClose: () => void;
  model: AIModelId;
  onModelChange: (m: AIModelId) => void;
}) {
  const [prompt, setPrompt] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await onRegenerate(prompt);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="absolute right-0 top-full mt-1 w-56 bg-white border border-purple-200 rounded-xl shadow-xl z-40 p-3"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <Sparkles size={11} className="text-purple-500" />
        <span className="text-[10px] font-semibold text-purple-700">Régénérer avec l'IA</span>
      </div>
      <ModelDropdown value={model} onChange={onModelChange} />
      <div className="mt-2" />
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Instructions spécifiques (optionnel)..."
        rows={3}
        autoFocus
        className="w-full text-[10px] bg-gray-50 border border-gray-200 rounded-md p-2 resize-none focus:outline-none focus:ring-1 focus:ring-purple-400 text-gray-800 placeholder-gray-400"
      />
      <div className="flex gap-1.5 mt-2">
        <button
          onClick={onClose}
          className="flex-1 py-1.5 text-[10px] text-gray-500 border border-gray-200 rounded-md hover:bg-gray-50"
        >
          Annuler
        </button>
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[10px] font-semibold bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
        >
          {loading ? <Loader2 size={9} className="animate-spin" /> : <Send size={9} />}
          {loading ? "..." : "Générer"}
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function WireframeWorkspace({ sectionDefs, availableSections, onRegenerateSection }: WireframeWorkspaceProps) {
  const { state, dispatch } = useRelumeBuilder();
  const canvas = useCanvasPanZoom();
  const [leftPanel, setLeftPanel] = React.useState<"library" | "ai" | null>("library");
  const [search, setSearch] = React.useState("");
  const [activeCategory, setActiveCategory] = React.useState("Tous");
  const [sectionMenuOpen, setSectionMenuOpen] = React.useState<string | null>(null);
  const [sectionTypePicker, setSectionTypePicker] = React.useState<string | null>(null);
  const [sectionAIOpen, setSectionAIOpen] = React.useState<string | null>(null);
  const [selectedModel, setSelectedModel] = React.useState<AIModelId>("claude-sonnet-4-6");
  const [pageAIOpen, setPageAIOpen] = React.useState<string | null>(null);
  const [pageContexts, setPageContexts] = React.useState<Record<string, string>>({});
  const [pageLoading, setPageLoading] = React.useState<string | null>(null);

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

  const handleRegeneratePage = async (pageSlug: string, pageId: string) => {
    const context = pageContexts[pageId] ?? "";
    setPageLoading(pageId);
    try {
      const instanceIds = state.instancesByPage[pageSlug] ?? [];
      for (const instanceId of instanceIds) {
        await onRegenerateSection?.(instanceId, context, selectedModel);
      }
      toast.success("Page régénérée !");
      setPageAIOpen(null);
    } catch {
      toast.error("Erreur lors de la régénération");
    } finally {
      setPageLoading(null);
    }
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
            <div className="flex-1 flex flex-col p-4 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-700">Modèle IA</label>
                <ModelDropdown value={selectedModel} onChange={setSelectedModel} />
              </div>
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <Sparkles size={24} className="text-purple-400 mb-3" />
                <p className="text-sm font-medium text-gray-700 mb-1">Assistant IA</p>
                <p className="text-xs text-gray-400">Cliquez sur le bouton ✨ d'une page ou d'une section pour la régénérer.</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Panel toggle */}
      <button
        onClick={() => setLeftPanel(leftPanel ? null : "library")}
        className="absolute top-1/2 -translate-y-1/2 z-20 w-5 h-12 bg-white border border-gray-200 border-l-0 rounded-r-md flex items-center justify-center text-gray-400 hover:text-gray-600 shadow-sm"
        style={{ left: leftPanel ? 260 : 0 }}
      >
        <ChevronDown size={12} className={`transition-transform ${leftPanel ? "-rotate-90" : "rotate-90"}`} />
      </button>

      {/* ─ Canvas ──────────────────────────────────────────────────────────────── */}
      <div
        className="flex-1 overflow-hidden relative select-none"
        onMouseDown={canvas.onMouseDown}
        onMouseMove={canvas.onMouseMove}
        onMouseUp={canvas.onMouseUp}
        onMouseLeave={canvas.onMouseUp}
        onWheel={canvas.onWheel}
        style={{ cursor: "grab" }}
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
            const isPageAIOpen = pageAIOpen === page.id;
            const isPageLoading = pageLoading === page.id;
            const pageCtx = pageContexts[page.id] ?? "";

            return (
              <div
                key={page.id}
                style={{ width: PAGE_COL_WIDTH, flexShrink: 0 }}
                className="flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Page header */}
                <div
                  className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-t-xl mb-0 cursor-pointer select-none"
                  onClick={() => dispatch({ type: "SET_ACTIVE_PAGE", payload: page.slug })}
                >
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${state.activePage === page.slug ? "bg-blue-500" : "bg-gray-300"}`} />
                  <span className="text-xs font-semibold text-gray-800 flex-1 truncate">{page.title}</span>
                  {/* Per-page AI button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); setPageAIOpen(isPageAIOpen ? null : page.id); }}
                    className={`p-1 rounded transition-colors flex-shrink-0 ${isPageAIOpen ? "text-purple-600 bg-purple-50" : "text-gray-400 hover:text-purple-600 hover:bg-purple-50"}`}
                    title="Régénérer la page avec l'IA"
                  >
                    <Sparkles size={11} />
                  </button>
                </div>

                {/* Page AI panel */}
                {isPageAIOpen && (
                  <div className="bg-purple-50 border border-purple-200 border-t-0 px-3 py-2.5">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <MessageSquare size={10} className="text-purple-500" />
                      <span className="text-[10px] font-semibold text-purple-700">Contexte pour {page.title}</span>
                    </div>
                    <textarea
                      value={pageCtx}
                      onChange={(e) => setPageContexts((prev) => ({ ...prev, [page.id]: e.target.value }))}
                      placeholder="Instructions pour régénérer toutes les sections..."
                      rows={2}
                      className="w-full text-[10px] bg-white border border-purple-200 rounded-md p-2 resize-none focus:outline-none focus:ring-1 focus:ring-purple-400 text-gray-800 placeholder-gray-400"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <button
                      onClick={() => handleRegeneratePage(page.slug, page.id)}
                      disabled={isPageLoading || instanceIds.length === 0}
                      className="mt-1.5 w-full flex items-center justify-center gap-1 py-1.5 text-[10px] font-semibold bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
                    >
                      {isPageLoading ? <><Loader2 size={9} className="animate-spin" /> Génération...</> : <><RefreshCw size={9} /> Régénérer la page</>}
                    </button>
                  </div>
                )}

                {/* Page column body */}
                <div className="bg-white border border-t-0 border-gray-200 rounded-b-xl overflow-hidden shadow-sm flex flex-col">
                  {instanceIds.map((instanceId, idx) => {
                    const instance = state.instances[instanceId];
                    if (!instance) return null;
                    const secDef = instance.section_def ?? (instance.section_id ? sectionDefs[instance.section_id] : null);
                    const isSelected = state.selectedInstanceId === instanceId;
                    const isSectionAIOpen = sectionAIOpen === instanceId;

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

                        {/* Section label + controls */}
                        <div className="px-2 py-1.5 bg-white flex items-center gap-1.5 border-t border-gray-50">
                          <GripVertical size={10} className="text-gray-300" />
                          <span className="text-[10px] text-gray-500 flex-1 truncate font-medium">
                            {secDef?.name ?? "Section"}
                          </span>

                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            {/* AI regenerate per section */}
                            <div className="relative">
                              <button
                                onClick={(e) => { e.stopPropagation(); setSectionAIOpen(isSectionAIOpen ? null : instanceId); }}
                                className={`p-0.5 rounded text-gray-400 hover:text-purple-600 hover:bg-purple-50 transition-colors ${isSectionAIOpen ? "text-purple-600" : ""}`}
                                title="Régénérer avec l'IA"
                              >
                                <Sparkles size={9} />
                              </button>
                              {isSectionAIOpen && (
                                <SectionAIPopover
                                  instanceId={instanceId}
                                  onRegenerate={async (prompt) => {
                                    await onRegenerateSection?.(instanceId, prompt, selectedModel);
                                  }}
                                  onClose={() => setSectionAIOpen(null)}
                                  model={selectedModel}
                                  onModelChange={setSelectedModel}
                                />
                              )}
                            </div>

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
                                <SectionTypePicker
                                  availableSections={availableSections}
                                  onSelect={(s) => swapSectionType(instanceId, s)}
                                  onClose={() => setSectionTypePicker(null)}
                                />
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

          {/* Zoom controls */}
          <span className="text-[10px] text-gray-400 bg-white/80 rounded px-2 py-1">Glisser · Ctrl+scroll</span>
          <div className="flex items-center bg-white border border-gray-200 rounded-md shadow-sm overflow-hidden">
            <button onClick={canvas.zoomOut} className="px-2 py-1 text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-colors" title="Dézoomer">
              <ZoomOut size={12} />
            </button>
            <button onClick={canvas.resetZoom} className="px-2 py-1 text-xs text-gray-500 hover:bg-gray-50 font-mono min-w-[44px] text-center" title="Réinitialiser">
              {Math.round(canvas.scale * 100)}%
            </button>
            <button onClick={canvas.zoomIn} className="px-2 py-1 text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-colors" title="Zoomer">
              <ZoomIn size={12} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
