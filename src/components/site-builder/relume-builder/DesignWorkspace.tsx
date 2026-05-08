"use client";

import React from "react";
import {
  Laptop, Tablet, Smartphone, Layers, Sparkles,
  Move, Zap, Image as ImageIcon, Maximize2,
  ChevronDown, Play, MoreHorizontal,
  ZoomIn, ZoomOut, Eye, EyeOff,
  Type as TypeIcon, MousePointer, Box, ChevronRight,
  Trash2
} from "lucide-react";
import type { SiteSectionDef } from "@/types";
import { useRelumeBuilder } from "./RelumeBuilderProvider";
import { DynamicSectionRenderer } from "../DynamicSectionRenderer";

// ─── Pan/Zoom hook ────────────────────────────────────────────────────────────

function useCanvasPanZoom() {
  const [pan, setPan] = React.useState({ x: 60, y: 30 });
  const [scale, setScale] = React.useState(0.8);
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
  const resetZoom = () => { setScale(0.8); setPan({ x: 60, y: 30 }); };

  return { pan, scale, didPan, onMouseDown, onMouseMove, onMouseUp, onWheel, zoomIn, zoomOut, resetZoom };
}

// ─── Panel sections ────────────────────────────────────────────────────────────

type DesignPanel = "animations" | "transitions" | "spacing" | "images";

// ─── Props ────────────────────────────────────────────────────────────────────

