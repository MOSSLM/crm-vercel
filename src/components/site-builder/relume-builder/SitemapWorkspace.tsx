"use client";

import React from "react";
import {
  Sparkles, FileText, MoreHorizontal, Plus, Trash2,
  ChevronRight, Send, Loader2, AlertCircle, ChevronDown, RefreshCw, MessageSquare,
  Copy, ZoomIn, ZoomOut, Maximize2, Search, X
} from "lucide-react";
import { toast } from "sonner";
import type { SiteSectionDef, SitemapPage, SitemapSection } from "@/types";
import { useRelumeBuilder, nanoid } from "./RelumeBuilderProvider";
import { useAIModel } from "@/hooks/useAIModel";

// ─── AI Model config ──────────────────────────────────────────────────────────

export const AI_MODELS = [
  { provider: "anthropic", id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { provider: "anthropic", id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
  { provider: "anthropic", id: "claude-opus-4-7", label: "Claude Opus 4.7" },
  { provider: "openai", id: "gpt-4o", label: "GPT-4o" },
  { provider: "openai", id: "gpt-4o-mini", label: "GPT-4o mini" },
] as const;

export type AIModelId = typeof AI_MODELS[number]["id"];

// ─── Pan/Zoom hook ────────────────────────────────────────────────────────────

function useCanvasPanZoom() {
  const [pan, setPan] = React.useState({ x: 60, y: 60 });
  const [scale, setScale] = React.useState(1);
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
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setScale((s) => Math.min(2, Math.max(0.25, s * delta)));
    } else {
      setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
    }
  };

  const zoomIn = () => setScale((s) => Math.min(2, parseFloat((s + 0.1).toFixed(2))));
  const zoomOut = () => setScale((s) => Math.max(0.25, parseFloat((s - 0.1).toFixed(2))));
  const resetZoom = () => { setScale(1); setPan({ x: 60, y: 60 }); };

  return { pan, scale, didPan, onMouseDown, onMouseMove, onMouseUp, onWheel, zoomIn, zoomOut, resetZoom };
}

// ─── Model Dropdown ────────────────────────────────────────────────────────────

