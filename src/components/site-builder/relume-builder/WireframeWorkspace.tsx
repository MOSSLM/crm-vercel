"use client";

import React from "react";
import {
  Laptop, Tablet, Smartphone, Plus, Trash2, Layers,
  Search, Sparkles, MoreHorizontal,
  ChevronDown, RefreshCw, Loader2, MessageSquare, Send,
  ZoomIn, ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import type { SiteSectionDef, SiteSectionInstance } from "@/types";
import { useRelumeBuilder, nanoid } from "./RelumeBuilderProvider";
import { type AIModelId, ModelDropdown } from "./SitemapWorkspace";
import { useAIModel } from "@/hooks/useAIModel";
import { VariableTextarea } from "./VariableTextarea";
import { DynamicSectionRenderer } from "../DynamicSectionRenderer";
import { Btn, Pane, Pop } from "./skin-primitives";

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

const CATEGORIES = ["Tous", "Hero", "Services", "Content", "Social Proof", "Contact", "CTA", "Media"];

// ─── Section type picker (swap) ───────────────────────────────────────────────

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
    (s.category ?? "").toLowerCase().includes(q.toLowerCase()),
  );

  const groups = React.useMemo(() => {
    const map: Record<string, SiteSectionDef[]> = {};
    for (const s of filtered) {
      const key = s.category ?? "Other";
      if (!map[key]) map[key] = [];
      map[key].push(s);
    }
    return map;
  }, [filtered]);

  return (
    <Pop
      style={{ position: "absolute", right: 0, top: "100%", marginTop: 4, width: 240, display: "flex", flexDirection: "column", maxHeight: 280, zIndex: 50 }}
      onClick={(e: React.MouseEvent) => e.stopPropagation()}
    >
      <div style={{ padding: 8, borderBottom: "1px solid var(--border)" }}>
        <div style={{ fontSize: 9, fontWeight: 600, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6, fontFamily: "var(--font-mono)" }}>
          Changer de section
        </div>
        <div className="search-wrap" style={{ position: "relative" }}>
          <Search size={10} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--text-4)" }} />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher…"
            className="input"
            style={{ paddingLeft: 22, height: 24, fontSize: 11 }}
          />
        </div>
      </div>
      <div style={{ overflow: "auto", padding: 2 }}>
        {Object.entries(groups).map(([cat, sections]) => (
          <React.Fragment key={cat}>
            <div style={{ padding: "6px 8px 2px", fontSize: 9, fontWeight: 600, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: ".06em", fontFamily: "var(--font-mono)" }}>
              {cat}
            </div>
            {sections.map((s) => (
              <button
                key={s.id}
                onClick={(e) => { e.stopPropagation(); onSelect(s); onClose(); }}
                className="btn ghost sm"
                style={{ width: "100%", justifyContent: "flex-start" }}
              >
                {s.name}
              </button>
            ))}
          </React.Fragment>
        ))}
        {filtered.length === 0 && (
          <p style={{ fontSize: 10.5, color: "var(--text-4)", textAlign: "center", padding: 16, margin: 0 }}>Aucune section trouvée</p>
        )}
      </div>
    </Pop>
  );
}

// ─── Section AI popover ──────────────────────────────────────────────────────