interface DesignWorkspaceProps {
  sectionDefs: Record<string, SiteSectionDef>;
  onRegenerateSection?: (instanceId: string, prompt: string) => Promise<void>;
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface SelectedElement {
  instanceId: string;
  tag: string;
  text: string;
  path: number[];
}

function elementIcon(tag: string) {
  if (/^h[1-6]$/.test(tag) || tag === "p" || tag === "span" || tag === "blockquote" || tag === "li") return TypeIcon;
  if (tag === "img" || tag === "picture" || tag === "svg") return ImageIcon;
  if (tag === "a" || tag === "button") return MousePointer;
  return Box;
}

export function DesignWorkspace({ sectionDefs }: DesignWorkspaceProps) {
  const { state, dispatch } = useRelumeBuilder();
  const canvas = useCanvasPanZoom();
  const [activePanel, setActivePanel] = React.useState<DesignPanel>("animations");
  const [panelOpen, setPanelOpen] = React.useState(true);
  const [previewMode, setPreviewMode] = React.useState(false);
  const [layersOpen, setLayersOpen] = React.useState(true);
  const [expandedInstances, setExpandedInstances] = React.useState<Set<string>>(new Set());
  const [selectedElement, setSelectedElement] = React.useState<SelectedElement | null>(null);

  const pageInstanceIds = state.instancesByPage[state.activePage] ?? [];

  const handleElementClick = React.useCallback((instanceId: string) => (info: { tag: string; text: string; path: number[] }) => {
    dispatch({ type: "SELECT_INSTANCE", payload: instanceId });
    setSelectedElement({ instanceId, ...info });
  }, [dispatch]);

  const toggleInstanceExpanded = (id: string) => {
    setExpandedInstances((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const deviceWidth =
    state.deviceView === "mobile" ? 390 :
    state.deviceView === "tablet" ? 768 :
    1200;

  // ── Full-screen preview overlay ──────────────────────────────────────────────
  if (previewMode) {
    return (
      <div className="fixed inset-0 z-50 bg-white overflow-y-auto">
        {/* Exit button */}
        <button
          onClick={() => setPreviewMode(false)}
          className="fixed top-4 right-4 z-50 flex items-center gap-1.5 px-3 py-2 bg-gray-900/90 text-white text-xs rounded-lg shadow-lg hover:bg-gray-900 transition-colors backdrop-blur"
        >
          <EyeOff size={13} />
          Quitter l&apos;aperçu
        </button>

        {/* Page selector */}
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex gap-1 bg-gray-900/80 backdrop-blur rounded-lg p-1">
          {state.sitemap.map((p) => (
            <button
              key={p.id}
              onClick={() => dispatch({ type: "SET_ACTIVE_PAGE", payload: p.slug })}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${state.activePage === p.slug ? "bg-white text-gray-900 font-medium" : "text-white/60 hover:text-white"}`}
            >
              {p.title}
            </button>
          ))}
        </div>

        {/* Full-width page render */}
        <div style={{ backgroundColor: state.styleGuide.colors.background }}>
          {pageInstanceIds.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 text-center">
              <Layers size={40} className="text-gray-200 mb-4" />
              <p className="text-gray-400">Aucune section sur cette page</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {pageInstanceIds.map((instanceId) => {
                const instance = state.instances[instanceId];
                if (!instance || instance.is_hidden) return null;
                const secDef = instance.section_def ?? (instance.section_id ? sectionDefs[instance.section_id] : null);
                if (!secDef) return null;
                return (
                  <DynamicSectionRenderer
                    key={instanceId}
                    instance={{ ...instance, section_def: secDef }}
                    sectionDef={secDef}
                    styleGuide={state.styleGuide}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-[#f0f0f0] overflow-hidden">

      {/* ─ Left Panel ──────────────────────────────────────────────────────────── */}
      {panelOpen && (
        <div className="w-[260px] flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">

          {/* Panel tabs */}
          <div className="border-b border-gray-100">
            <div className="flex overflow-x-auto scrollbar-hide">
              {([
                { id: "animations", label: "Animations", icon: Zap },
                { id: "transitions", label: "Transitions", icon: Move },
                { id: "spacing", label: "Espacement", icon: Maximize2 },
                { id: "images", label: "Images", icon: ImageIcon },
              ] as const).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActivePanel(id)}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors border-b-2 ${activePanel === id ? "border-gray-900 text-gray-900" : "border-transparent text-gray-400 hover:text-gray-600"}`}
                >
                  <Icon size={11} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">

            {activePanel === "animations" && (
              <div className="space-y-5">
                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-3 block">Entrée des sections</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {["Fondu", "Glisser bas", "Glisser gauche", "Zoom", "Aucun"].map((anim) => (
                      <button
                        key={anim}
                        className="px-2 py-2 text-[10px] text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors text-left"
                      >
                        {anim}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-3 block">Durée</label>
                  <input
                    type="range"
                    min={200}
                    max={1200}
                    defaultValue={600}
                    step={100}
                    className="w-full accent-gray-900"
                  />
                  <div className="flex justify-between text-[9px] text-gray-400 mt-1">
                    <span>200ms</span>
                    <span>600ms</span>
                    <span>1200ms</span>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-3 block">Déclencheur</label>
                  <div className="flex gap-1.5">
                    {["Au chargement", "Au scroll", "Au survol"].map((t) => (
                      <button
                        key={t}
                        className={`flex-1 px-2 py-1.5 text-[10px] rounded-md border transition-colors ${t === "Au scroll" ? "bg-gray-900 text-white border-gray-900" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-3 block">Délai entre sections</label>
                  <input
                    type="range"
                    min={0}
                    max={300}
                    defaultValue={100}
                    step={25}
                    className="w-full accent-gray-900"
                  />
                </div>

                <div className="pt-2 border-t border-gray-100">
                  <button className="flex items-center gap-2 text-xs text-blue-600 hover:text-blue-700">
                    <Play size={11} />
                    Prévisualiser les animations
                  </button>
                </div>
              </div>
            )}

            {activePanel === "transitions" && (
              <div className="space-y-5">
                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-3 block">Transition de page</label>
                  <div className="space-y-1.5">
                    {["Aucune", "Fondu", "Glissement horizontal", "Zoom arrière"].map((t) => (
                      <button
                        key={t}
                        className={`w-full text-left px-3 py-2 text-xs rounded-lg border transition-colors ${t === "Fondu" ? "bg-gray-900 text-white border-gray-900" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-3 block">Easing</label>
                  <div className="flex flex-col gap-1.5">
                    {["ease-in-out", "ease-out", "ease-in", "linear", "spring"].map((e) => (
                      <button
                        key={e}
                        className={`flex items-center justify-between px-3 py-1.5 text-xs rounded-md border transition-colors ${e === "ease-in-out" ? "bg-gray-100 border-gray-300 text-gray-900" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}
                      >
                        <span>{e}</span>
                        <span className="text-[9px] w-16 h-3 border-b border-gray-400" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activePanel === "spacing" && (
              <div className="space-y-5">
                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-3 block">Espacement global</label>
                  <div className="space-y-3">
                    <div>
                      <label className="text-[10px] text-gray-500 mb-1 flex justify-between">
                        <span>Padding section</span>
                        <span className="font-mono">{state.styleGuide.spacing.sectionPadding}</span>
                      </label>
                      <input
                        type="range"
                        min={40}
                        max={160}
                        value={parseInt(state.styleGuide.spacing.sectionPadding)}
                        onChange={(e) =>
                          dispatch({ type: "UPDATE_STYLE_GUIDE", payload: { spacing: { ...state.styleGuide.spacing, sectionPadding: `${e.target.value}px` } } })
                        }
                        className="w-full accent-gray-900"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 mb-1 flex justify-between">
                        <span>Gap éléments</span>
                        <span className="font-mono">{state.styleGuide.spacing.elementGap}</span>
                      </label>
                      <input
                        type="range"
                        min={8}
                        max={64}
                        value={parseInt(state.styleGuide.spacing.elementGap)}
                        onChange={(e) =>
                          dispatch({ type: "UPDATE_STYLE_GUIDE", payload: { spacing: { ...state.styleGuide.spacing, elementGap: `${e.target.value}px` } } })
                        }
                        className="w-full accent-gray-900"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-3 block">Sections sur cette page</label>
                  <div className="space-y-1">
                    {pageInstanceIds.map((id) => {
                      const inst = state.instances[id];
                      const def = inst?.section_def ?? (inst?.section_id ? sectionDefs[inst.section_id] : null);
                      if (!inst || !def) return null;
                      return (
                        <div key={id} className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-gray-50 group">
                          <span className="text-xs text-gray-600">{def.name}</span>
                          <button className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <MoreHorizontal size={12} className="text-gray-400" />
                          </button>
                        </div>
                      );
                    })}
                    {pageInstanceIds.length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-4">Aucune section sur cette page</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activePanel === "images" && (
              <div className="space-y-5">
                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-3 block">Images de la page</label>
                  {pageInstanceIds.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">Aucune section sur cette page</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {pageInstanceIds.map((id) => (
                        <div
                          key={id}
                          className="aspect-video bg-gray-100 border border-gray-200 rounded-lg flex items-center justify-center hover:bg-gray-150 cursor-pointer group relative overflow-hidden"
                        >
                          <ImageIcon size={16} className="text-gray-300 group-hover:text-gray-400 transition-colors" />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors flex items-end p-1 opacity-0 group-hover:opacity-100">
                            <span className="text-[9px] text-gray-600 bg-white/80 px-1 py-0.5 rounded truncate">Remplacer</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-3 block">Qualité d&apos;export</label>
                  <div className="flex gap-1.5">
                    {["72 dpi", "150 dpi", "300 dpi"].map((q) => (
                      <button
                        key={q}
                        className={`flex-1 py-1.5 text-[10px] rounded-md border transition-colors ${q === "150 dpi" ? "bg-gray-900 text-white border-gray-900" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* AI suggestion strip */}
          <div className="p-3 border-t border-gray-100 bg-purple-50/50">
            <div className="flex items-start gap-2">
              <Sparkles size={12} className="text-purple-500 flex-shrink-0 mt-0.5" />
              <p className="text-[10px] text-purple-700 leading-relaxed">
                Conseil : Les animations au scroll augmentent l&apos;engagement de 23% en moyenne.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Panel toggle */}
      <button
        onClick={() => setPanelOpen(!panelOpen)}
        className="absolute z-20 w-5 h-12 bg-white border border-gray-200 border-l-0 rounded-r-md flex items-center justify-center text-gray-400 hover:text-gray-600 shadow-sm top-1/2 -translate-y-1/2"
        style={{ left: panelOpen ? 260 : 0 }}
      >
        <ChevronDown size={12} className={`transition-transform ${panelOpen ? "-rotate-90" : "rotate-90"}`} />
      </button>

      {/* ─ Canvas ──────────────────────────────────────────────────────────────── */}
      <div
        className="flex-1 overflow-hidden relative select-none"
        onMouseDown={canvas.onMouseDown}
        onMouseMove={canvas.onMouseMove}
        onMouseUp={canvas.onMouseUp}
        onMouseLeave={canvas.onMouseUp}
        onWheel={canvas.onWheel}
        onClick={() => { if (!canvas.didPan.current) dispatch({ type: "SELECT_INSTANCE", payload: null }); }}
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
            width: deviceWidth,
          }}
        >
          {/* Page header label */}
          <div className="mb-3 flex items-center gap-2">
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5 shadow-sm">
              <Layers size={12} className="text-gray-400" />
              <span className="text-xs font-medium text-gray-700">
                {state.sitemap.find((p) => p.slug === state.activePage)?.title ?? "Accueil"}
              </span>
            </div>
            {/* Page selector */}
            <div className="flex gap-1">
              {state.sitemap.map((p) => (
                <button
                  key={p.id}
                  onClick={() => dispatch({ type: "SET_ACTIVE_PAGE", payload: p.slug })}
                  className={`px-2.5 py-1 text-[10px] rounded-md border transition-colors ${state.activePage === p.slug ? "bg-gray-900 text-white border-gray-900" : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"}`}
                >
                  {p.title}
                </button>
              ))}
            </div>
          </div>

          {/* Styled canvas */}
          <div
            className="overflow-hidden shadow-2xl"
            style={{
              width: deviceWidth,
              borderRadius: 12,
              backgroundColor: state.styleGuide.colors.background,
            }}
          >
            {pageInstanceIds.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <Layers size={32} className="text-gray-200 mb-4" />
                <p className="text-sm text-gray-400 mb-1">Aucune section sur cette page</p>
                <p className="text-xs text-gray-300">Ajoutez des sections dans le Wireframe</p>
              </div>
            ) : (
              <div className="flex flex-col">
                {pageInstanceIds.map((instanceId) => {
                  const instance = state.instances[instanceId];
                  if (!instance || instance.is_hidden) return null;
                  const secDef = instance.section_def ?? (instance.section_id ? sectionDefs[instance.section_id] : null);
                  if (!secDef) return null;
                  const isSelected = state.selectedInstanceId === instanceId;

                  return (
                    <div
                      key={instanceId}
                      className="relative cursor-pointer"
                      style={{ outline: isSelected ? "2px solid #3b82f6" : "2px solid transparent" }}
                      onClick={(e) => { e.stopPropagation(); dispatch({ type: "SELECT_INSTANCE", payload: instanceId }); }}
                    >
                      <DynamicSectionRenderer
                        instance={{ ...instance, section_def: secDef }}
                        sectionDef={secDef}
                        styleGuide={state.styleGuide}
                        editorMode
                        selected={isSelected}
                        onSelect={() => dispatch({ type: "SELECT_INSTANCE", payload: instanceId })}
                        selectedSnippetId={isSelected ? state.selectedSnippetId : null}
                        onSelectSnippet={(id) => dispatch({ type: "SELECT_SNIPPET", payload: id })}
                        selectionEnabled
                        onElementClick={handleElementClick(instanceId)}
                      />
                      {isSelected && (
                        <div className="absolute top-0 left-0 z-30 bg-blue-500 text-white text-[9px] px-2 py-0.5 rounded-br font-medium">
                          {secDef.name}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
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
                >
                  <Icon size={14} />
                </button>
              );
            })}
          </div>

          {/* Preview button */}
          <button
            onClick={() => setPreviewMode(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-white border border-gray-200 rounded-md shadow-sm text-gray-600 hover:bg-gray-50 transition-colors"
            title="Aperçu plein écran"
          >
            <Eye size={11} />
            Aperçu
          </button>

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

      {/* ─ Right: Layers panel (Framer-style) ─────────────────────────────────── */}
      {layersOpen && (
        <div className="w-[260px] flex-shrink-0 bg-white border-l border-gray-200 flex flex-col">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
            <div className="flex items-center gap-1.5">
              <Layers size={12} className="text-gray-500" />
              <span className="text-xs font-semibold text-gray-700">Calques</span>
            </div>
            <button
              onClick={() => setLayersOpen(false)}
              className="text-gray-400 hover:text-gray-600"
              title="Masquer le panneau"
            >
              <ChevronRight size={14} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-1 py-2 text-[11px] text-gray-700">
            {state.sitemap.map((page) => {
              const ids = state.instancesByPage[page.slug] ?? [];
              const isActive = page.slug === state.activePage;
              return (
                <div key={page.id} className="mb-1.5">
                  <button
                    onClick={() => dispatch({ type: "SET_ACTIVE_PAGE", payload: page.slug })}
                    className={`flex items-center gap-1.5 w-full px-2 py-1 rounded-md ${isActive ? "bg-blue-50 text-blue-700" : "hover:bg-gray-50 text-gray-700"}`}
                  >
                    <ChevronDown size={11} className="text-gray-400" />
                    <span className="font-semibold flex-1 text-left truncate">{page.title}</span>
                    <span className="text-[9px] text-gray-400">{ids.length}</span>
                  </button>
                  {isActive && (
                    <div className="ml-2 border-l border-gray-100 pl-1">
                      {ids.map((instanceId) => {
                        const inst = state.instances[instanceId];
                        if (!inst) return null;
                        const def = inst.section_def ?? (inst.section_id ? sectionDefs[inst.section_id] : null);
                        const isSel = state.selectedInstanceId === instanceId;
                        const expanded = expandedInstances.has(instanceId);
                        const blocks = inst.blocks ?? [];
                        const elementSelectedHere = selectedElement?.instanceId === instanceId;
                        return (
                          <div key={instanceId} className="">
                            <div
                              className={`group flex items-center gap-1 px-1.5 py-1 rounded-md cursor-pointer ${isSel ? "bg-blue-50 text-blue-700" : "hover:bg-gray-50"}`}
                              onClick={() => {
                                dispatch({ type: "SELECT_INSTANCE", payload: instanceId });
                                setSelectedElement(null);
                              }}
                            >
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleInstanceExpanded(instanceId); }}
                                className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                              >
                                <ChevronRight size={10} className={`transition-transform ${expanded ? "rotate-90" : ""}`} />
                              </button>
                              <Box size={11} className="text-gray-400 flex-shrink-0" />
                              <span className="flex-1 truncate text-[11px]">{def?.name ?? "Section"}</span>
                              <button
                                onClick={(e) => { e.stopPropagation(); dispatch({ type: "TOGGLE_INSTANCE_VISIBILITY", payload: instanceId }); }}
                                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-700"
                                title={inst.is_hidden ? "Afficher" : "Masquer"}
                              >
                                {inst.is_hidden ? <EyeOff size={10} /> : <Eye size={10} />}
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); dispatch({ type: "REMOVE_INSTANCE", payload: instanceId }); }}
                                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600"
                                title="Supprimer"
                              >
                                <Trash2 size={10} />
                              </button>
                            </div>
                            {expanded && (
                              <div className="ml-3 pl-2 border-l border-gray-100">
                                {blocks.length === 0 && !elementSelectedHere && (
                                  <div className="text-[10px] text-gray-300 px-1.5 py-1 italic">Aucun bloc — cliquez sur un élément dans la prévisualisation</div>
                                )}
                                {blocks.map((b, bIdx) => (
                                  <div
                                    key={b.id}
                                    onClick={(e) => { e.stopPropagation(); dispatch({ type: "SELECT_INSTANCE", payload: instanceId }); }}
                                    className="flex items-center gap-1.5 px-1.5 py-0.5 rounded hover:bg-gray-50 text-[10px] text-gray-600 cursor-pointer"
                                  >
                                    <Box size={9} className="text-gray-300" />
                                    <span className="truncate">{b.type} {bIdx + 1}</span>
                                  </div>
                                ))}
                                {elementSelectedHere && selectedElement && (() => {
                                  const Icon = elementIcon(selectedElement.tag);
                                  return (
                                    <div className="flex items-center gap-1.5 px-1.5 py-1 rounded bg-blue-50 text-blue-700 text-[10px]">
                                      <Icon size={10} />
                                      <span className="font-semibold uppercase">{selectedElement.tag}</span>
                                      <span className="truncate text-blue-500">{selectedElement.text || "—"}</span>
                                    </div>
                                  );
                                })()}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {ids.length === 0 && (
                        <div className="px-2 py-1.5 text-[10px] text-gray-300 italic">Aucune section</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {selectedElement && (
            <div className="border-t border-gray-100 p-3 bg-gray-50/50">
              <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Élément sélectionné</div>
              {(() => { const Icon = elementIcon(selectedElement.tag); return (
                <div className="flex items-center gap-1.5 text-xs text-gray-800">
                  <Icon size={12} className="text-blue-500" />
                  <span className="font-semibold uppercase">{selectedElement.tag}</span>
                </div>
              ); })()}
              <div className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{selectedElement.text || "—"}</div>
              <div className="text-[9px] text-gray-300 font-mono mt-1">chemin : {selectedElement.path.join(".")}</div>
            </div>
          )}
        </div>
      )}
      {!layersOpen && (
        <button
          onClick={() => setLayersOpen(true)}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-5 h-12 bg-white border border-gray-200 border-r-0 rounded-l-md flex items-center justify-center text-gray-400 hover:text-gray-600 shadow-sm"
          title="Afficher les calques"
        >
          <Layers size={12} />
        </button>
      )}
    </div>
  );
}
