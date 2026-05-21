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
  ArrowUpDown, Square, CheckSquare, Repeat,
} from "lucide-react";
import { SectionPickerModal } from "./SectionPickerModal";
import {
  resolveNavbarLayout,
  DEFAULT_NAVBAR_LAYOUT,
  type NavbarPosition,
} from "@/lib/site-builder/position-layout";
import { NAVBAR_CATEGORIES } from "@/lib/site-builder/menu-overrides";
import { BulkAIDialog } from "./BulkAIDialog";
import type { SiteSectionDef, SiteSectionInstance } from "@/types";
import { useRelumeBuilder } from "./RelumeBuilderProvider";
import { DynamicSectionRenderer } from "../DynamicSectionRenderer";
import { getSimulatedViewportHeight } from "@/lib/site-builder/preview-viewport";
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
import { useServiceTags } from "@/hooks/useServiceTags";
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

  /**
   * Native wheel listener with `passive: false` so `preventDefault()`
   * actually blocks the browser's Ctrl+wheel / trackpad-pinch zoom on the
   * page. React's synthetic `onWheel` is registered as passive and
   * silently ignores `preventDefault`. We attach via a callback ref so
   * the listener is bound once per canvas element instance.
   */
  const wheelRef = React.useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        setScale((s) => Math.min(2, Math.max(0.2, s * (e.deltaY > 0 ? 0.9 : 1.1))));
      } else {
        setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
      }
    };
    el.addEventListener("wheel", handler, { passive: false });
    // Stash the cleanup on the element so a later re-attach can detach.
    (el as HTMLDivElement & { __wheelCleanup?: () => void }).__wheelCleanup?.();
    (el as HTMLDivElement & { __wheelCleanup?: () => void }).__wheelCleanup = () => el.removeEventListener("wheel", handler);
  }, []);

  /** Apply a wheel delta to the canvas state programmatically. Used to
   *  re-route wheel events that originate INSIDE a library iframe (where
   *  the native event never bubbles to our `.canvas-host` listener). */
  const applyWheel = React.useCallback((e: { deltaX: number; deltaY: number; ctrlKey: boolean; metaKey: boolean }) => {
    if (e.ctrlKey || e.metaKey) {
      setScale((s) => Math.min(2, Math.max(0.2, s * (e.deltaY > 0 ? 0.9 : 1.1))));
    } else {
      setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
    }
  }, []);

  const zoomIn = () => setScale((s) => Math.min(2, parseFloat((s + 0.1).toFixed(2))));
  const zoomOut = () => setScale((s) => Math.max(0.2, parseFloat((s - 0.1).toFixed(2))));
  const resetZoom = () => { setScale(0.8); setPan({ x: 60, y: 30 }); };

  return { pan, scale, didPan, onMouseDown, onMouseMove, onMouseUp, wheelRef, applyWheel, zoomIn, zoomOut, resetZoom };
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
  /** Full library of sections — needed to power the Replace flow. */
  availableSections?: SiteSectionDef[];
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