function SectionAIPopover({
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
  const { state } = useRelumeBuilder();
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
    <div className="ai-box" style={{ position: "absolute", right: 0, top: "100%", marginTop: 4, width: 260, zIndex: 50, padding: 0 }} onClick={(e) => e.stopPropagation()}>
      <div className="ai-box-hd">
        <Sparkles size={11} />
        <span>Régénérer avec l&apos;IA</span>
      </div>
      <div style={{ padding: 10 }}>
        <ModelDropdown value={model} onChange={onModelChange} />
        <div style={{ height: 8 }} />
        <VariableTextarea
          value={prompt}
          onChange={setPrompt}
          placeholder="Instructions spécifiques (optionnel)…"
          rows={3}
          autoFocus
          className="textarea"
          variables={state.variableContext}
          variant="light"
        />
      </div>
      <div className="ai-box-ft">
        <Btn variant="outline" size="sm" onClick={onClose} style={{ flex: 1, justifyContent: "center" }}>Annuler</Btn>
        <Btn variant="magic" size="sm" onClick={handleSubmit} disabled={loading} style={{ flex: 1, justifyContent: "center" }}>
          {loading ? <Loader2 size={10} className="animate-spin" /> : <Send size={10} />}
          {loading ? "…" : "Générer"}
        </Btn>
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
  const [selectedModel, setSelectedModel] = useAIModel();
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
    const baseContent: Record<string, unknown> = { ...sectionDef.default_content };
    if (sectionDef.theme_slug && sectionDef.theme_section_id) {
      baseContent.__library = { theme_slug: sectionDef.theme_slug, section_id: sectionDef.theme_section_id };
    }
    const newInstance: SiteSectionInstance = {
      id: nanoid(),
      site_id: state.siteId,
      section_id: null,
      page_slug: pageSlug,
      sort_order: (state.instancesByPage[pageSlug] ?? []).length,
      content: baseContent,
      blocks: [],
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

  const deviceWidth = state.deviceView === "mobile" ? 390 : state.deviceView === "tablet" ? 768 : 1200;
  const activeInstanceIds = state.instancesByPage[state.activePage] ?? [];

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden", flex: 1, minHeight: 0 }}>

      {/* ─ Left Panel ──────────────────────────────────────────────────── */}
      {leftPanel && (
        <Pane style={{ width: 260, flexShrink: 0 }}>
          <div className="wf-side-tabs">
            <button
              onClick={() => setLeftPanel("library")}
              aria-selected={leftPanel === "library" ? "true" : "false"}
            >
              <Layers size={12} />Sections
            </button>
            <button
              className="magic"
              onClick={() => setLeftPanel("ai")}
              aria-selected={leftPanel === "ai" ? "true" : "false"}
            >
              <Sparkles size={12} />IA
            </button>
          </div>

          {leftPanel === "library" && (
            <>
              <div className="wf-search">
                <div className="search-wrap" style={{ position: "relative" }}>
                  <Search size={12} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--text-4)" }} />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Rechercher…"
                    className="input"
                    style={{ paddingLeft: 26 }}
                  />
                </div>
                <div className="wf-cats">
                  {CATEGORIES.slice(0, 5).map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setActiveCategory(cat)}
                      className="wf-cat"
                      aria-selected={activeCategory === cat ? "true" : "false"}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pane-body">
                <div className="wf-sec-list">
                  {filteredSections.map((sec) => (
                    <div key={sec.id} className="wf-sec-row">
                      <div className="thumb" />
                      <div className="info">
                        <div className="name">{sec.name}</div>
                        <div className="cat">{sec.category}</div>
                      </div>
                      <button
                        onClick={() => addSection(state.activePage, sec)}
                        className="add-btn"
                        title="Ajouter à la page active"
                      >
                        <Plus size={11} />
                      </button>
                    </div>
                  ))}
                  {filteredSections.length === 0 && (
                    <p style={{ fontSize: 11, color: "var(--text-4)", textAlign: "center", padding: 32, margin: 0 }}>Aucune section trouvée</p>
                  )}
                </div>
              </div>
            </>
          )}

          {leftPanel === "ai" && (
            <div className="pane-body" style={{ padding: "14px 14px" }}>
              <div className="field">
                <div className="field-label">Modèle IA</div>
                <ModelDropdown value={selectedModel} onChange={setSelectedModel} />
              </div>
              <div style={{ textAlign: "center", padding: "32px 12px" }}>
                <Sparkles size={24} style={{ color: "var(--magic)", marginBottom: 10 }} />
                <p style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text)", margin: "0 0 4px" }}>Assistant IA</p>
                <p style={{ fontSize: 11, color: "var(--text-4)", margin: 0 }}>Cliquez sur le bouton ✨ d&apos;une page ou d&apos;une section pour la régénérer.</p>
              </div>
            </div>
          )}
        </Pane>
      )}

      {/* Panel toggle */}
      <button
        onClick={() => setLeftPanel(leftPanel ? null : "library")}
        style={{
          position: "absolute",
          top: "50%",
          transform: "translateY(-50%)",
          zIndex: 20,
          width: 18,
          height: 44,
          background: "var(--surface)",
          border: "1px solid var(--border-2)",
          borderLeft: 0,
          borderRadius: "0 6px 6px 0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-4)",
          boxShadow: "var(--shadow-1)",
          left: leftPanel ? 260 : 0,
          cursor: "default",
        }}
        title={leftPanel ? "Masquer le panneau" : "Afficher le panneau"}
      >
        <ChevronDown size={11} style={{ transform: leftPanel ? "rotate(-90deg)" : "rotate(90deg)", transition: "transform .15s" }} />
      </button>

      {/* ─ Canvas ──────────────────────────────────────────────────────── */}
      <div
        className="canvas-host"
        onMouseDown={canvas.onMouseDown}
        onMouseMove={canvas.onMouseMove}
        onMouseUp={canvas.onMouseUp}
        onMouseLeave={canvas.onMouseUp}
        onWheel={canvas.onWheel}
        style={{ cursor: "grab", flex: 1 }}
      >
        <div className="canvas-dotgrid" />

        <div
          className="canvas-stage"
          style={{
            transform: `translate(${canvas.pan.x}px, ${canvas.pan.y}px) scale(${canvas.scale})`,
            width: deviceWidth,
          }}
        >
          <div className="page-meta-bar">
            <div className="page-chip">
              <Layers size={12} />
              <span>{state.sitemap.find((p) => p.slug === state.activePage)?.title ?? "Accueil"}</span>
            </div>
            <div className="page-tabs">
              {state.sitemap.map((p, i) => (
                <button
                  key={p.id}
                  onClick={() => dispatch({ type: "SET_ACTIVE_PAGE", payload: p.slug })}
                  className="page-tab"
                  aria-selected={state.activePage === p.slug ? "true" : "false"}
                >
                  <span className="pgnum">{String(i + 1).padStart(2, "0")}</span>
                  {p.title}
                </button>
              ))}
            </div>
            {(() => {
              const page = state.sitemap.find((p) => p.slug === state.activePage);
              if (!page) return null;
              const isOpen = pageAIOpen === page.id;
              return (
                <button
                  onClick={() => setPageAIOpen(isOpen ? null : page.id)}
                  className={isOpen ? "btn magic sm" : "btn outline sm"}
                >
                  <Sparkles size={11} />Régénérer la page
                </button>
              );
            })()}
          </div>

          {(() => {
            const page = state.sitemap.find((p) => p.slug === state.activePage);
            if (!page || pageAIOpen !== page.id) return null;
            const isLoading = pageLoading === page.id;
            const ctx = pageContexts[page.id] ?? "";
            return (
              <div className="ai-box" style={{ marginBottom: 12 }}>
                <div className="ai-box-hd">
                  <MessageSquare size={11} />
                  <span>Contexte pour {page.title}</span>
                </div>
                <VariableTextarea
                  value={ctx}
                  onChange={(v) => setPageContexts((prev) => ({ ...prev, [page.id]: v }))}
                  placeholder="Instructions pour régénérer toutes les sections…"
                  rows={2}
                  className="textarea"
                  variables={state.variableContext}
                  variant="light"
                />
                <div className="ai-box-ft">
                  <span style={{ flex: 1 }} />
                  <Btn variant="magic" size="sm" onClick={() => handleRegeneratePage(page.slug, page.id)} disabled={isLoading || activeInstanceIds.length === 0}>
                    {isLoading ? <><Loader2 size={10} className="animate-spin" /> Génération…</> : <><RefreshCw size={10} /> Régénérer la page</>}
                  </Btn>
                </div>
              </div>
            );
          })()}

          {/* Active page rendered at device width */}
          <div
            className="device-frame"
            style={{ width: deviceWidth }}
          >
            {activeInstanceIds.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "100px 0", textAlign: "center" }}>
                <Layers size={32} style={{ color: "var(--border-2)", marginBottom: 14 }} />
                <p style={{ fontSize: 13, color: "var(--text-3)", margin: "0 0 4px" }}>Aucune section sur cette page</p>
                <p style={{ fontSize: 11, color: "var(--text-4)", margin: 0 }}>Ajoutez des sections depuis la bibliothèque</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {activeInstanceIds.map((instanceId, idx) => {
                  const instance = state.instances[instanceId];
                  if (!instance) return null;
                  const secDef = instance.section_def ?? (instance.section_id ? sectionDefs[instance.section_id] : null);
                  if (!secDef) return null;
                  const isSelected = state.selectedInstanceId === instanceId;
                  const isSectionAIOpen = sectionAIOpen === instanceId;

                  return (
                    <div
                      key={instanceId}
                      className="ws-section"
                      data-selected={isSelected ? "true" : undefined}
                      onClick={(e) => { e.stopPropagation(); dispatch({ type: "SELECT_INSTANCE", payload: instanceId }); }}
                      style={{ position: "relative", cursor: "default" }}
                    >
                      <span className="ws-tag"><span className="dot" />{secDef.name}</span>
                      <DynamicSectionRenderer
                        instance={{ ...instance, section_def: secDef }}
                        sectionDef={secDef}
                        styleGuide={state.styleGuide}
                        wireframe
                      />

                      <div className="wf-section" style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "transparent", border: 0, padding: 0 }}>
                        <div className="toolbar" style={{ pointerEvents: "auto" }}>
                          <span>{secDef.name}</span>
                          <div style={{ position: "relative" }}>
                            <button
                              className="magic"
                              onClick={(e) => { e.stopPropagation(); setSectionAIOpen(isSectionAIOpen ? null : instanceId); }}
                              title="Régénérer avec l'IA"
                            >
                              <Sparkles size={11} />
                            </button>
                            {isSectionAIOpen && (
                              <SectionAIPopover
                                instanceId={instanceId}
                                onRegenerate={async (prompt) => { await onRegenerateSection?.(instanceId, prompt, selectedModel); }}
                                onClose={() => setSectionAIOpen(null)}
                                model={selectedModel}
                                onModelChange={setSelectedModel}
                              />
                            )}
                          </div>
                          <div style={{ position: "relative" }}>
                            <button
                              onClick={(e) => { e.stopPropagation(); setSectionTypePicker(sectionTypePicker === instanceId ? null : instanceId); }}
                              title="Changer de section"
                            >
                              <RefreshCw size={11} />
                            </button>
                            {sectionTypePicker === instanceId && (
                              <SectionTypePicker
                                availableSections={availableSections}
                                onSelect={(s) => swapSectionType(instanceId, s)}
                                onClose={() => setSectionTypePicker(null)}
                              />
                            )}
                          </div>
                          <div style={{ position: "relative" }}>
                            <button onClick={(e) => { e.stopPropagation(); setSectionMenuOpen(sectionMenuOpen === instanceId ? null : instanceId); }}>
                              <MoreHorizontal size={11} />
                            </button>
                            {sectionMenuOpen === instanceId && (
                              <Pop style={{ position: "absolute", right: 0, top: "100%", marginTop: 4, minWidth: 140, padding: 4, zIndex: 50 }}>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    dispatch({ type: "REORDER_INSTANCES", payload: { pageSlug: state.activePage, fromIndex: idx, toIndex: idx - 1 } });
                                    setSectionMenuOpen(null);
                                  }}
                                  disabled={idx === 0}
                                  className="btn ghost sm"
                                  style={{ width: "100%", justifyContent: "flex-start" }}
                                >
                                  ↑ Monter
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    dispatch({ type: "REORDER_INSTANCES", payload: { pageSlug: state.activePage, fromIndex: idx, toIndex: idx + 1 } });
                                    setSectionMenuOpen(null);
                                  }}
                                  disabled={idx === activeInstanceIds.length - 1}
                                  className="btn ghost sm"
                                  style={{ width: "100%", justifyContent: "flex-start" }}
                                >
                                  ↓ Descendre
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    dispatch({ type: "REMOVE_INSTANCE", payload: instanceId });
                                    setSectionMenuOpen(null);
                                  }}
                                  className="btn danger sm"
                                  style={{ width: "100%", justifyContent: "flex-start" }}
                                >
                                  <Trash2 size={9} />Supprimer
                                </button>
                              </Pop>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <button
                  onClick={() => setLeftPanel("library")}
                  className="add-row"
                  style={{ width: "100%", appearance: "none", border: 0, borderTop: "1px dashed var(--border-2)", background: "transparent", padding: "16px 0" }}
                >
                  <Plus size={12} />Ajouter une section
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="canvas-tools">
          <div className="grp">
            {(["desktop", "tablet", "mobile"] as const).map((device) => {
              const Icon = device === "desktop" ? Laptop : device === "tablet" ? Tablet : Smartphone;
              return (
                <button
                  key={device}
                  onClick={() => dispatch({ type: "SET_DEVICE_VIEW", payload: device })}
                  aria-pressed={state.deviceView === device ? "true" : "false"}
                  title={device}
                >
                  <Icon size={13} />
                </button>
              );
            })}
          </div>
          <div className="grp">
            <button onClick={canvas.zoomOut} title="Dézoomer"><ZoomOut size={12} /></button>
            <button onClick={canvas.resetZoom} title="Réinitialiser"><span className="zoom-val">{Math.round(canvas.scale * 100)}%</span></button>
            <button onClick={canvas.zoomIn} title="Zoomer"><ZoomIn size={12} /></button>
          </div>
        </div>

        <div className="canvas-help">Glisser · <kbd>⌘</kbd>+scroll</div>
      </div>
    </div>
  );
}
