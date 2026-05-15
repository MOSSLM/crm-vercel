"use client";

import React from "react";
import {
  Laptop, Tablet, Smartphone, Layers,
  Move, Zap, ChevronDown,
  ZoomIn, ZoomOut, Eye, EyeOff,
  Type as TypeIcon, MousePointer, Box, ChevronRight,
  Trash2, FileText, Palette, Sparkles, RefreshCw, X,
  ChevronUp,
  Settings2, Link as LinkIcon, Image as ImageIcon, Navigation, Maximize2,
  ArrowUpDown, Square, CheckSquare,
} from "lucide-react";
import { BulkAIDialog } from "./BulkAIDialog";
import type { SiteSectionDef, SiteSectionInstance } from "@/types";
import { useRelumeBuilder } from "./RelumeBuilderProvider";
import { DynamicSectionRenderer } from "../DynamicSectionRenderer";
import type { IframeElementClickInfo, IframeDomTreeNode } from "../LibrarySectionIframe";
import { ElementPanel } from "./element-panels/ElementPanel";
import { SchemaEditor, splitSchemaFields } from "@/components/site-builder/editors/SchemaEditor";
import { BlocksEditor } from "@/components/site-builder/editors/BlocksEditor";
import { ColorSchemeField } from "@/components/site-builder/editors/ColorSchemeField";
import { getSchemaForSection } from "@/data/section-schemas";
import type { ColorSchemePreset } from "@/lib/color-utils";
import type { SectionPreset } from "@/types";
import { SiteMenusPanel } from "./SiteMenusPanel";
import { ModelDropdown } from "./SitemapWorkspace";
import { useAIModel } from "@/hooks/useAIModel";
import { VariableTextarea } from "./VariableTextarea";
import { AnimationFieldEditor } from "@/components/site-builder/editors/AnimationFieldEditor";
import type { SectionAnimation } from "@/types";

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
    if (didPan.current) setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
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

// ─── Selected element info ────────────────────────────────────────────────────

export type ElementKind = "text" | "image" | "button" | "link" | "input" | "form";

export interface ElementAttrs {
  src?: string;
  alt?: string;
  href?: string;
  target?: string;
  className?: string;
  inputType?: string;
  placeholder?: string;
  name?: string;
  value?: string;
  required?: boolean;
  action?: string;
  method?: string;
  /** True when the "image" kind was inferred from a CSS background-image. */
  isBackground?: boolean;
}

interface SelectedElement {
  instanceId: string;
  kind: ElementKind;
  tag: string;
  text: string;
  path: number[];
  attrs: ElementAttrs;
  fieldId: string | null;
}

function elementIcon(tag: string) {
  if (/^h[1-6]$/.test(tag) || tag === "p" || tag === "span" || tag === "blockquote" || tag === "li") return TypeIcon;
  if (tag === "img" || tag === "picture" || tag === "svg") return Layers;
  if (tag === "a" || tag === "button") return MousePointer;
  return Box;
}

// ─── Accordion helper ─────────────────────────────────────────────────────────