export function DesignWorkspace({ sectionDefs, availableSections = [], onRegenerateSection }: DesignWorkspaceProps) {
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
  const [replaceTargetId, setReplaceTargetId] = React.useState<string | null>(null);

  const replaceTargetInstance = replaceTargetId ? state.instances[replaceTargetId] : null;
  const replaceTargetDef = replaceTargetInstance
    ? (replaceTargetInstance.section_def ?? (replaceTargetInstance.section_id ? sectionDefs[replaceTargetInstance.section_id] : null))
    : null;

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
  const simulatedViewportHeight = getSimulatedViewportHeight(state.deviceView);

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
                    simulatedViewportHeight={simulatedViewportHeight}
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
    <div style={{ display: "flex", height: "100%", overflow: "hidden", flex: 1, minHeight: 0, position: "relative" }}>

      {/* ─ Section Picker Modal (Replace flow) ──────────────────────────────── */}
      <SectionPickerModal
        open={!!replaceTargetId}
        sections={availableSections}
        initialCategory={replaceTargetDef?.category ?? null}
        onHover={(secDef) =>
          replaceTargetId
            ? dispatch({
                type: "SET_PREVIEW_REPLACE",
                payload: secDef ? { instanceId: replaceTargetId, sectionDef: secDef } : null,
              })
            : undefined
        }
        onPick={(secDef) => {
          if (!replaceTargetId) return;
          dispatch({ type: "REPLACE_INSTANCE", payload: { instanceId: replaceTargetId, sectionDef: secDef } });
          setReplaceTargetId(null);
        }}
        onClose={() => {
          dispatch({ type: "SET_PREVIEW_REPLACE", payload: null });
          setReplaceTargetId(null);
        }}
      />

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
        <aside className="pane" style={{ width: 280, flexShrink: 0 }}>

          {/* Panel header */}
          <div className="pane-hd contextual">
            {panelMode === "global" && !showMenusPanel && (
              <>
                <div className="title-with-icon">
                  <Settings2 size={12} style={{ color: "var(--text-3)" }} />
                  <span>Paramètres globaux</span>
                </div>
                <div className="actions">
                  <button
                    onClick={() => setShowMenusPanel(true)}
                    className="btn ghost xs"
                    style={{ color: "var(--info)" }}
                    title="Gérer les menus"
                  >
                    <Navigation size={10} />Menus
                  </button>
                </div>
              </>
            )}
            {panelMode === "global" && showMenusPanel && (
              <>
                <div className="title-with-icon">
                  <Navigation size={12} style={{ color: "var(--info)" }} />
                  <span>Menus</span>
                </div>
                <div className="actions">
                  <button onClick={() => setShowMenusPanel(false)} className="btn ghost sm icon" title="Retour">
                    <X size={12} />
                  </button>
                </div>
              </>
            )}
            {panelMode === "section" && selectedInstance && (
              <>
                <div className="title-with-icon" style={{ minWidth: 0 }}>
                  <Box size={12} style={{ color: "var(--accent-2)" }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {(selectedInstance.section_def ?? (selectedInstance.section_id ? sectionDefs[selectedInstance.section_id] : null))?.name ?? "Section"}
                  </span>
                </div>
                <div className="actions">
                  <button
                    onClick={() => setReplaceTargetId(selectedInstance.id)}
                    className="btn ghost xs"
                    title="Remplacer la section"
                  >
                    <Repeat size={11} />Changer
                  </button>
                  <button
                    onClick={() => { dispatch({ type: "SELECT_INSTANCE", payload: null }); setSelectedElement(null); }}
                    className="btn ghost sm icon"
                    title="Désélectionner"
                  >
                    <X size={12} />
                  </button>
                </div>
              </>
            )}
            {panelMode === "element" && selectedElement && (
              <>
                <div className="title-with-icon">
                  {(() => {
                    const Icon = elementIcon(selectedElement.tag);
                    return <Icon size={12} style={{ color: "var(--magic)" }} />;
                  })()}
                  <span className="element-tag-pill">&lt;{selectedElement.tag}&gt;</span>
                  <span style={{ color: "var(--text-3)", fontSize: 11 }}>{selectedElement.kind}</span>
                </div>
                <div className="actions">
                  <button onClick={() => setSelectedElement(null)} className="btn ghost sm icon" title="Fermer">
                    <X size={12} />
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Panel content */}
          <div className="pane-body">
            {panelMode === "global" && !showMenusPanel && <GlobalPanel />}
            {panelMode === "global" && showMenusPanel && <SiteMenusPanel />}
            {panelMode === "section" && selectedInstance && (
              <SectionPanel
                instance={selectedInstance}
                sectionDefs={sectionDefs}
                onRegenerateSection={onRegenerateSection}
                focusedField={focusedField}
                onClearFocusedField={() => setFocusedField(null)}
                onReplace={() => setReplaceTargetId(selectedInstance.id)}
              />
            )}
            {panelMode === "element" && selectedElement && selectedInstance && (
              <ElementPanel
                element={selectedElement}
                instance={selectedInstance}
              />
            )}
          </div>
        </aside>
      )}

      {/* Panel toggle */}
      <button
        onClick={() => setPanelOpen(!panelOpen)}
        style={{
          position: "absolute",
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
          top: "50%",
          transform: "translateY(-50%)",
          left: panelOpen ? 280 : 0,
          cursor: "default",
        }}
        title={panelOpen ? "Masquer le panneau" : "Afficher le panneau"}
      >
        <ChevronDown size={11} style={{ transform: panelOpen ? "rotate(-90deg)" : "rotate(90deg)", transition: "transform .15s" }} />
      </button>

      {/* ─ Canvas ──────────────────────────────────────────────────────────── */}
      <div
        ref={canvas.wheelRef}
        className="canvas-host"
        onMouseDown={canvas.onMouseDown}
        onMouseMove={canvas.onMouseMove}
        onMouseUp={canvas.onMouseUp}
        onMouseLeave={canvas.onMouseUp}
        onClick={() => { if (!canvas.didPan.current) { dispatch({ type: "SELECT_INSTANCE", payload: null }); setSelectedElement(null); } }}
        style={{ cursor: "grab", flex: 1 }}
      >
        {/* Dot grid */}
        <div className="canvas-dotgrid" />

        <div
          className="canvas-stage"
          style={{
            transform: `translate(${canvas.pan.x}px, ${canvas.pan.y}px) scale(${canvas.scale})`,
            width: deviceWidth,
          }}
        >
          {/* Page meta bar */}
          <div className="page-meta-bar">
            <div className="page-chip">
              <Layers size={12} />
              <span>{state.sitemap.find((p) => p.slug === state.activePage)?.title ?? "Accueil"}</span>
              <span className="slug">{state.activePage}</span>
            </div>
            <div className="page-tabs">
              {state.sitemap.map((p, i) => (
                <button
                  key={p.id}
                  onClick={(e) => { e.stopPropagation(); dispatch({ type: "SET_ACTIVE_PAGE", payload: p.slug }); }}
                  className="page-tab"
                  aria-selected={state.activePage === p.slug ? "true" : "false"}
                >
                  <span className="pgnum">{String(i + 1).padStart(2, "0")}</span>
                  {p.title}
                </button>
              ))}
            </div>
          </div>

          {/* Styled canvas */}
          <div
            className="device-frame"
            style={{ width: deviceWidth, backgroundColor: state.styleGuide.colors.background }}
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
                  const originalDef = instance.section_def ?? (instance.section_id ? sectionDefs[instance.section_id] : null);
                  // Live swap when this instance is being previewed in the picker modal.
                  const isPreviewed = state.previewReplace?.instanceId === instanceId;
                  const previewDef = isPreviewed ? state.previewReplace!.sectionDef : null;
                  const secDef = previewDef ?? originalDef;
                  if (!secDef) return null;
                  const previewContent: Record<string, unknown> = previewDef
                    ? {
                        ...(previewDef.default_content as Record<string, unknown>),
                        ...(previewDef.theme_slug && previewDef.theme_section_id
                          ? {
                              __library: {
                                theme_slug: previewDef.theme_slug,
                                section_id: previewDef.theme_section_id,
                              },
                            }
                          : {}),
                      }
                    : instance.content;
                  const isSelected = state.selectedInstanceId === instanceId;

                  return (
                    <div
                      key={instanceId}
                      className="ws-section"
                      data-selected={isSelected ? "true" : undefined}
                      style={{
                        outline: isPreviewed ? "2px dashed var(--magic)" : undefined,
                        ...(instance.custom_style as React.CSSProperties ?? {}),
                      }}
                      onClick={(e) => { e.stopPropagation(); dispatch({ type: "SELECT_INSTANCE", payload: instanceId }); setSelectedElement(null); }}
                    >
                      <span className="ws-tag"><span className="dot" />{secDef.name}</span>
                      <DynamicSectionRenderer
                        instance={{ ...instance, section_def: secDef, content: previewContent, blocks: previewDef ? [] : instance.blocks }}
                        sectionDef={secDef}
                        styleGuide={state.styleGuide}
                        menus={state.menus}
                        variables={state.variableContext}
                        editorMode
                        selected={isSelected}
                        onSelect={() => { dispatch({ type: "SELECT_INSTANCE", payload: instanceId }); setSelectedElement(null); }}
                        selectedSnippetId={isSelected ? state.selectedSnippetId : null}
                        onSelectSnippet={(id) => dispatch({ type: "SELECT_SNIPPET", payload: id })}
                        selectionEnabled={!isPreviewed}
                        onElementClick={handleElementClick(instanceId)}
                        onDomTree={handleDomTree(instanceId)}
                        onCanvasWheel={canvas.applyWheel}
                        simulatedViewportHeight={simulatedViewportHeight}
                      />
                      {isPreviewed && (
                        <div style={{ position: "absolute", top: 0, left: 0, zIndex: 30, background: "var(--magic)", color: "#fff", fontSize: 9, padding: "2px 7px", borderBottomRightRadius: 5, fontFamily: "var(--font-mono)", fontWeight: 500 }}>
                          Aperçu: {previewDef!.name}
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
            <button onClick={() => setPreviewMode(true)} title="Aperçu plein écran">
              <Eye size={12} />
              Aperçu
            </button>
          </div>
          <div className="grp">
            <button onClick={canvas.zoomOut} title="Dézoomer"><ZoomOut size={12} /></button>
            <button onClick={canvas.resetZoom} title="Réinitialiser"><span className="zoom-val">{Math.round(canvas.scale * 100)}%</span></button>
            <button onClick={canvas.zoomIn} title="Zoomer"><ZoomIn size={12} /></button>
          </div>
        </div>

        <div className="canvas-help">Glisser · <kbd>⌘</kbd>+scroll</div>
      </div>

      {/* ─ Right: Layers panel ──────────────────────────────────────────────── */}
      {layersOpen && (
        <aside className="pane" style={{ width: 240, flexShrink: 0 }}>
          <div className="pane-hd contextual">
            <div className="title-with-icon">
              <Layers size={12} style={{ color: "var(--text-3)" }} />
              <span>Calques</span>
            </div>
            <div className="actions">
              <button
                onClick={toggleBulkSelectMode}
                title={bulkSelectMode ? "Quitter la sélection multiple" : "Sélection multiple pour IA groupée"}
                className={bulkSelectMode ? "btn magic xs" : "btn ghost xs"}
                style={bulkSelectMode ? { background: "var(--magic-tint)", color: "var(--magic)", border: 0 } : undefined}
              >
                <Sparkles size={10} />
                {bulkSelectMode ? "Sélection" : "IA ×N"}
              </button>
              <button onClick={() => setLayersOpen(false)} className="btn ghost sm icon" title="Masquer">
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
          <div className="pane-body" style={{ padding: "8px 6px" }}>
            {state.sitemap.map((page) => {
              const ids = state.instancesByPage[page.slug] ?? [];
              const isActive = page.slug === state.activePage;
              return (
                <div key={page.id} style={{ marginBottom: 4 }}>
                  <button
                    onClick={() => dispatch({ type: "SET_ACTIVE_PAGE", payload: page.slug })}
                    className="layer-page"
                    aria-selected={isActive ? "true" : "false"}
                    aria-expanded={isActive ? "true" : "false"}
                    style={{ width: "100%", appearance: "none", border: 0, background: "transparent", textAlign: "left" }}
                  >
                    <ChevronDown size={11} className="chev" />
                    <span style={{ fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{page.title}</span>
                    <span className="count">{ids.length}</span>
                  </button>
                  {isActive && (
                    <div className="layer-children">
                      {ids.map((instanceId) => {
                        const inst = state.instances[instanceId];
                        if (!inst) return null;
                        const def = inst.section_def ?? (inst.section_id ? sectionDefs[inst.section_id] : null);
                        const isSel = state.selectedInstanceId === instanceId;
                        const schema = def ? getSchemaForSection(def) : null;
                        const expanded = !expandedInstances.has(`collapsed-${instanceId}`);
                        const bulkChecked = bulkSelectMode && bulkSelected.has(instanceId);
                        return (
                          <div key={instanceId}>
                            <div
                              className={`layer-section ${bulkSelectMode ? "bulk-on" : ""}`}
                              aria-selected={isSel ? "true" : "false"}
                              data-checked={bulkChecked ? "true" : undefined}
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
                                  style={{ flexShrink: 0, appearance: "none", border: 0, background: "transparent", cursor: "default", color: "var(--magic)" }}
                                >
                                  {bulkSelected.has(instanceId)
                                    ? <CheckSquare size={11} />
                                    : <Square size={11} style={{ color: "var(--text-4)" }} />}
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
                                  style={{ flexShrink: 0, appearance: "none", border: 0, background: "transparent", cursor: "default", color: "var(--text-4)" }}
                                >
                                  <ChevronRight size={10} style={{ transform: expanded ? "rotate(90deg)" : undefined, transition: "transform .15s" }} />
                                </button>
                              )}
                              <Box size={11} className="ico-section" />
                              <span className="name">{def?.name ?? "Section"}</span>
                              {!bulkSelectMode && (
                                <div className="rowtools">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); dispatch({ type: "TOGGLE_INSTANCE_VISIBILITY", payload: instanceId }); }}
                                    title={inst.is_hidden ? "Afficher" : "Masquer"}
                                  >
                                    {inst.is_hidden ? <EyeOff size={10} /> : <Eye size={10} />}
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); dispatch({ type: "REMOVE_INSTANCE", payload: instanceId }); }}
                                    className="danger"
                                    title="Supprimer"
                                  >
                                    <Trash2 size={10} />
                                  </button>
                                </div>
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
                                <div className="layer-children" style={{ marginTop: 2 }}>
                                  <div className="layer-field" aria-selected="true">
                                    <Icon size={10} className="ico-kind" />
                                    <span className="element-tag-pill" style={{ height: 18, fontSize: 10 }}>{selectedElement.tag}</span>
                                    <span className="prev">{selectedElement.text || "—"}</span>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })}
                      {ids.length === 0 && (
                        <div className="empty-row">Aucune section</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Bulk AI action bar */}
          {bulkSelectMode && (
            <div
              style={{
                borderTop: "1px solid var(--border)",
                padding: "10px 12px",
                display: "flex",
                flexDirection: "column",
                gap: 8,
                background: bulkSelected.size > 0 ? "var(--magic-tint)" : "var(--bg)",
              }}
            >
              {bulkSelected.size === 0 ? (
                <p style={{ fontSize: 10.5, color: "var(--text-4)", textAlign: "center", margin: 0 }}>Cochez des sections pour les régénérer en groupe</p>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--magic)" }}>
                      {bulkSelected.size} section{bulkSelected.size !== 1 ? "s" : ""}
                    </span>
                    <button
                      onClick={() => setBulkSelected(new Set())}
                      className="btn ghost xs"
                    >
                      Tout décocher
                    </button>
                  </div>
                  <button
                    onClick={() => setBulkDialogOpen(true)}
                    className="btn magic sm"
                    style={{ width: "100%", justifyContent: "center" }}
                  >
                    <Sparkles size={11} />
                    Régénérer avec IA
                  </button>
                </>
              )}
            </div>
          )}
        </aside>
      )}
      {!layersOpen && (
        <button
          onClick={() => setLayersOpen(true)}
          style={{
            position: "absolute",
            right: 0,
            top: "50%",
            transform: "translateY(-50%)",
            zIndex: 20,
            width: 18,
            height: 44,
            background: "var(--surface)",
            border: "1px solid var(--border-2)",
            borderRight: 0,
            borderRadius: "6px 0 0 6px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-4)",
            boxShadow: "var(--shadow-1)",
            cursor: "default",
          }}
          title="Afficher les calques"
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

  const guide = state.styleGuide;
  const anims = guide.animations ?? {};
  const updateAnims = (patch: Record<string, unknown>) =>
    dispatch({ type: "UPDATE_STYLE_GUIDE", payload: { animations: { ...anims, ...patch } } });
  const updateColor = (key: keyof typeof guide.colors, hex: string) =>
    dispatch({ type: "UPDATE_STYLE_GUIDE", payload: { colors: { ...guide.colors, [key]: hex } } });
  const updateFont = (role: "heading" | "body", value: string) =>
    dispatch({ type: "UPDATE_STYLE_GUIDE", payload: { fonts: { ...guide.fonts, [role]: value } } });
  const updateSpacing = (key: keyof typeof guide.spacing, value: string) =>
    dispatch({ type: "UPDATE_STYLE_GUIDE", payload: { spacing: { ...guide.spacing, [key]: value } } });

  const COLOR_SWATCHES: Array<{ key: keyof typeof guide.colors; label: string }> = [
    { key: "primary", label: "Primaire" },
    { key: "secondary", label: "Secondaire" },
    { key: "accent", label: "Accent" },
    { key: "background", label: "Fond" },
    { key: "text", label: "Texte" },
  ];

  const FONT_OPTIONS_HEAD = [
    "Instrument Serif", "Fraunces", "Playfair Display", "Bodoni Moda", "DM Serif Display",
    "Cormorant Garamond", "Lora", "EB Garamond", "Crimson Pro", "PT Serif",
    "Merriweather", "Source Serif 4",
    "Geist", "Inter", "Instrument Sans", "Manrope", "Outfit", "Unbounded",
    "Anton", "Archivo Black", "Bebas Neue", "Oswald",
  ];
  const FONT_OPTIONS_BODY = [
    "Geist", "Inter", "DM Sans", "Plus Jakarta Sans", "Manrope", "Outfit",
    "Sora", "Space Grotesk", "Work Sans", "Figtree", "Onest", "IBM Plex Sans",
    "Albert Sans", "Be Vietnam Pro", "Hanken Grotesk", "Public Sans",
    "Nunito", "Nunito Sans", "Raleway", "Roboto", "Lato", "Open Sans",
    "Instrument Serif", "Lora", "EB Garamond", "Crimson Pro",
  ];

  const MAX_WIDTHS: { label: string; value: string }[] = [
    { label: "Étroit (800px)", value: "800px" },
    { label: "Normal (1200px)", value: "1200px" },
    { label: "Large (1440px)", value: "1440px" },
    { label: "Plein (100%)", value: "100%" },
  ];

  const variableKeys = Object.keys(state.variableContext ?? {});

  return (
    <div>
      {/* Identité (read-only summary) */}
      <SkinSection label="Identité" defaultOpen>
        <div className="field">
          <div className="field-label"><span>Nom du site</span></div>
          <input className="input" value={state.siteName} readOnly />
        </div>
        {state.menus && (
          <div className="field">
            <div className="field-label"><span>Menus</span><span className="hint">{(state.menus.nav?.length ?? 0)} entrées</span></div>
            <div style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.45 }}>
              Géré depuis le panneau Menus (ouvrir via l&apos;en-tête).
            </div>
          </div>
        )}
      </SkinSection>

      {/* Couleurs */}
      <SkinSection label="Couleurs" defaultOpen>
        <div className="field">
          <div className="field-label"><span>Palette</span><span className="hint">cliquer pour éditer</span></div>
          <div className="swatches">
            {COLOR_SWATCHES.map((c) => (
              <button
                key={c.key}
                title={`${c.label} · ${guide.colors[c.key]}`}
                onClick={() => dispatch({ type: "SET_WORKSPACE", payload: "style-guide" })}
                className="swatch"
                style={{ background: guide.colors[c.key], appearance: "none", cursor: "default" }}
              />
            ))}
            <button
              onClick={() => dispatch({ type: "SET_WORKSPACE", payload: "style-guide" })}
              className="swatch add"
              title="Ouvrir le Style Guide pour éditer"
              style={{ appearance: "none", cursor: "default" }}
            >
              +
            </button>
          </div>
        </div>
      </SkinSection>

      {/* Typographie */}
      <SkinSection label="Typographie" defaultOpen>
        <div className="field">
          <div className="field-label"><span>Titres</span></div>
          <select
            className="select"
            value={guide.fonts.heading}
            onChange={(e) => updateFont("heading", e.target.value)}
          >
            {[...new Set([guide.fonts.heading, ...FONT_OPTIONS_HEAD])].map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <div className="field-label"><span>Corps</span></div>
          <select
            className="select"
            value={guide.fonts.body}
            onChange={(e) => updateFont("body", e.target.value)}
          >
            {[...new Set([guide.fonts.body, ...FONT_OPTIONS_BODY])].map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <div className="field-label"><span>Échelle</span><span className="hint">×{guide.fonts.scale ?? 1.25}</span></div>
          <input
            className="input mono"
            value={String(guide.fonts.scale ?? 1.25)}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (!isNaN(n)) dispatch({ type: "UPDATE_STYLE_GUIDE", payload: { fonts: { ...guide.fonts, scale: n } } });
            }}
          />
        </div>
      </SkinSection>

      {/* Espacement */}
      <SkinSection label="Espacement">
        <div className="range-row">
          <label>Padding</label>
          <input
            type="range" min={40} max={160}
            value={parseInt(guide.spacing.sectionPadding)}
            onChange={(e) => updateSpacing("sectionPadding", `${e.target.value}px`)}
          />
          <span className="val">{guide.spacing.sectionPadding}</span>
        </div>
        <div className="range-row">
          <label>Gap</label>
          <input
            type="range" min={8} max={64}
            value={parseInt(guide.spacing.elementGap)}
            onChange={(e) => updateSpacing("elementGap", `${e.target.value}px`)}
          />
          <span className="val">{guide.spacing.elementGap}</span>
        </div>
        <div className="field">
          <div className="field-label"><span>Largeur max</span></div>
          <select
            className="select"
            value={guide.spacing.maxContentWidth}
            onChange={(e) => updateSpacing("maxContentWidth", e.target.value)}
          >
            {MAX_WIDTHS.map((w) => (
              <option key={w.value} value={w.value}>{w.label}</option>
            ))}
          </select>
        </div>
      </SkinSection>

      {/* Animations par défaut */}
      <SkinSection label="Animations par défaut">
        <div style={{ fontSize: 10.5, color: "var(--text-3)", marginBottom: 8, lineHeight: 1.45 }}>
          Appliqué à chaque section qui n&apos;a pas d&apos;animation personnalisée.
        </div>
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
      </SkinSection>

      {/* Variables */}
      <SkinSection label="Variables">
        {variableKeys.length === 0 ? (
          <div style={{ fontSize: 11, color: "var(--text-4)", lineHeight: 1.45 }}>
            Aucune entreprise liée. Liez une entreprise depuis la topbar pour injecter ville, téléphone, avis Google, etc.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {variableKeys.slice(0, 8).map((k) => (
              <div key={k} className="page-pill">
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-3)" }}>{`{{ ${k} }}`}</span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "right" }}>{String(state.variableContext[k]).slice(0, 30)}</span>
              </div>
            ))}
            {variableKeys.length > 8 && (
              <div style={{ fontSize: 10.5, color: "var(--text-4)" }}>+ {variableKeys.length - 8} autres variables</div>
            )}
          </div>
        )}
      </SkinSection>

      {/* AI tip */}
      <div style={{ padding: "10px 14px", background: "var(--magic-tint)", borderTop: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
          <Sparkles size={12} style={{ color: "var(--magic)", flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 10.5, color: "var(--magic)", margin: 0, lineHeight: 1.45 }}>
            Sélectionnez une section pour modifier son contenu et son style.
          </p>
        </div>
      </div>
    </div>
  );
}

// Skin-styled accordion section (reusable inside DesignWorkspace panels)
function SkinSection({ label, defaultOpen = false, children }: { label: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="section">
      <button
        type="button"
        aria-expanded={open ? "true" : "false"}
        onClick={() => setOpen((o) => !o)}
        className="section-hd"
        style={{ width: "100%", appearance: "none", border: 0, background: "transparent", textAlign: "left" }}
      >
        <ChevronDown size={11} className="chev" style={{ color: "var(--text-4)" }} />
        <span>{label}</span>
      </button>
      {open && <div className="section-body">{children}</div>}
    </div>
  );
}

// ─── Mode B: Section properties panel ────────────────────────────────────────

function SectionPanel({
  instance,
  sectionDefs,
  onRegenerateSection,
  focusedField,
  onClearFocusedField,
  onReplace,
}: {
  instance: SiteSectionInstance;
  sectionDefs: Record<string, SiteSectionDef>;
  onRegenerateSection?: (instanceId: string, prompt: string, model: string) => Promise<void>;
  focusedField?: string | null;
  onClearFocusedField?: () => void;
  onReplace?: () => void;
}) {
  const { state, dispatch } = useRelumeBuilder();
  void focusedField; void onClearFocusedField;
  const availableTags = useServiceTags();
  const activeTags = React.useMemo(() => {
    try {
      const parsed = JSON.parse(state.variableContext.__service_tags ?? "[]");
      return Array.isArray(parsed) ? parsed.filter((t: unknown): t is string => typeof t === "string") : [];
    } catch { return []; }
  }, [state.variableContext.__service_tags]);

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

  // Pre-split fields so we know whether to show the content / appearance accordions
  const splitFields = schema ? splitSchemaFields(schema) : { contentFields: [], styleFields: [], layoutFields: [] };
  const filteredStyleFields = (splitFields.styleFields ?? []).filter(
    (f) => !("id" in f) || (f.id !== "__color_scheme" && f.id !== "__padding_y"),
  );
  const allStyleFields = [...filteredStyleFields, ...(splitFields.layoutFields ?? [])];
  const hasBlocks = !!schema?.blocks && schema.blocks.length > 0;
  const isNavbar = !!sectionDef?.category && NAVBAR_CATEGORIES.has(sectionDef.category);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Quick actions row */}
      <div style={{ display: "flex", gap: 2, alignItems: "center", padding: "6px 10px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <button
          onClick={() => dispatch({ type: "TOGGLE_INSTANCE_VISIBILITY", payload: instance.id })}
          className="btn ghost sm"
          title={instance.is_hidden ? "Afficher" : "Masquer"}
        >
          {instance.is_hidden ? <EyeOff size={11} /> : <Eye size={11} />}
        </button>
        <button onClick={moveUp} disabled={idx <= 0} className="btn ghost sm icon" title="Monter">
          <ChevronUp size={11} />
        </button>
        <button onClick={moveDown} disabled={idx >= ids.length - 1} className="btn ghost sm icon" title="Descendre">
          <ChevronDown size={11} />
        </button>
        {onReplace && (
          <button onClick={onReplace} className="btn ghost sm" title="Remplacer la section">
            <Repeat size={11} />Changer
          </button>
        )}
        <span style={{ flex: 1 }} />
        <button
          onClick={() => dispatch({ type: "REMOVE_INSTANCE", payload: instance.id })}
          className="btn ghost sm icon"
          style={{ color: "var(--danger)" }}
          title="Supprimer la section"
        >
          <Trash2 size={11} />
        </button>
      </div>

      <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
        {/* AI box, always visible at top */}
        {onRegenerateSection && (
          <AIRegenerateSection instanceId={instance.id} onRegenerate={onRegenerateSection} />
        )}

        {/* Click-to-edit hint */}
        <div style={{ margin: "0 14px 8px", display: "flex", gap: 6, alignItems: "flex-start", padding: "6px 8px", background: "var(--info-tint)", border: "1px solid rgba(42,111,219,.22)", borderRadius: 6 }}>
          <MousePointer size={11} style={{ color: "var(--info)", flexShrink: 0, marginTop: 2 }} />
          <span style={{ fontSize: 10.5, color: "#0d4a98", lineHeight: 1.45 }}>
            Cliquez sur un titre, image ou bouton dans le canvas pour l&apos;éditer directement.
          </span>
        </div>

        {/* Presets */}
        {schema?.presets && schema.presets.length > 0 && (
          <div style={{ padding: "0 14px 12px" }}>
            <PresetsPicker presets={schema.presets} onApply={applyPreset} />
          </div>
        )}

        {/* Contenu */}
        {splitFields.contentFields.length > 0 && (
          <SkinSection label="Contenu" defaultOpen>
            <SchemaEditor
              schema={{ name: "content", settings: splitFields.contentFields }}
              content={instance.content}
              onUpdate={updateContent}
              styleGuide={state.styleGuide}
              variables={state.variableContext}
              siteId={state.siteId}
            />
          </SkinSection>
        )}

        {/* Blocs (boutons, items, etc.) */}
        {hasBlocks && sectionDef?.is_tag_adaptive && (
          <SkinSection label="Services" defaultOpen>
            <p style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.5, margin: 0 }}>
              Section adaptative : le contenu de chaque service se modifie dans l&apos;onglet{" "}
              <strong>Contenu</strong>. Un élément est généré automatiquement par service de
              l&apos;entreprise.
            </p>
          </SkinSection>
        )}
        {hasBlocks && !sectionDef?.is_tag_adaptive && (
          <SkinSection label="Blocs &amp; boutons" defaultOpen>
            <BlocksEditor
              schema={schema!}
              blocks={instance.blocks ?? []}
              styleGuide={state.styleGuide}
              onAdd={(blockType, settings) => dispatch({ type: "ADD_BLOCK", payload: { instanceId: instance.id, blockType, settings } })}
              onUpdate={(blockId, settings) => dispatch({ type: "UPDATE_BLOCK", payload: { instanceId: instance.id, blockId, settings } })}
              onRemove={(blockId) => dispatch({ type: "REMOVE_BLOCK", payload: { instanceId: instance.id, blockId } })}
              onDuplicate={(blockId) => dispatch({ type: "DUPLICATE_BLOCK", payload: { instanceId: instance.id, blockId } })}
              onReorder={(fromIndex, toIndex) => dispatch({ type: "REORDER_BLOCKS", payload: { instanceId: instance.id, fromIndex, toIndex } })}
              onUpdateTag={(blockId, service_tag) => dispatch({ type: "UPDATE_BLOCK_TAG", payload: { instanceId: instance.id, blockId, service_tag } })}
              availableTags={availableTags}
              activeTags={activeTags}
              variables={state.variableContext}
              siteId={state.siteId}
            />
          </SkinSection>
        )}

        {/* Apparence */}
        <SkinSection label="Apparence" defaultOpen>
          {isNavbar && (
            <div className="field">
              <NavbarPositionPanel instance={instance} updateContent={updateContent} />
            </div>
          )}
          <div className="field">
            <div className="field-label"><span>Palette de couleurs</span></div>
            <ColorSchemeField
              setting={{ type: "color_scheme", id: "__color_scheme", label: "Palette" }}
              value={(instance.content.__color_scheme as string) ?? "default"}
              onChange={(preset: ColorSchemePreset) => updateContent("__color_scheme", preset)}
              styleGuide={state.styleGuide}
            />
          </div>
          <div className="field">
            <div className="field-label"><span>Hauteur</span></div>
            <UniversalHeightControls instance={instance} onUpdate={updateContent} />
          </div>
          <div className="field">
            <div className="field-label"><span>Espacement</span></div>
            <UniversalSpacingControls instance={instance} onUpdate={updateContent} />
          </div>
          {allStyleFields.length > 0 && (
            <SchemaEditor
              schema={{ name: "style", settings: allStyleFields }}
              content={instance.content}
              onUpdate={updateContent}
              styleGuide={state.styleGuide}
              variables={state.variableContext}
              siteId={state.siteId}
            />
          )}
          <SectionColorOverrides instance={instance} />
        </SkinSection>

        {/* Animation */}
        <SkinSection label="Animation">
          <AnimationFieldEditor
            type={(instance.content.__animation_type as SectionAnimation) ?? "none"}
            duration={(instance.content.__animation_duration as number) ?? 600}
            delay={(instance.content.__animation_delay as number) ?? 0}
            easing={(instance.content.__animation_easing as string) ?? "ease-out"}
            onUpdate={({ type, duration, delay, easing }) => {
              updateContent("__animation_type", type);
              updateContent("__animation_duration", duration);
              updateContent("__animation_delay", delay);
              updateContent("__animation_easing", easing);
            }}
          />
        </SkinSection>

        {/* CSS avancé */}
        <SkinSection label="CSS avancé">
          <CustomStyleEditor instance={instance} />
        </SkinSection>
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
  compact = false,
}: {
  instanceId: string;
  onRegenerate: (id: string, prompt: string, model: string) => Promise<void>;
  compact?: boolean;
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
    <div className="ai-box" style={compact ? { margin: 0 } : { margin: "12px 14px" }}>
      <div className="ai-box-hd">
        <Sparkles size={12} />
        <span>Régénérer cette section</span>
        <span className="pill magic" style={{ marginLeft: "auto" }}>
          {selectedModel.replace(/-/g, " ").replace(/claude /, "Claude ").slice(0, 18)}
        </span>
      </div>
      <div style={{ padding: "8px 10px 0", display: "flex", flexDirection: "column", gap: 6 }}>
        <ModelDropdown value={selectedModel} onChange={setSelectedModel} />
        <VariableTextarea
          value={prompt}
          onChange={setPrompt}
          placeholder="Ex: plus orienté urgence : insister sur la disponibilité 7j/7…"
          rows={3}
          className="textarea"
          variables={state.variableContext}
          variant="light"
        />
      </div>
      <div className="ai-box-ft">
        <span style={{ fontSize: 10.5, color: "var(--text-3)", flex: 1 }}>
          Conserve les variables {"{{ ville }}"}, {"{{ tel }}"}.
        </span>
        <button
          onClick={handleRegenerate}
          disabled={loading || !prompt.trim()}
          className="btn magic xs"
        >
          {loading ? <RefreshCw size={11} className="animate-spin" /> : <Sparkles size={11} />}
          {loading ? "…" : "Générer"}
        </button>
      </div>
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

// ─── Navbar Position Panel ────────────────────────────────────────────────────

function NavbarPositionPanel({
  instance,
  updateContent,
}: {
  instance: SiteSectionInstance;
  updateContent: (key: string, value: unknown) => void;
}) {
  const layout = resolveNavbarLayout(instance.content);
  const setLayout = (patch: Partial<typeof layout>) => {
    updateContent("__layout", { ...layout, ...patch });
  };
  const reset = () => updateContent("__layout", DEFAULT_NAVBAR_LAYOUT);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Position</label>
        <button
          onClick={reset}
          className="text-[10px] text-gray-400 hover:text-gray-700 transition-colors"
          title="Réinitialiser"
        >
          Reset
        </button>
      </div>
      <div className="space-y-2.5 bg-gray-50 border border-gray-200 rounded-lg p-3">
        <label className="block">
          <span className="text-[11px] text-gray-600 mb-1 block">Comportement</span>
          <select
            value={layout.position}
            onChange={(e) => setLayout({ position: e.target.value as NavbarPosition })}
            className="w-full bg-white border border-gray-200 rounded px-2 py-1.5 text-xs text-gray-800 focus:outline-none focus:border-blue-400"
          >
            <option value="static">Static (défile avec la page)</option>
            <option value="sticky">Sticky (colle en haut au scroll)</option>
            <option value="fixed">Fixed (toujours en haut)</option>
          </select>
        </label>

        <label className="block">
          <span className="text-[11px] text-gray-600 mb-1 block">Décalage haut (px)</span>
          <input
            type="number"
            value={layout.topOffset}
            onChange={(e) => setLayout({ topOffset: Number(e.target.value) || 0 })}
            disabled={layout.position === "static"}
            className="w-full bg-white border border-gray-200 rounded px-2 py-1.5 text-xs text-gray-800 focus:outline-none focus:border-blue-400 disabled:opacity-40"
          />
        </label>

        <label className="flex items-center justify-between cursor-pointer">
          <span className="text-[11px] text-gray-600">Headroom (cacher au scroll)</span>
          <input
            type="checkbox"
            checked={layout.headroom}
            onChange={(e) => setLayout({ headroom: e.target.checked })}
            disabled={layout.position === "static"}
            className="accent-blue-500 disabled:opacity-40"
          />
        </label>

        <label className="flex items-start justify-between gap-2 cursor-pointer">
          <span className="flex-1">
            <span className="text-[11px] text-gray-600 block">Survoler la première section</span>
            <span className="text-[10px] text-gray-400 block leading-snug">La navbar flotte au-dessus du Hero (pas d&apos;espace réservé).</span>
          </span>
          <input
            type="checkbox"
            checked={layout.overlay}
            onChange={(e) => setLayout({ overlay: e.target.checked })}
            disabled={layout.position === "static"}
            className="accent-blue-500 disabled:opacity-40 mt-0.5"
          />
        </label>

        <p className="text-[10px] text-gray-400 leading-relaxed">
          Visible sur le site déployé. L&apos;éditeur affiche la navbar à plat pour faciliter l&apos;édition.
        </p>
      </div>
    </div>
  );
}