export function ModelDropdown({ value, onChange }: { value: AIModelId; onChange: (v: AIModelId) => void }) {
  const [open, setOpen] = React.useState(false);
  const model = AI_MODELS.find((m) => m.id === value) ?? AI_MODELS[0];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors text-gray-700"
      >
        <span className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${model.provider === "anthropic" ? "bg-orange-400" : "bg-green-500"}`} />
          {model.label}
        </span>
        <ChevronDown size={11} className="text-gray-400 flex-shrink-0" />
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 py-1">
          {[
            { provider: "anthropic", label: "Claude" },
            { provider: "openai", label: "ChatGPT" },
          ].map((group) => (
            <div key={group.provider}>
              <div className="px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-gray-400">{group.label}</div>
              {AI_MODELS.filter((m) => m.provider === group.provider).map((m) => (
                <button
                  key={m.id}
                  onClick={() => { onChange(m.id); setOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors hover:bg-gray-50 ${m.id === value ? "text-blue-600 font-medium" : "text-gray-700"}`}
                >
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${m.provider === "anthropic" ? "bg-orange-400" : "bg-green-500"}`} />
                  {m.label}
                  {m.id === value && <span className="ml-auto text-blue-500">✓</span>}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface SitemapWorkspaceProps {
  siteId: string;
  enterpriseId?: number;
  availableSections: SiteSectionDef[];
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SitemapWorkspace({ siteId, enterpriseId, availableSections }: SitemapWorkspaceProps) {
  const { state, dispatch } = useRelumeBuilder();
  const canvas = useCanvasPanZoom();
  const [aiInput, setAiInput] = React.useState("");
  const [aiLoading, setAiLoading] = React.useState(false);
  const [aiStep, setAiStep] = React.useState<"idle" | "generating" | "done" | "error">("idle");
  const [expandedPages, setExpandedPages] = React.useState<Set<string>>(new Set());
  const [menuOpen, setMenuOpen] = React.useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useAIModel();

  // Per-page state: context text + per-page loading
  const [pageContexts, setPageContexts] = React.useState<Record<string, string>>({});
  const [pageContextOpen, setPageContextOpen] = React.useState<string | null>(null);
  const [pageLoading, setPageLoading] = React.useState<string | null>(null);
  const [editingPageId, setEditingPageId] = React.useState<string | null>(null);
  const [editingTitle, setEditingTitle] = React.useState("");
  const [pickerOpenForPage, setPickerOpenForPage] = React.useState<string | null>(null);
  const [pickerSearch, setPickerSearch] = React.useState("");

  // ─── AI Generation (full sitemap) ──────────────────────────────────────────

  const handleGenerate = async () => {
    if (!aiInput.trim()) return;
    setAiLoading(true);
    setAiStep("generating");
    try {
      const pageList = state.sitemap.map((p) => p.title).join(", ");
      const res = await fetch("/api/site-builder/ai/generate-sitemap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId,
          enterpriseId,
          description: aiInput,
          pages: pageList,
          availableSectionTypes: availableSections.map((s) => s.type),
          model: selectedModel,
        }),
      });
      if (!res.ok) throw new Error("Erreur IA");
      const data = await res.json();

      if (data.styleGuide) dispatch({ type: "UPDATE_STYLE_GUIDE", payload: data.styleGuide });

      if (data.sitemap?.length) {
        for (const page of data.sitemap) {
          const existing = state.sitemap.find((p) => p.slug === page.slug);
          if (!existing) {
            dispatch({ type: "ADD_PAGE", payload: { id: nanoid(), slug: page.slug, title: page.title, sections: page.sections ?? [] } });
          } else {
            dispatch({ type: "UPDATE_PAGE", payload: { id: existing.id, data: { sections: page.sections ?? [] } } });
          }
        }
      }

      if (data.instances?.length) {
        for (const inst of data.instances) {
          const secDef = availableSections.find((s) => s.type === inst.sectionType);
          if (!secDef) continue;
          dispatch({
            type: "ADD_INSTANCE",
            payload: {
              instance: {
                id: nanoid(),
                site_id: siteId,
                section_id: secDef.id,
                section_def: secDef,
                page_slug: inst.pageSlug ?? "/",
                sort_order: inst.sortOrder ?? 0,
                content: inst.content ?? {},
                blocks: Array.isArray(inst.blocks) ? inst.blocks : [],
                custom_style: {},
                is_hidden: false,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
              pageSlug: inst.pageSlug ?? "/",
            },
          });
        }
      }

      setAiStep("done");
      toast.success("Sitemap généré !");
    } catch {
      setAiStep("error");
      toast.error("Erreur lors de la génération");
    } finally {
      setAiLoading(false);
    }
  };

  // ─── AI regeneration for a single page ────────────────────────────────────

  const handleRegeneratePage = async (page: SitemapPage) => {
    setPageLoading(page.id);
    try {
      const context = pageContexts[page.id] ?? "";
      const res = await fetch("/api/site-builder/ai/regenerate-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId,
          enterpriseId,
          pageSlug: page.slug,
          pageTitle: page.title,
          globalDescription: aiInput,
          pageContext: context,
          availableSectionTypes: availableSections.map((s) => s.type),
          model: selectedModel,
        }),
      });
      if (!res.ok) throw new Error("Erreur IA");
      const data = await res.json();

      if (data.sections) {
        dispatch({ type: "UPDATE_PAGE", payload: { id: page.id, data: { sections: data.sections } } });
      }
      if (data.instances?.length) {
        // Remove existing instances for this page
        const existingIds = state.instancesByPage[page.slug] ?? [];
        for (const id of existingIds) {
          dispatch({ type: "REMOVE_INSTANCE", payload: id });
        }
        // Add new instances
        for (const inst of data.instances) {
          const secDef = availableSections.find((s) => s.type === inst.sectionType);
          if (!secDef) continue;
          dispatch({
            type: "ADD_INSTANCE",
            payload: {
              instance: {
                id: nanoid(),
                site_id: siteId,
                section_id: secDef.id,
                section_def: secDef,
                page_slug: page.slug,
                sort_order: inst.sortOrder ?? 0,
                content: inst.content ?? {},
                blocks: Array.isArray(inst.blocks) ? inst.blocks : [],
                custom_style: {},
                is_hidden: false,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
              pageSlug: page.slug,
            },
          });
        }
      }
      toast.success(`Page "${page.title}" régénérée !`);
      setPageContextOpen(null);
    } catch {
      toast.error("Erreur lors de la régénération");
    } finally {
      setPageLoading(null);
    }
  };

  // ─── Page management ─────────────────────────────────────────────────────────

  const addPage = () => {
    const id = nanoid();
    const slug = `/page-${Date.now()}`;
    dispatch({ type: "ADD_PAGE", payload: { id, slug, title: "Nouvelle page", sections: [] } });
  };

  const removePage = (id: string) => {
    dispatch({ type: "REMOVE_PAGE", payload: id });
  };

  /** Manually add a section to a page (no AI). */
  const addSectionToPage = (page: SitemapPage, sectionDef: SiteSectionDef) => {
    const newSitemapEntry: SitemapSection = {
      id: nanoid(),
      name: sectionDef.name,
      description: sectionDef.category ?? sectionDef.type,
      type: sectionDef.type,
    };
    const updatedSections: SitemapSection[] = [...(page.sections ?? []), newSitemapEntry];
    dispatch({ type: "UPDATE_PAGE", payload: { id: page.id, data: { sections: updatedSections } } });

    const existingIds = state.instancesByPage[page.slug] ?? [];
    dispatch({
      type: "ADD_INSTANCE",
      payload: {
        instance: {
          id: nanoid(),
          site_id: siteId,
          section_id: sectionDef.id,
          section_def: sectionDef,
          page_slug: page.slug,
          sort_order: existingIds.length,
          content: { ...sectionDef.default_content },
          blocks: [],
          custom_style: {},
          is_hidden: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        pageSlug: page.slug,
      },
    });
    toast.success(`${sectionDef.name} ajoutée à ${page.title}`);
  };

  const filteredSectionsForPicker = availableSections.filter((s) =>
    s.name.toLowerCase().includes(pickerSearch.toLowerCase()) ||
    (s.category ?? "").toLowerCase().includes(pickerSearch.toLowerCase())
  );

  const toggleExpand = (id: string) => {
    setExpandedPages((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  };

  // ─── SVG connector lines ──────────────────────────────────────────────────────

  const PAGE_CARD_WIDTH = 280;
  const PAGE_CARD_GAP = 40;
  const ROOT_TOP = 60;
  const PAGES_TOP = 200;

  const pagePositions = state.sitemap.map((_, i) => ({
    x: i * (PAGE_CARD_WIDTH + PAGE_CARD_GAP),
    y: PAGES_TOP,
  }));

  const totalWidth = Math.max(
    600,
    state.sitemap.length * (PAGE_CARD_WIDTH + PAGE_CARD_GAP) + 120
  );

  const rootX = totalWidth / 2 - 80;

  return (
    <div className="flex h-full bg-[#f0f0f0] overflow-hidden">

      {/* ─ Left AI Panel ─────────────────────────────────────────────────────── */}
      <div className="w-[280px] flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={14} className="text-purple-500" />
            <span className="text-sm font-semibold text-gray-900">Assistant IA</span>
          </div>
          <p className="text-xs text-gray-500">Décrivez votre activité pour générer votre sitemap automatiquement.</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {!enterpriseId && (
            <div className="flex gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
              <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
              <span>Aucune entreprise liée. Les résultats seront génériques.</span>
            </div>
          )}

          {/* Model selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-700">Modèle IA</label>
            <ModelDropdown value={selectedModel} onChange={setSelectedModel} />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-700">Description de votre activité</label>
            <textarea
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              placeholder="Ex: Entreprise de plomberie à Paris, spécialisée dans les rénovations de salles de bain et dépannages urgents..."
              rows={5}
              className="w-full text-xs bg-gray-50 border border-gray-200 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 text-gray-800 placeholder-gray-400"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-700">Pages souhaitées</label>
            <div className="flex flex-col gap-1">
              {state.sitemap.map((page) => (
                <div key={page.id} className="flex items-center gap-2 px-2 py-1.5 bg-gray-50 rounded-md">
                  <FileText size={11} className="text-gray-400" />
                  <span className="text-xs text-gray-700 flex-1">{page.title}</span>
                </div>
              ))}
            </div>
            <button
              onClick={addPage}
              className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700 mt-1 pl-1"
            >
              <Plus size={11} />
              Ajouter une page
            </button>
          </div>

          {aiStep === "done" && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
              Sitemap généré avec succès !
            </div>
          )}
          {aiStep === "error" && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              Une erreur est survenue. Réessayez.
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-100">
          <button
            onClick={handleGenerate}
            disabled={aiLoading || !aiInput.trim()}
            className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            {aiLoading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Génération...
              </>
            ) : (
              <>
                <Send size={13} />
                Générer le sitemap
              </>
            )}
          </button>
        </div>
      </div>

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
        {/* Dot grid background */}
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
            width: totalWidth + 200,
          }}
        >
          {/* SVG connector lines */}
          <svg
            style={{ position: "absolute", top: 0, left: 0, width: totalWidth + 200, height: 600, overflow: "visible", pointerEvents: "none" }}
          >
            {/* Root → each page */}
            {state.sitemap.map((page, i) => {
              const pos = pagePositions[i];
              const fromX = rootX + 80;
              const fromY = ROOT_TOP + 36;
              const toX = pos.x + PAGE_CARD_WIDTH / 2;
              const toY = pos.y;
              const midY = (fromY + toY) / 2;
              return (
                <path
                  key={page.id}
                  d={`M ${fromX} ${fromY} C ${fromX} ${midY}, ${toX} ${midY}, ${toX} ${toY}`}
                  stroke="#d1d5db"
                  strokeWidth={1.5}
                  fill="none"
                  strokeDasharray="4 3"
                />
              );
            })}
          </svg>

          {/* Root "Project" node */}
          <div
            style={{ position: "absolute", top: ROOT_TOP, left: rootX, width: 160 }}
            className="bg-white border border-gray-200 rounded-xl px-4 py-2.5 shadow-sm flex items-center gap-2"
          >
            <div className="w-5 h-5 rounded bg-gray-100 flex items-center justify-center">
              <FileText size={11} className="text-gray-500" />
            </div>
            <span className="text-sm font-semibold text-gray-800">Project</span>
          </div>

          {/* Page cards */}
          {state.sitemap.map((page, i) => {
            const pos = pagePositions[i];
            const isExpanded = expandedPages.has(page.id);
            const sections: SitemapSection[] = page.sections ?? [];
            const isLoadingPage = pageLoading === page.id;
            const pageCtx = pageContexts[page.id] ?? "";
            const isContextOpen = pageContextOpen === page.id;

            return (
              <div
                key={page.id}
                style={{ position: "absolute", top: pos.y, left: pos.x, width: PAGE_CARD_WIDTH }}
                className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-visible"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Card header */}
                <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100">
                  <div className="w-5 h-5 rounded bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <FileText size={10} className="text-blue-500" />
                  </div>
                  {editingPageId === page.id ? (
                    <input
                      autoFocus
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onBlur={() => {
                        if (editingTitle.trim()) dispatch({ type: "UPDATE_PAGE", payload: { id: page.id, data: { title: editingTitle.trim() } } });
                        setEditingPageId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          if (editingTitle.trim()) dispatch({ type: "UPDATE_PAGE", payload: { id: page.id, data: { title: editingTitle.trim() } } });
                          setEditingPageId(null);
                        }
                        if (e.key === "Escape") setEditingPageId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 text-xs font-semibold bg-white border border-blue-400 rounded px-1 py-0.5 focus:outline-none"
                    />
                  ) : (
                    <span
                      className="text-xs font-semibold text-gray-800 flex-1 truncate cursor-text"
                      onDoubleClick={(e) => { e.stopPropagation(); setEditingPageId(page.id); setEditingTitle(page.title); }}
                      title="Double-clic pour renommer"
                    >
                      {page.title}
                    </span>
                  )}
                  <div className="flex items-center gap-1">
                    {/* Per-page AI regenerate */}
                    <button
                      onClick={() => setPageContextOpen(isContextOpen ? null : page.id)}
                      className={`p-1 rounded text-gray-400 hover:text-purple-600 hover:bg-purple-50 transition-colors ${isContextOpen ? "text-purple-600 bg-purple-50" : ""}`}
                      title="Régénérer avec l'IA"
                    >
                      <Sparkles size={11} />
                    </button>
                    <button
                      onClick={() => toggleExpand(page.id)}
                      className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600"
                    >
                      <ChevronRight size={12} className={`transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                    </button>
                    <div className="relative">
                      <button
                        onClick={() => setMenuOpen(menuOpen === page.id ? null : page.id)}
                        className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600"
                      >
                        <MoreHorizontal size={12} />
                      </button>
                      {menuOpen === page.id && (
                        <div className="absolute right-0 top-full mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1">
                          <button
                            onClick={() => { setEditingPageId(page.id); setEditingTitle(page.title); setMenuOpen(null); }}
                            className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                          >
                            <FileText size={11} />
                            Renommer
                          </button>
                          <button
                            onClick={() => { dispatch({ type: "DUPLICATE_PAGE", payload: page.id }); setMenuOpen(null); }}
                            className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                          >
                            <Copy size={11} />
                            Dupliquer
                          </button>
                          <button
                            onClick={() => { removePage(page.id); setMenuOpen(null); }}
                            className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                          >
                            <Trash2 size={11} />
                            Supprimer
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Per-page AI context panel */}
                {isContextOpen && (
                  <div className="px-3 py-2.5 bg-purple-50 border-b border-purple-100">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <MessageSquare size={10} className="text-purple-500" />
                      <span className="text-[10px] font-semibold text-purple-700">Contexte pour cette page</span>
                    </div>
                    <textarea
                      value={pageCtx}
                      onChange={(e) => setPageContexts((prev) => ({ ...prev, [page.id]: e.target.value }))}
                      placeholder={`Instructions spécifiques pour "${page.title}"...`}
                      rows={3}
                      className="w-full text-[10px] bg-white border border-purple-200 rounded-md p-2 resize-none focus:outline-none focus:ring-1 focus:ring-purple-400 text-gray-800 placeholder-gray-400"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <button
                      onClick={() => handleRegeneratePage(page)}
                      disabled={isLoadingPage}
                      className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 text-[10px] font-semibold bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors disabled:opacity-50"
                    >
                      {isLoadingPage ? (
                        <><Loader2 size={10} className="animate-spin" /> Génération...</>
                      ) : (
                        <><RefreshCw size={10} /> Régénérer cette page</>
                      )}
                    </button>
                  </div>
                )}

                {/* Sections list */}
                {sections.length > 0 && (
                  <div className="divide-y divide-gray-50">
                    {(isExpanded ? sections : sections.slice(0, 4)).map((sec) => (
                      <div key={sec.id} className="px-3 py-2">
                        <div className="text-xs font-medium text-gray-700 mb-0.5">{sec.name}</div>
                        <div className="text-[10px] text-gray-400 leading-relaxed line-clamp-2">{sec.description}</div>
                      </div>
                    ))}
                    {!isExpanded && sections.length > 4 && (
                      <button
                        onClick={() => toggleExpand(page.id)}
                        className="w-full px-3 py-2 text-[10px] text-gray-400 hover:text-gray-600 hover:bg-gray-50 text-left"
                      >
                        +{sections.length - 4} sections de plus...
                      </button>
                    )}
                  </div>
                )}

                {sections.length === 0 && (
                  <div className="px-3 py-3 text-center">
                    <p className="text-[10px] text-gray-400">Aucune section — ajoutez-les manuellement ou générez avec l&apos;IA</p>
                  </div>
                )}

                {/* Manual section add */}
                <div className="relative border-t border-gray-100">
                  <button
                    onClick={() => {
                      setPickerOpenForPage(pickerOpenForPage === page.id ? null : page.id);
                      setPickerSearch("");
                    }}
                    className="flex items-center justify-center gap-1.5 w-full py-2 text-[10px] text-gray-500 hover:bg-gray-50 transition-colors"
                  >
                    <Plus size={11} />
                    Ajouter une section
                  </button>
                  {pickerOpenForPage === page.id && (
                    <div
                      className="absolute left-2 right-2 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-40 flex flex-col max-h-72"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="p-2 border-b border-gray-100 flex items-center gap-1.5">
                        <Search size={11} className="text-gray-400 flex-shrink-0" />
                        <input
                          autoFocus
                          value={pickerSearch}
                          onChange={(e) => setPickerSearch(e.target.value)}
                          placeholder="Rechercher une section…"
                          className="flex-1 text-[11px] bg-transparent focus:outline-none text-gray-800 placeholder-gray-400"
                        />
                        <button
                          onClick={() => setPickerOpenForPage(null)}
                          className="text-gray-300 hover:text-gray-500"
                          title="Fermer"
                        >
                          <X size={11} />
                        </button>
                      </div>
                      <div className="overflow-y-auto py-1">
                        {filteredSectionsForPicker.length === 0 && (
                          <p className="text-[10px] text-gray-400 text-center py-3">Aucune section</p>
                        )}
                        {filteredSectionsForPicker.map((sec) => (
                          <button
                            key={sec.id}
                            onClick={() => {
                              addSectionToPage(page, sec);
                              setPickerOpenForPage(null);
                            }}
                            className="flex items-start gap-2 w-full px-3 py-1.5 text-left hover:bg-gray-50"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="text-[11px] text-gray-800 truncate">{sec.name}</div>
                              <div className="text-[9px] text-gray-400 truncate">{sec.category ?? sec.type}</div>
                            </div>
                            <Plus size={10} className="text-gray-300 mt-1 flex-shrink-0" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Add page button */}
          <div style={{ position: "absolute", top: PAGES_TOP, left: state.sitemap.length * (PAGE_CARD_WIDTH + PAGE_CARD_GAP) }}>
            <button
              onClick={addPage}
              className="w-10 h-10 bg-white border-2 border-dashed border-gray-300 rounded-xl flex items-center justify-center text-gray-400 hover:border-gray-400 hover:text-gray-600 transition-colors shadow-sm mt-3"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="absolute bottom-4 right-4 flex items-center gap-2">
          <span className="text-[10px] text-gray-400 bg-white/80 rounded px-2 py-1">Glisser · Ctrl+scroll pour zoomer</span>
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

        {/* Generation status */}
        {aiLoading && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-gray-900 text-white text-xs px-4 py-2 rounded-full shadow-lg">
            <Sparkles size={12} className="text-purple-400" />
            Génération du sitemap...
            <button
              onClick={() => setAiLoading(false)}
              className="ml-2 w-4 h-4 bg-white/20 rounded-full flex items-center justify-center hover:bg-white/30"
            >
              ×
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