function Accordion({ title, icon: Icon, defaultOpen = true, children }: {
  title: string;
  icon?: React.ElementType;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        {Icon && <Icon size={12} className="text-gray-400 flex-shrink-0" />}
        <span className="text-xs font-semibold text-gray-700 flex-1">{title}</span>
        <ChevronDown size={12} className={`text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-4 pb-4 space-y-4">{children}</div>}
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface DesignWorkspaceProps {
  sectionDefs: Record<string, SiteSectionDef>;
  onRegenerateSection?: (instanceId: string, prompt: string, model: string) => Promise<void>;
}

// ─── Schema-free layers tree ──────────────────────────────────────────────────

function fieldPreview(value: unknown): string {
  if (typeof value === "string") return value.slice(0, 28);
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (typeof v.label === "string") return v.label.slice(0, 28);
    if (typeof v.placeholder === "string") return v.placeholder.slice(0, 28);
    if (typeof v.href === "string") return v.href.slice(0, 28);
  }
  return "";
}

/**
 * Infer an element kind from a content value. Used by the schema-free layers
 * panel to pick a typed icon and to build a synthetic SelectedElement when
 * the user clicks a layer (so the right ElementPanel opens immediately).
 */
function inferKindFromValue(val: unknown): ElementKind {
  if (typeof val === "string") {
    const isImage = val.startsWith("http") && /\.(png|jpg|jpeg|webp|gif|svg|avif)/i.test(val);
    return isImage ? "image" : "text";
  }
  if (val && typeof val === "object" && !Array.isArray(val)) {
    const v = val as Record<string, unknown>;
    if ("action" in v || "method" in v) return "form";
    if ("input_type" in v || ("placeholder" in v && "name" in v)) return "input";
    if ("href" in v && "label" in v && ("target" in v || "style_overrides" in v)) return "button";
    if ("href" in v && "label" in v) return "link";
    if ("src" in v) return "image";
  }
  return "text";
}

function kindIcon(kind: ElementKind): React.ElementType {
  switch (kind) {
    case "image": return ImageIcon;
    case "button": return MousePointer;
    case "link": return LinkIcon;
    case "input":
    case "form": return Square;
    case "text":
    default: return TypeIcon;
  }
}

/**
 * Unified, schema-free layers tree. Walks instance.content (excluding __keys)
 * and each block's settings recursively. Each row maps to a kind-typed icon
 * and on click builds a synthetic SelectedElement so the kind-routed
 * ElementPanel opens directly — no schema dependency anywhere.
 *
 * Schema, when present, is used solely to read prettier labels via
 * schema.settings.find(s => s.id === key)?.label.
 */
function DomLayerRow({
  node,
  depth,
  selectedPath,
  onSelect,
}: {
  node: IframeDomTreeNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (node: IframeDomTreeNode) => void;
}) {
  const [open, setOpen] = React.useState(depth < 2);
  const Icon = kindIcon(node.kind as ElementKind);
  const hasChildren = node.children && node.children.length > 0;
  const pathKey = node.path.join(".");
  const isSel = selectedPath === pathKey;
  const previewText = node.text || (node.attrs.alt as string | undefined) || "";
  return (
    <div>
      <div
        className={`group flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors ${
          isSel ? "bg-blue-50 text-blue-700" : "hover:bg-gray-50 text-gray-600"
        }`}
        style={{ paddingLeft: `${6 + depth * 8}px` }}
      >
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
            className="text-gray-400 hover:text-gray-700 flex-shrink-0"
          >
            <ChevronRight size={9} className={`transition-transform ${open ? "rotate-90" : ""}`} />
          </button>
        ) : (
          <span className="w-[9px] flex-shrink-0" />
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onSelect(node); }}
          className="flex items-center gap-1 flex-1 min-w-0 text-left"
        >
          <Icon size={9} className="flex-shrink-0 text-gray-400" />
          <span className="font-mono text-[9px] text-gray-400 flex-shrink-0">{node.tag}</span>
          {previewText && <span className="truncate text-gray-500">{previewText}</span>}
        </button>
      </div>
      {open && hasChildren && (
        <div>
          {node.children.map((child) => (
            <DomLayerRow
              key={child.path.join(".")}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LayersFields({
  instance,
  schema,
  sectionDef,
  onSelectField,
  focusedField,
  domTree,
  selectedDomPath,
  onSelectDomNode,
}: {
  instance: SiteSectionInstance;
  schema: ReturnType<typeof import("@/data/section-schemas").getSchemaForSection> | null;
  sectionDef: SiteSectionDef | null;
  onSelectField: (fieldId: string, kind: ElementKind, blockId?: string) => void;
  focusedField: string | null;
  domTree: IframeDomTreeNode | null;
  selectedDomPath: string | null;
  onSelectDomNode: (node: IframeDomTreeNode) => void;
}) {
  // ─── DOM-driven render: prefer the live tree from the iframe ────────────────
  if (domTree) {
    return (
      <div className="ml-3 pl-2 border-l border-gray-100 space-y-0">
        <DomLayerRow
          node={domTree}
          depth={0}
          selectedPath={selectedDomPath}
          onSelect={onSelectDomNode}
        />
      </div>
    );
  }
  // ─── Fallback: schema/content while waiting for the iframe tree ─────────────
  const labelFor = (key: string): string => {
    if (!schema) return key;
    const f = (schema.settings ?? []).find((s) => "id" in s && (s as { id: string }).id === key) as { label?: string } | undefined;
    return f?.label ? String(f.label) : key;
  };
  const blockLabelFor = (blockType: string, key: string): string => {
    if (!schema) return key;
    const blockDef = (schema.blocks ?? []).find((b) => b.type === blockType);
    if (!blockDef) return key;
    const f = (blockDef.settings ?? []).find((s) => "id" in s && (s as { id: string }).id === key) as { label?: string } | undefined;
    return f?.label ? String(f.label) : key;
  };

  const renderRow = (key: string, val: unknown, blockId: string | undefined, depth: number) => {
    const kind = inferKindFromValue(val);
    const Icon = kindIcon(kind);
    const preview = fieldPreview(val);
    const focusKey = blockId ? `${blockId}.${key}` : key;
    const isFocused = focusedField === focusKey;
    const label = blockId ? blockLabelFor(instance.blocks.find((b) => b.id === blockId)?.type ?? "", key) : labelFor(key);
    return (
      <button
        key={focusKey}
        onClick={(e) => { e.stopPropagation(); onSelectField(focusKey, kind, blockId); }}
        className={`flex items-center gap-1.5 w-full px-1.5 py-1 rounded text-[10px] text-left transition-colors ${isFocused ? "bg-blue-50 text-blue-700" : "hover:bg-gray-50 text-gray-500"}`}
        style={{ paddingLeft: `${6 + depth * 8}px` }}
      >
        <Icon size={9} className="flex-shrink-0 text-gray-400" />
        <span className="font-medium truncate flex-shrink-0" style={{ maxWidth: 90 }}>{label}</span>
        {preview && <span className="truncate text-gray-400 text-[9px]">{preview}</span>}
      </button>
    );
  };

  // Build the effective row list by merging three sources, in order:
  //   1. section schema settings (declared fields, even when content is empty)
  //   2. sectionDef.default_content (catalog defaults)
  //   3. instance.content (user-set values, win)
  // Keep an ordered list of unique keys so the panel reflects authoring intent.
  const effectiveKeysOf = (
    settings: Record<string, unknown>,
    defaults: Record<string, unknown> | undefined,
    schemaIds: string[],
  ): { key: string; val: unknown }[] => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    const push = (k: string) => { if (!seen.has(k)) { seen.add(k); ordered.push(k); } };
    for (const id of schemaIds) push(id);
    if (defaults) for (const k of Object.keys(defaults)) push(k);
    for (const k of Object.keys(settings)) push(k);
    return ordered
      .filter((k) => !k.startsWith("__"))
      .map((k) => {
        const v = settings[k] ?? defaults?.[k];
        return { key: k, val: v };
      })
      .filter(({ val }) =>
        typeof val === "string" ||
        typeof val === "number" ||
        (val !== null && typeof val === "object" && !Array.isArray(val)),
      );
  };

  const schemaIds = (schema?.settings ?? [])
    .filter((s) => "id" in s)
    .map((s) => (s as { id: string }).id);
  const instanceRows = effectiveKeysOf(instance.content, sectionDef?.default_content, schemaIds);

  return (
    <div className="ml-3 pl-2 border-l border-gray-100 space-y-0.5">
      {instanceRows.length === 0 && (instance.blocks ?? []).length === 0 ? (
        <p className="px-1.5 py-2 text-[10px] text-gray-400 italic">
          Aucun champ détecté — clique directement dans le canvas pour éditer.
        </p>
      ) : (
        instanceRows.map(({ key, val }) => renderRow(key, val, undefined, 0))
      )}

      {/* Blocks recursively */}
      {(instance.blocks ?? []).length > 0 && (
        <div className="mt-1 pt-1 border-t border-gray-100">
          {instance.blocks.map((block, idx) => {
            const blockSchema = schema?.blocks?.find((b) => b.type === block.type);
            const blockSchemaIds = (blockSchema?.settings ?? [])
              .filter((s) => "id" in s)
              .map((s) => (s as { id: string }).id);
            const blockRows = effectiveKeysOf(block.settings, undefined, blockSchemaIds);
            const firstStr = Object.values(block.settings).find((v) => typeof v === "string") as string | undefined;
            const blockLabel = firstStr ? firstStr.slice(0, 24) : `${block.type} ${idx + 1}`;
            return (
              <div key={block.id} className="mt-0.5">
                <div className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] text-gray-400 font-semibold uppercase tracking-wider">
                  <Box size={8} />
                  <span className="truncate">{blockLabel}</span>
                </div>
                <div className="ml-1">
                  {blockRows.map(({ key, val }) => renderRow(key, val, block.id, 1))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function DesignWorkspace({ sectionDefs, onRegenerateSection }: DesignWorkspaceProps) {
  const { state, dispatch } = useRelumeBuilder();
  const canvas = useCanvasPanZoom();
  const [panelOpen, setPanelOpen] = React.useState(true);
  const [previewMode, setPreviewMode] = React.useState(false);
  const [layersOpen, setLayersOpen] = React.useState(true);
  const [expandedInstances, setExpandedInstances] = React.useState<Set<string>>(new Set());
  const [selectedElement, setSelectedElement] = React.useState<SelectedElement | null>(null);
  const [showMenusPanel, setShowMenusPanel] = React.useState(false);
  const [domTreeByInstance, setDomTreeByInstance] = React.useState<Record<string, IframeDomTreeNode>>({});

  const handleDomTree = React.useCallback(
    (instanceId: string) => (tree: IframeDomTreeNode) => {
      setDomTreeByInstance((prev) => ({ ...prev, [instanceId]: tree }));
    },
    [],
  );

  const [focusedField, setFocusedField] = React.useState<string | null>(null);
  const [bulkSelectMode, setBulkSelectMode] = React.useState(false);
  const [bulkSelected, setBulkSelected] = React.useState<Set<string>>(new Set());
  const [bulkDialogOpen, setBulkDialogOpen] = React.useState(false);

  const pageInstanceIds = state.instancesByPage[state.activePage] ?? [];
  const selectedInstance = state.selectedInstanceId ? state.instances[state.selectedInstanceId] : null;

  const handleElementClick = React.useCallback((instanceId: string) => (info: IframeElementClickInfo) => {
    dispatch({ type: "SELECT_INSTANCE", payload: instanceId });
    setSelectedElement({ instanceId, ...info });
  }, [dispatch]);

  const handleSelectDomNode = React.useCallback(
    (instanceId: string) => (node: IframeDomTreeNode) => {
      dispatch({ type: "SELECT_INSTANCE", payload: instanceId });
      setFocusedField(null);
      setSelectedElement({
        instanceId,
        kind: node.kind,
        tag: node.tag,
        text: node.text,
        path: node.path,
        attrs: node.attrs,
        fieldId: null,
      });
    },
    [dispatch],
  );

  const toggleInstanceExpanded = (id: string) => {
    setExpandedInstances((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleLayerFieldSelect = (
    instanceId: string,
    focusKey: string,
    kind: ElementKind,
    blockId?: string,
  ) => {
    dispatch({ type: "SELECT_INSTANCE", payload: instanceId });
    setFocusedField(focusKey);
    // Build a synthetic SelectedElement so the kind-routed ElementPanel opens.
    // fieldId carries the actual content key (strip any blockId prefix).
    const actualKey = blockId ? focusKey.split(".").slice(1).join(".") : focusKey;
    const inst = state.instances[instanceId];
    let text = "";
    let attrs: ElementAttrs = {};
    if (inst) {
      const settings = blockId
        ? inst.blocks.find((b) => b.id === blockId)?.settings ?? {}
        : inst.content;
      const val = settings[actualKey];
      if (typeof val === "string") {
        if (kind === "image") attrs = { src: val };
        else if (kind === "link" || kind === "button") attrs = { href: val };
        else text = val;
      } else if (val && typeof val === "object") {
        const obj = val as Record<string, unknown>;
        text = (obj.label as string) ?? "";
        attrs = {
          href: obj.href as string | undefined,
          target: obj.target as string | undefined,
          src: obj.src as string | undefined,
          placeholder: obj.placeholder as string | undefined,
          name: obj.name as string | undefined,
          inputType: obj.input_type as string | undefined,
          action: obj.action as string | undefined,
          method: obj.method as string | undefined,
        };
      }
    }
    setSelectedElement({
      instanceId,
      kind,
      tag: kind === "image" ? "img" : kind === "button" || kind === "link" ? "a" : kind === "input" ? "input" : kind === "form" ? "form" : "p",
      text,
      path: [],
      attrs,
      fieldId: actualKey,
    });
  };

  const toggleBulkSelectMode = () => {
    setBulkSelectMode((v) => { if (v) setBulkSelected(new Set()); return !v; });
  };

  const toggleBulkItem = (instanceId: string) => {
    setBulkSelected((prev) => {
      const next = new Set(prev);
      if (next.has(instanceId)) next.delete(instanceId); else next.add(instanceId);
      return next;
    });
  };

  const handleApplyBulk = (updates: Array<{ id: string; content: Record<string, unknown> }>) => {
    updates.forEach(({ id, content }) => {
      dispatch({ type: "UPDATE_INSTANCE_CONTENT", payload: { id, content: { ...state.instances[id]?.content, ...content } } });
    });
    setBulkSelected(new Set());
    setBulkSelectMode(false);
  };

  const deviceWidth = state.deviceView === "mobile" ? 390 : state.deviceView === "tablet" ? 768 : 1200;

  // Determine left panel mode
  // "element" = an element inside a section was clicked (any kind: text, image, button, link, input, form)
  const panelMode: "global" | "section" | "element" =
    selectedElement ? "element" :
    selectedInstance ? "section" :
    "global";

  // Must be before any early return to satisfy rules-of-hooks
  const bulkInstances = React.useMemo(() => {
    return Array.from(bulkSelected).flatMap((id) => {
      const instance = state.instances[id];
      if (!instance) return [];
      const def = instance.section_def ?? (instance.section_id ? sectionDefs[instance.section_id] : null);
      return [{ instance, def }];
    });
  }, [bulkSelected, state.instances, sectionDefs]);

  // ── Full-screen preview ──────────────────────────────────────────────────────
  if (previewMode) {
    return (
      <div className="fixed inset-0 z-50 bg-white overflow-y-auto">
        <button
          onClick={() => setPreviewMode(false)}
          className="fixed top-4 right-4 z-50 flex items-center gap-1.5 px-3 py-2 bg-gray-900/90 text-white text-xs rounded-lg shadow-lg hover:bg-gray-900 transition-colors backdrop-blur"
        >
          <EyeOff size={13} />
          Quitter l&apos;aperçu
        </button>
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
                    menus={state.menus}
                    variables={state.variableContext}
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

      {/* ─ Bulk AI Dialog ───────────────────────────────────────────────────── */}
      <BulkAIDialog
        open={bulkDialogOpen}
        onClose={() => setBulkDialogOpen(false)}
        instances={bulkInstances}
        onApplyAll={handleApplyBulk}
        variableContext={state.variableContext}
      />

      {/* ─ Left Panel (context-sensitive) ───────────────────────────────────── */}
      {panelOpen && (
        <div className="w-[280px] flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden">

          {/* Panel header */}
          <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2 flex-shrink-0">
            {panelMode === "global" && !showMenusPanel && (
              <>
                <Settings2 size={12} className="text-gray-400" />
                <span className="text-xs font-semibold text-gray-700 flex-1">Paramètres globaux</span>
                <button
                  onClick={() => setShowMenusPanel(true)}
                  className="flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-700 px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                  title="Gérer les menus"
                >
                  <Navigation size={10} />
                  Menus
                </button>
              </>
            )}
            {panelMode === "global" && showMenusPanel && (
              <>
                <Navigation size={12} className="text-blue-500" />
                <span className="text-xs font-semibold text-gray-700 flex-1">Menus</span>
                <button onClick={() => setShowMenusPanel(false)} className="text-gray-400 hover:text-gray-600">
                  <X size={12} />
                </button>
              </>
            )}
            {panelMode === "section" && selectedInstance && (
              <>
                <Box size={12} className="text-blue-500" />
                <span className="text-xs font-semibold text-gray-800 flex-1 truncate">
                  {(selectedInstance.section_def ?? (selectedInstance.section_id ? sectionDefs[selectedInstance.section_id] : null))?.name ?? "Section"}
                </span>
                <button
                  onClick={() => { dispatch({ type: "SELECT_INSTANCE", payload: null }); setSelectedElement(null); }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X size={12} />
                </button>
              </>
            )}
            {panelMode === "element" && selectedElement && (
              <>
                {(() => {
                  const Icon = elementIcon(selectedElement.tag);
                  return <Icon size={12} className="text-purple-500" />;
                })()}
                <span className="text-xs font-semibold text-gray-800 flex-1">
                  &lt;{selectedElement.tag}&gt; {selectedElement.kind}
                </span>
                <button
                  onClick={() => setSelectedElement(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X size={12} />
                </button>
              </>
            )}
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-y-auto">
            {panelMode === "global" && !showMenusPanel && <GlobalPanel />}
            {panelMode === "global" && showMenusPanel && <SiteMenusPanel />}
            {panelMode === "section" && selectedInstance && (
              <SectionPanel
                instance={selectedInstance}
                sectionDefs={sectionDefs}
                onRegenerateSection={onRegenerateSection}
                focusedField={focusedField}
                onClearFocusedField={() => setFocusedField(null)}
              />
            )}
            {panelMode === "element" && selectedElement && selectedInstance && (
              <ElementPanel
                element={selectedElement}
                instance={selectedInstance}
              />
            )}
          </div>
        </div>
      )}

      {/* Panel toggle */}
      <button
        onClick={() => setPanelOpen(!panelOpen)}
        className="absolute z-20 w-5 h-12 bg-white border border-gray-200 border-l-0 rounded-r-md flex items-center justify-center text-gray-400 hover:text-gray-600 shadow-sm top-1/2 -translate-y-1/2"
        style={{ left: panelOpen ? 280 : 0 }}
      >
        <ChevronDown size={12} className={`transition-transform ${panelOpen ? "-rotate-90" : "rotate-90"}`} />
      </button>

      {/* ─ Canvas ──────────────────────────────────────────────────────────── */}
      <div
        className="flex-1 overflow-hidden relative select-none"
        onMouseDown={canvas.onMouseDown}
        onMouseMove={canvas.onMouseMove}
        onMouseUp={canvas.onMouseUp}
        onMouseLeave={canvas.onMouseUp}
        onWheel={canvas.onWheel}
        onClick={() => { if (!canvas.didPan.current) { dispatch({ type: "SELECT_INSTANCE", payload: null }); setSelectedElement(null); } }}
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
            <div className="flex gap-1">
              {state.sitemap.map((p) => (
                <button
                  key={p.id}
                  onClick={(e) => { e.stopPropagation(); dispatch({ type: "SET_ACTIVE_PAGE", payload: p.slug }); }}
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
            style={{ width: deviceWidth, borderRadius: 12, backgroundColor: state.styleGuide.colors.background }}
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
                      style={{
                        outline: isSelected ? "2px solid #3b82f6" : "2px solid transparent",
                        ...(instance.custom_style as React.CSSProperties ?? {}),
                      }}
                      onClick={(e) => { e.stopPropagation(); dispatch({ type: "SELECT_INSTANCE", payload: instanceId }); setSelectedElement(null); }}
                    >
                      <DynamicSectionRenderer
                        instance={{ ...instance, section_def: secDef }}
                        sectionDef={secDef}
                        styleGuide={state.styleGuide}
                        menus={state.menus}
                        variables={state.variableContext}
                        editorMode
                        selected={isSelected}
                        onSelect={() => { dispatch({ type: "SELECT_INSTANCE", payload: instanceId }); setSelectedElement(null); }}
                        selectedSnippetId={isSelected ? state.selectedSnippetId : null}
                        onSelectSnippet={(id) => dispatch({ type: "SELECT_SNIPPET", payload: id })}
                        selectionEnabled
                        onElementClick={handleElementClick(instanceId)}
                        onDomTree={handleDomTree(instanceId)}
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
            <button onClick={canvas.zoomOut} className="px-2 py-1 text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-colors">
              <ZoomOut size={12} />
            </button>
            <button onClick={canvas.resetZoom} className="px-2 py-1 text-xs text-gray-500 hover:bg-gray-50 font-mono min-w-[44px] text-center">
              {Math.round(canvas.scale * 100)}%
            </button>
            <button onClick={canvas.zoomIn} className="px-2 py-1 text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-colors">
              <ZoomIn size={12} />
            </button>
          </div>
        </div>
      </div>

      {/* ─ Right: Layers panel ──────────────────────────────────────────────── */}
      {layersOpen && (
        <div className="w-[240px] flex-shrink-0 bg-white border-l border-gray-200 flex flex-col">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
            <div className="flex items-center gap-1.5">
              <Layers size={12} className="text-gray-500" />
              <span className="text-xs font-semibold text-gray-700">Calques</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={toggleBulkSelectMode}
                title={bulkSelectMode ? "Quitter la sélection multiple" : "Sélection multiple pour IA groupée"}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                  bulkSelectMode
                    ? "bg-purple-100 text-purple-700 hover:bg-purple-200"
                    : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                }`}
              >
                <Sparkles size={10} />
                {bulkSelectMode ? "Sélection" : "IA ×N"}
              </button>
              <button onClick={() => setLayersOpen(false)} className="text-gray-400 hover:text-gray-600 ml-1">
                <ChevronRight size={14} />
              </button>
            </div>
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
                    <ChevronDown size={11} className={`text-gray-400 transition-transform ${isActive ? "" : "-rotate-90"}`} />
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
                        const schema = def ? getSchemaForSection(def) : null;
                        // Default all sections to expanded in layers
                        const expanded = !expandedInstances.has(`collapsed-${instanceId}`);
                        return (
                          <div key={instanceId}>
                            <div
                              className={`group flex items-center gap-1 px-1.5 py-1 rounded-md cursor-pointer ${
                                bulkSelectMode && bulkSelected.has(instanceId)
                                  ? "bg-purple-50 text-purple-700"
                                  : isSel ? "bg-blue-50 text-blue-700" : "hover:bg-gray-50"
                              }`}
                              onClick={() => {
                                if (bulkSelectMode) {
                                  toggleBulkItem(instanceId);
                                } else {
                                  dispatch({ type: "SELECT_INSTANCE", payload: instanceId });
                                  setSelectedElement(null);
                                  setFocusedField(null);
                                }
                              }}
                            >
                              {bulkSelectMode ? (
                                <button
                                  onClick={(e) => { e.stopPropagation(); toggleBulkItem(instanceId); }}
                                  className="flex-shrink-0 text-purple-400"
                                >
                                  {bulkSelected.has(instanceId)
                                    ? <CheckSquare size={11} className="text-purple-600" />
                                    : <Square size={11} className="text-gray-300" />}
                                </button>
                              ) : (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedInstances((prev) => {
                                      const next = new Set(prev);
                                      const key = `collapsed-${instanceId}`;
                                      if (next.has(key)) next.delete(key); else next.add(key);
                                      return next;
                                    });
                                  }}
                                  className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                                >
                                  <ChevronRight size={10} className={`transition-transform ${expanded ? "rotate-90" : ""}`} />
                                </button>
                              )}
                              <Box size={11} className={`flex-shrink-0 ${bulkSelectMode && bulkSelected.has(instanceId) ? "text-purple-400" : isSel ? "text-blue-400" : "text-gray-400"}`} />
                              <span className="flex-1 truncate text-[11px] font-medium">{def?.name ?? "Section"}</span>
                              {!bulkSelectMode && (
                                <>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); dispatch({ type: "TOGGLE_INSTANCE_VISIBILITY", payload: instanceId }); }}
                                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-700"
                                  >
                                    {inst.is_hidden ? <EyeOff size={10} /> : <Eye size={10} />}
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); dispatch({ type: "REMOVE_INSTANCE", payload: instanceId }); }}
                                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600"
                                  >
                                    <Trash2 size={10} />
                                  </button>
                                </>
                              )}
                            </div>
                            {expanded && (
                              <LayersFields
                                instance={inst}
                                schema={schema ?? null}
                                sectionDef={def ?? null}
                                focusedField={isSel ? focusedField : null}
                                onSelectField={(focusKey, kind, blockId) =>
                                  handleLayerFieldSelect(instanceId, focusKey, kind, blockId)
                                }
                                domTree={domTreeByInstance[instanceId] ?? null}
                                selectedDomPath={
                                  isSel && selectedElement?.path?.length
                                    ? selectedElement.path.join(".")
                                    : null
                                }
                                onSelectDomNode={handleSelectDomNode(instanceId)}
                              />
                            )}
                            {expanded && selectedElement?.instanceId === instanceId && (() => {
                              const Icon = elementIcon(selectedElement.tag);
                              return (
                                <div className="ml-3 pl-2 border-l border-gray-100 mt-0.5">
                                  <div className="flex items-center gap-1.5 px-1.5 py-1 rounded bg-purple-50 text-purple-700 text-[10px]">
                                    <Icon size={10} />
                                    <span className="font-semibold uppercase">{selectedElement.tag}</span>
                                    <span className="truncate text-purple-500">{selectedElement.text || "—"}</span>
                                  </div>
                                </div>
                              );
                            })()}
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

          {/* Bulk AI action bar */}
          {bulkSelectMode && (
            <div className={`border-t border-gray-100 px-3 py-2.5 flex flex-col gap-2 ${bulkSelected.size > 0 ? "bg-purple-50" : "bg-gray-50"}`}>
              {bulkSelected.size === 0 ? (
                <p className="text-[10px] text-gray-400 text-center">Cochez des sections pour les régénérer en groupe</p>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-purple-700">{bulkSelected.size} section{bulkSelected.size !== 1 ? "s" : ""}</span>
                    <button
                      onClick={() => setBulkSelected(new Set())}
                      className="text-[10px] text-gray-400 hover:text-gray-600"
                    >
                      Tout décocher
                    </button>
                  </div>
                  <button
                    onClick={() => setBulkDialogOpen(true)}
                    className="flex items-center justify-center gap-1.5 w-full py-1.5 text-xs font-semibold bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                  >
                    <Sparkles size={11} />
                    Régénérer avec IA
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
      {!layersOpen && (
        <button
          onClick={() => setLayersOpen(true)}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-5 h-12 bg-white border border-gray-200 border-r-0 rounded-l-md flex items-center justify-center text-gray-400 hover:text-gray-600 shadow-sm"
        >
          <Layers size={12} />
        </button>
      )}
    </div>
  );
}

// ─── Mode A: Global panel (nothing selected) ──────────────────────────────────

function GlobalPanel() {
  const { state, dispatch } = useRelumeBuilder();

  const anims = state.styleGuide.animations ?? {};
  const updateAnims = (patch: Record<string, unknown>) =>
    dispatch({ type: "UPDATE_STYLE_GUIDE", payload: { animations: { ...anims, ...patch } } });

  const MAX_WIDTHS: { label: string; value: string }[] = [
    { label: "Étroit (800px)", value: "800px" },
    { label: "Normal (1200px)", value: "1200px" },
    { label: "Large (1440px)", value: "1440px" },
    { label: "Plein (100%)", value: "100%" },
  ];

  return (
    <div className="divide-y divide-gray-100">
      {/* Animations & Transitions — stacked */}
      <Accordion title="Animations par défaut" icon={Zap} defaultOpen>
        <p className="text-[10px] text-gray-400 mb-3">
          Appliqué à chaque section qui n&apos;a pas d&apos;animation personnalisée (onglet Anim. du panneau de section).
        </p>
        <AnimationFieldEditor
          type={anims.defaultType ?? "none"}
          duration={anims.defaultDuration ?? 600}
          delay={anims.defaultDelay ?? 0}
          easing={anims.defaultEasing ?? "ease-out"}
          onUpdate={({ type, duration, delay, easing }) =>
            updateAnims({
              defaultType: type,
              defaultDuration: duration,
              defaultDelay: delay,
              defaultEasing: easing,
            })
          }
        />
      </Accordion>

      {/* Global style */}
      <Accordion title="Style global" icon={Palette} defaultOpen>
        <div>
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider flex justify-between mb-1">
            <span>Padding sections</span>
            <span className="font-mono text-gray-500">{state.styleGuide.spacing.sectionPadding}</span>
          </label>
          <input
            type="range" min={40} max={160}
            value={parseInt(state.styleGuide.spacing.sectionPadding)}
            onChange={(e) =>
              dispatch({ type: "UPDATE_STYLE_GUIDE", payload: { spacing: { ...state.styleGuide.spacing, sectionPadding: `${e.target.value}px` } } })
            }
            className="w-full accent-gray-900"
          />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider flex justify-between mb-1">
            <span>Gap éléments</span>
            <span className="font-mono text-gray-500">{state.styleGuide.spacing.elementGap}</span>
          </label>
          <input
            type="range" min={8} max={64}
            value={parseInt(state.styleGuide.spacing.elementGap)}
            onChange={(e) =>
              dispatch({ type: "UPDATE_STYLE_GUIDE", payload: { spacing: { ...state.styleGuide.spacing, elementGap: `${e.target.value}px` } } })
            }
            className="w-full accent-gray-900"
          />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-2">Largeur maximale du contenu</label>
          <select
            value={state.styleGuide.spacing.maxContentWidth}
            onChange={(e) =>
              dispatch({ type: "UPDATE_STYLE_GUIDE", payload: { spacing: { ...state.styleGuide.spacing, maxContentWidth: e.target.value } } })
            }
            className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-xs text-gray-700 bg-white focus:outline-none focus:border-blue-400"
          >
            {MAX_WIDTHS.map((w) => (
              <option key={w.value} value={w.value}>{w.label}</option>
            ))}
          </select>
        </div>
      </Accordion>

      {/* AI tip */}
      <div className="p-3 bg-purple-50/50">
        <div className="flex items-start gap-2">
          <Sparkles size={12} className="text-purple-500 flex-shrink-0 mt-0.5" />
          <p className="text-[10px] text-purple-700 leading-relaxed">
            Sélectionnez une section pour modifier son contenu et son style.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Mode B: Section properties panel ────────────────────────────────────────

type SectionTab = "content" | "style" | "ai";

function SectionPanel({
  instance,
  sectionDefs,
  onRegenerateSection,
  focusedField,
  onClearFocusedField,
}: {
  instance: SiteSectionInstance;
  sectionDefs: Record<string, SiteSectionDef>;
  onRegenerateSection?: (instanceId: string, prompt: string, model: string) => Promise<void>;
  focusedField?: string | null;
  onClearFocusedField?: () => void;
}) {
  const { state, dispatch } = useRelumeBuilder();
  const [activeTab, setActiveTab] = React.useState<SectionTab>("content");

  // Jump to Content tab when a field is focused from layers
  React.useEffect(() => {
    if (focusedField) setActiveTab("content");
  }, [focusedField]);

  const sectionDef = instance.section_def ?? (instance.section_id ? sectionDefs[instance.section_id] : null);
  const schema = sectionDef ? getSchemaForSection(sectionDef) : null;
  const ids = state.instancesByPage[instance.page_slug] ?? [];
  const idx = ids.indexOf(instance.id);

  const updateContent = (key: string, value: unknown) => {
    dispatch({ type: "UPDATE_INSTANCE_CONTENT", payload: { id: instance.id, content: { [key]: value } } });
  };

  const applyPreset = (preset: SectionPreset) => {
    dispatch({ type: "APPLY_PRESET", payload: { instanceId: instance.id, preset } });
  };

  const moveUp = () => {
    if (idx <= 0) return;
    dispatch({ type: "REORDER_INSTANCES", payload: { pageSlug: instance.page_slug, fromIndex: idx, toIndex: idx - 1 } });
  };
  const moveDown = () => {
    if (idx >= ids.length - 1) return;
    dispatch({ type: "REORDER_INSTANCES", payload: { pageSlug: instance.page_slug, fromIndex: idx, toIndex: idx + 1 } });
  };

  const TABS: { id: SectionTab; label: string; icon: React.ElementType }[] = [
    { id: "content", label: "Contenu", icon: FileText },
    { id: "style", label: "Style", icon: Palette },
    { id: "ai", label: "IA", icon: Sparkles },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Section actions */}
      <div className="px-3 py-2 border-b border-gray-100 flex gap-1 flex-shrink-0">
        <button
          onClick={() => dispatch({ type: "TOGGLE_INSTANCE_VISIBILITY", payload: instance.id })}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 px-2 py-1.5 rounded hover:bg-gray-50"
        >
          {instance.is_hidden ? <Eye size={11} /> : <EyeOff size={11} />}
          {instance.is_hidden ? "Afficher" : "Masquer"}
        </button>
        <button
          disabled={idx <= 0}
          onClick={moveUp}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 px-2 py-1.5 rounded hover:bg-gray-50 disabled:opacity-30"
          title="Monter"
        >
          <ChevronUp size={11} />
        </button>
        <button
          disabled={idx >= ids.length - 1}
          onClick={moveDown}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 px-2 py-1.5 rounded hover:bg-gray-50 disabled:opacity-30"
          title="Descendre"
        >
          <ChevronDown size={11} />
        </button>
        <button
          onClick={() => dispatch({ type: "REMOVE_INSTANCE", payload: instance.id })}
          className="flex items-center gap-1 text-xs text-red-400/70 hover:text-red-500 px-2 py-1.5 rounded hover:bg-red-50 ml-auto"
        >
          <Trash2 size={11} />
          Suppr.
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 flex-shrink-0">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs transition-colors border-b-2 ${
              activeTab === id
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            <Icon size={11} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === "content" && (
          <>
            {/* Click-to-edit hint */}
            <div className="flex items-start gap-2 px-2.5 py-2 bg-blue-50 border border-blue-100 rounded text-[10px] text-blue-700">
              <MousePointer size={11} className="flex-shrink-0 mt-0.5" />
              <span>
                Cliquez sur un titre, image, bouton ou champ dans le canvas pour ouvrir directement son éditeur — pas besoin de schéma. Le panneau ci-dessous reste disponible pour les sections avec schéma déclaré.
              </span>
            </div>

            {/* Presets */}
            {schema?.presets && schema.presets.length > 0 && (
              <PresetsPicker presets={schema.presets} onApply={applyPreset} />
            )}
            {/* Content fields (when schema is declared) */}
            {schema ? (
              <>
                {(() => {
                  const { contentFields } = splitSchemaFields(schema);
                  return contentFields.length > 0 ? (
                    <SchemaEditor
                      schema={{ name: "content", settings: contentFields }}
                      content={instance.content}
                      onUpdate={updateContent}
                      styleGuide={state.styleGuide}
                      variables={state.variableContext}
                      siteId={state.siteId}
                    />
                  ) : null;
                })()}
                {schema.blocks && schema.blocks.length > 0 && (
                  <BlocksEditor
                    schema={schema}
                    blocks={instance.blocks ?? []}
                    styleGuide={state.styleGuide}
                    onAdd={(blockType, settings) => dispatch({ type: "ADD_BLOCK", payload: { instanceId: instance.id, blockType, settings } })}
                    onUpdate={(blockId, settings) => dispatch({ type: "UPDATE_BLOCK", payload: { instanceId: instance.id, blockId, settings } })}
                    onRemove={(blockId) => dispatch({ type: "REMOVE_BLOCK", payload: { instanceId: instance.id, blockId } })}
                    onDuplicate={(blockId) => dispatch({ type: "DUPLICATE_BLOCK", payload: { instanceId: instance.id, blockId } })}
                    onReorder={(fromIndex, toIndex) => dispatch({ type: "REORDER_BLOCKS", payload: { instanceId: instance.id, fromIndex, toIndex } })}
                    variables={state.variableContext}
                    siteId={state.siteId}
                  />
                )}
              </>
            ) : (
              <p className="text-xs text-gray-400 text-center py-4">
                Pas de schéma déclaré — cliquez directement sur un élément du canvas, ou utilisez le panneau Layers.
              </p>
            )}
          </>
        )}

        {activeTab === "style" && (
          <>
            {/* Color scheme */}
            <div>
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-2">Palette de couleurs</label>
              <ColorSchemeField
                setting={{ type: "color_scheme", id: "__color_scheme", label: "Palette" }}
                value={(instance.content.__color_scheme as string) ?? "default"}
                onChange={(preset: ColorSchemePreset) => updateContent("__color_scheme", preset)}
                styleGuide={state.styleGuide}
              />
            </div>

            {/* Universal Dimensions */}
            <Accordion title="Hauteur" icon={Maximize2} defaultOpen>
              <UniversalHeightControls instance={instance} onUpdate={updateContent} />
            </Accordion>

            <Accordion title="Espacement" icon={ArrowUpDown} defaultOpen>
              <UniversalSpacingControls instance={instance} onUpdate={updateContent} />
            </Accordion>

            {/* Schema style fields */}
            {schema && (() => {
              const { styleFields, layoutFields } = splitSchemaFields(schema);
              const filteredStyle = styleFields.filter(
                (f) => !("id" in f) || (f.id !== "__color_scheme" && f.id !== "__padding_y")
              );
              const allStyleFields = [...filteredStyle, ...layoutFields];
              if (allStyleFields.length === 0) return null;
              return (
                <SchemaEditor
                  schema={{ name: "style", settings: allStyleFields }}
                  content={instance.content}
                  onUpdate={updateContent}
                  styleGuide={state.styleGuide}
                  variables={state.variableContext}
                  siteId={state.siteId}
                />
              );
            })()}

            {/* Per-section color overrides via CSS vars */}
            <SectionColorOverrides instance={instance} />

            {/* Advanced CSS overrides */}
            <div>
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-2">CSS avancé</label>
              <CustomStyleEditor instance={instance} />
            </div>
          </>
        )}

        {activeTab === "ai" && (
          onRegenerateSection ? (
            <AIRegenerateSection instanceId={instance.id} onRegenerate={onRegenerateSection} />
          ) : (
            <div className="text-center py-6 space-y-2">
              <Sparkles size={20} className="text-purple-400/30 mx-auto" />
              <p className="text-xs text-gray-400">Régénération IA non disponible</p>
            </div>
          )
        )}
      </div>
    </div>
  );
}


// ─── Universal Height Controls ────────────────────────────────────────────────

type HeightMode = "auto" | "fullscreen" | "large" | "fixed";

function UniversalHeightControls({
  instance,
  onUpdate,
}: {
  instance: SiteSectionInstance;
  onUpdate: (key: string, value: unknown) => void;
}) {
  const heightMode = (instance.content.__height_mode as HeightMode) ?? "auto";
  const heightValue = (instance.content.__height_value as string) ?? "400px";
  const [localPx, setLocalPx] = React.useState(() => parseInt(heightValue) || 400);

  const MODES: { id: HeightMode; label: string; desc: string }[] = [
    { id: "auto", label: "Fit", desc: "Taille du contenu" },
    { id: "fullscreen", label: "Fill", desc: "100% de l'écran" },
    { id: "large", label: "Large", desc: "80% de l'écran" },
    { id: "fixed", label: "Fixe", desc: "Hauteur personnalisée" },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1.5">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => onUpdate("__height_mode", m.id)}
            className={`text-left px-2.5 py-2 rounded-lg border text-[10px] transition-colors ${heightMode === m.id ? "bg-gray-900 text-white border-gray-900" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
          >
            <div className="font-semibold">{m.label}</div>
            <div className={`text-[9px] ${heightMode === m.id ? "text-gray-300" : "text-gray-400"}`}>{m.desc}</div>
          </button>
        ))}
      </div>
      {heightMode === "fixed" && (
        <div>
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider flex justify-between mb-1">
            <span>Hauteur fixe</span>
            <span className="font-mono text-gray-500">{localPx}px</span>
          </label>
          <input
            type="range" min={100} max={1200} step={10} value={localPx}
            onChange={(e) => { setLocalPx(+e.target.value); onUpdate("__height_value", `${e.target.value}px`); }}
            className="w-full accent-gray-900"
          />
          <input
            type="number" min={100} max={2000} value={localPx}
            onChange={(e) => { const v = +e.target.value; setLocalPx(v); onUpdate("__height_value", `${v}px`); }}
            className="mt-1 w-full bg-gray-50 border border-gray-200 rounded px-2 py-1 text-xs text-gray-800 focus:outline-none focus:border-blue-400"
          />
        </div>
      )}
    </div>
  );
}

// ─── Universal Spacing Controls ───────────────────────────────────────────────

function SpacingRow({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider flex justify-between mb-1">
        <span>{label}</span>
        <span className="font-mono text-gray-500">{value}px</span>
      </label>
      <input
        type="range" min={min} max={max} step={4} value={value}
        onChange={(e) => onChange(+e.target.value)}
        className="w-full accent-gray-900"
      />
    </div>
  );
}

function UniversalSpacingControls({
  instance,
  onUpdate,
}: {
  instance: SiteSectionInstance;
  onUpdate: (key: string, value: unknown) => void;
}) {
  const padTop = typeof instance.content.__padding_top === "number" ? instance.content.__padding_top as number : 80;
  const padBottom = typeof instance.content.__padding_bottom === "number" ? instance.content.__padding_bottom as number : 80;
  const padX = typeof instance.content.__padding_x === "number" ? instance.content.__padding_x as number : 24;
  const marginTop = typeof instance.content.__margin_top === "number" ? instance.content.__margin_top as number : 0;
  const marginBottom = typeof instance.content.__margin_bottom === "number" ? instance.content.__margin_bottom as number : 0;

  return (
    <div className="space-y-3">
      <div>
        <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Padding</div>
        <SpacingRow label="Haut" value={padTop} min={0} max={240} onChange={(v) => onUpdate("__padding_top", v)} />
        <SpacingRow label="Bas" value={padBottom} min={0} max={240} onChange={(v) => onUpdate("__padding_bottom", v)} />
        <SpacingRow label="Horizontal" value={padX} min={0} max={120} onChange={(v) => onUpdate("__padding_x", v)} />
      </div>
      <div>
        <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Marge</div>
        <SpacingRow label="Haut" value={marginTop} min={-80} max={120} onChange={(v) => onUpdate("__margin_top", v)} />
        <SpacingRow label="Bas" value={marginBottom} min={-80} max={120} onChange={(v) => onUpdate("__margin_bottom", v)} />
      </div>
    </div>
  );
}

// ─── Custom Style Editor ──────────────────────────────────────────────────────

function CustomStyleEditor({ instance }: { instance: SiteSectionInstance }) {
  const { dispatch } = useRelumeBuilder();
  const style = (instance.custom_style ?? {}) as Record<string, string>;

  const updateStyle = (key: string, value: string) => {
    dispatch({ type: "UPDATE_INSTANCE_STYLE", payload: { id: instance.id, style: { [key]: value } } });
  };

  const commonProps = [
    { key: "borderRadius", label: "Border radius", placeholder: "0px" },
    { key: "boxShadow", label: "Box shadow", placeholder: "0 4px 24px rgba(0,0,0,.1)" },
    { key: "border", label: "Bordure", placeholder: "1px solid #e5e7eb" },
  ];

  return (
    <div className="space-y-2">
      {commonProps.map(({ key, label, placeholder }) => (
        <div key={key}>
          <label className="text-[10px] text-gray-500 block mb-1">{label}</label>
          <input
            type="text"
            value={style[key] ?? ""}
            placeholder={placeholder}
            onChange={(e) => updateStyle(key, e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded px-2.5 py-1.5 text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:border-blue-400"
          />
        </div>
      ))}
    </div>
  );
}

// ─── Presets Picker ───────────────────────────────────────────────────────────

function PresetsPicker({ presets, onApply }: { presets: SectionPreset[]; onApply: (p: SectionPreset) => void }) {
  const [open, setOpen] = React.useState(false);
  const [confirmIndex, setConfirmIndex] = React.useState<number | null>(null);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50/50">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-gray-100/50 transition-colors"
      >
        <div>
          <div className="text-[11px] font-medium text-gray-700">Presets</div>
          <div className="text-[10px] text-gray-400">{presets.length} configuration{presets.length > 1 ? "s" : ""} disponible{presets.length > 1 ? "s" : ""}</div>
        </div>
        <Sparkles size={11} className="text-purple-400" />
      </button>
      {open && (
        <div className="border-t border-gray-200">
          {presets.map((preset, i) => (
            <div key={i} className="border-b border-gray-100 last:border-b-0">
              <button
                onClick={() => setConfirmIndex(confirmIndex === i ? null : i)}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors"
              >
                <div className="text-[11px] font-medium text-gray-800">{preset.name}</div>
                {preset.description && <div className="text-[10px] text-gray-400 mt-0.5">{preset.description}</div>}
              </button>
              {confirmIndex === i && (
                <div className="flex gap-2 px-3 pb-2">
                  <button
                    onClick={() => { onApply(preset); setConfirmIndex(null); setOpen(false); }}
                    className="flex-1 text-[10px] py-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 rounded"
                  >
                    Appliquer (remplace le contenu)
                  </button>
                  <button
                    onClick={() => setConfirmIndex(null)}
                    className="text-[10px] py-1 px-2 text-gray-500 hover:text-gray-700"
                  >
                    Annuler
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── AI Section Regeneration ──────────────────────────────────────────────────

function AIRegenerateSection({
  instanceId,
  onRegenerate,
}: {
  instanceId: string;
  onRegenerate: (id: string, prompt: string, model: string) => Promise<void>;
}) {
  const { state } = useRelumeBuilder();
  const [prompt, setPrompt] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [selectedModel, setSelectedModel] = useAIModel();

  const handleRegenerate = async () => {
    setLoading(true);
    try {
      await onRegenerate(instanceId, prompt, selectedModel);
      setPrompt("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles size={12} className="text-purple-500" />
        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">IA Copywriting</span>
      </div>
      <div>
        <label className="text-[10px] text-gray-500 block mb-1">Modèle IA</label>
        <ModelDropdown value={selectedModel} onChange={setSelectedModel} />
      </div>
      <VariableTextarea
        value={prompt}
        onChange={setPrompt}
        placeholder="Ex: rends ce contenu plus professionnel et dynamique..."
        rows={3}
        className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:border-purple-400 resize-none"
        variables={state.variableContext}
        variant="light"
      />
      <button
        onClick={handleRegenerate}
        disabled={loading || !prompt.trim()}
        className="w-full flex items-center justify-center gap-2 py-2 text-xs font-medium bg-purple-500/10 text-purple-600 border border-purple-200 hover:bg-purple-500/20 rounded-lg transition-all disabled:opacity-50"
      >
        {loading ? <RefreshCw size={12} className="animate-spin" /> : <Sparkles size={12} />}
        {loading ? "Génération..." : "Régénérer le contenu"}
      </button>
      <p className="text-[10px] text-gray-400 text-center leading-relaxed">
        L&apos;IA réécrira le contenu de cette section en conservant la structure.
      </p>
    </div>
  );
}

// ─── Per-section color overrides (stored as CSS vars in custom_style) ────────

const SECTION_COLOR_OVERRIDES: { cssVar: string; label: string }[] = [
  { cssVar: "--color-primary", label: "Couleur principale" },
  { cssVar: "--color-background", label: "Fond de section" },
  { cssVar: "--color-text", label: "Couleur du texte" },
  { cssVar: "--color-secondary", label: "Couleur secondaire" },
];

function SectionColorOverrides({ instance }: { instance: SiteSectionInstance }) {
  const { dispatch } = useRelumeBuilder();
  const style = (instance.custom_style ?? {}) as Record<string, string>;
  const [open, setOpen] = React.useState(false);

  const updateVar = (cssVar: string, value: string) => {
    dispatch({ type: "UPDATE_INSTANCE_STYLE", payload: { id: instance.id, style: { [cssVar]: value } } });
  };

  const hasOverrides = SECTION_COLOR_OVERRIDES.some((o) => style[o.cssVar] && style[o.cssVar] !== "");

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-gray-50 transition-colors"
      >
        <div>
          <div className="text-[11px] font-medium text-gray-700">Couleurs de section</div>
          <div className="text-[10px] text-gray-400 mt-0.5">
            {hasOverrides ? "Surcharges actives" : "Utilise le style global"}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {hasOverrides && <span className="w-2 h-2 rounded-full bg-blue-500" />}
          <ChevronDown size={11} className={`text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>
      {open && (
        <div className="border-t border-gray-100 px-3 pb-3 pt-2 space-y-2">
          {SECTION_COLOR_OVERRIDES.map(({ cssVar, label }) => (
            <div key={cssVar} className="flex items-center gap-2">
              <input
                type="color"
                value={style[cssVar] ?? "#000000"}
                onChange={(e) => updateVar(cssVar, e.target.value)}
                className="w-7 h-7 rounded border border-gray-200 cursor-pointer flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-gray-700 font-medium">{label}</div>
                {style[cssVar] && (
                  <div className="text-[9px] font-mono text-gray-400">{style[cssVar]}</div>
                )}
              </div>
              {style[cssVar] && (
                <button
                  onClick={() => updateVar(cssVar, "")}
                  className="text-gray-300 hover:text-red-400 transition-colors"
                  title="Supprimer la surcharge"
                >
                  <X size={11} />
                </button>
              )}
            </div>
          ))}
          <p className="text-[9px] text-gray-400 leading-relaxed pt-1">
            Ces couleurs remplacent le style global uniquement pour cette section.
          </p>
        </div>
      )}
    </div>
  );
}

void Move;
