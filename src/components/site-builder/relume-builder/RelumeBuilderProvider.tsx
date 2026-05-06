"use client";

import React from "react";
import type {
  RelumeBuilderState,
  RelumeBuilderAction,
  RelumeHistoryEntry,
  SiteSectionInstance,
  SitemapPage,
  StyleGuide,
  WorkspaceId,
} from "@/types";
import { DEFAULT_STYLE_GUIDE } from "@/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function nanoid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function buildInstancesByPage(instances: Record<string, SiteSectionInstance>): Record<string, string[]> {
  const byPage: Record<string, string[]> = {};
  for (const inst of Object.values(instances)) {
    if (!byPage[inst.page_slug]) byPage[inst.page_slug] = [];
    byPage[inst.page_slug].push(inst.id);
  }
  // sort by sort_order
  for (const slug of Object.keys(byPage)) {
    byPage[slug].sort((a, b) => (instances[a]?.sort_order ?? 0) - (instances[b]?.sort_order ?? 0));
  }
  return byPage;
}

function takeSnapshot(state: RelumeBuilderState): RelumeHistoryEntry {
  return {
    instances: { ...state.instances },
    instancesByPage: { ...state.instancesByPage },
    styleGuide: { ...state.styleGuide },
    sitemap: [...state.sitemap],
  };
}

const MAX_HISTORY = 50;

// ─── Reducer ──────────────────────────────────────────────────────────────────

function reducer(state: RelumeBuilderState, action: RelumeBuilderAction): RelumeBuilderState {
  switch (action.type) {
    case "LOAD": {
      const instancesMap: Record<string, SiteSectionInstance> = {};
      for (const inst of action.payload.instances) {
        instancesMap[inst.id] = inst;
      }
      const byPage = buildInstancesByPage(instancesMap);
      const firstPage = action.payload.sitemap[0]?.slug ?? "/";
      // Merge loaded style guide with defaults to handle missing fields from old data
      const safeStyleGuide = mergeDeep(DEFAULT_STYLE_GUIDE, action.payload.styleGuide) as StyleGuide;
      return {
        ...state,
        styleGuide: safeStyleGuide,
        sitemap: action.payload.sitemap,
        instances: instancesMap,
        instancesByPage: byPage,
        activePage: firstPage,
        selectedInstanceId: null,
        selectedSnippetId: null,
        isDirty: false,
        history: [],
        historyIndex: -1,
      };
    }

    case "SET_ACTIVE_PAGE":
      return { ...state, activePage: action.payload, selectedInstanceId: null, selectedSnippetId: null };

    case "SET_DEVICE_VIEW":
      return { ...state, deviceView: action.payload };

    case "SET_WORKSPACE":
      return { ...state, activeWorkspace: action.payload as WorkspaceId };

    case "SELECT_INSTANCE":
      return { ...state, selectedInstanceId: action.payload, selectedSnippetId: null };

    case "SELECT_SNIPPET":
      return { ...state, selectedSnippetId: action.payload };

    case "ADD_INSTANCE": {
      const snapshot = takeSnapshot(state);
      const { instance, pageSlug, index } = action.payload;
      const currentIds = state.instancesByPage[pageSlug] ?? [];
      const insertAt = index !== undefined ? index : currentIds.length;
      const newIds = [...currentIds];
      newIds.splice(insertAt, 0, instance.id);

      // Update sort_orders
      const newInstances = { ...state.instances };
      newInstances[instance.id] = { ...instance, page_slug: pageSlug, sort_order: insertAt };
      for (let i = 0; i < newIds.length; i++) {
        newInstances[newIds[i]] = { ...newInstances[newIds[i]], sort_order: i };
      }

      return {
        ...state,
        instances: newInstances,
        instancesByPage: { ...state.instancesByPage, [pageSlug]: newIds },
        selectedInstanceId: instance.id,
        isDirty: true,
        history: [...state.history.slice(0, state.historyIndex + 1), snapshot].slice(-MAX_HISTORY),
        historyIndex: Math.min(state.historyIndex + 1, MAX_HISTORY - 1),
      };
    }

    case "REMOVE_INSTANCE": {
      const snapshot = takeSnapshot(state);
      const inst = state.instances[action.payload];
      if (!inst) return state;
      const pageSlug = inst.page_slug;
      const newIds = (state.instancesByPage[pageSlug] ?? []).filter((id) => id !== action.payload);
      const newInstances = { ...state.instances };
      delete newInstances[action.payload];

      return {
        ...state,
        instances: newInstances,
        instancesByPage: { ...state.instancesByPage, [pageSlug]: newIds },
        selectedInstanceId: state.selectedInstanceId === action.payload ? null : state.selectedInstanceId,
        isDirty: true,
        history: [...state.history.slice(0, state.historyIndex + 1), snapshot].slice(-MAX_HISTORY),
        historyIndex: Math.min(state.historyIndex + 1, MAX_HISTORY - 1),
      };
    }

    case "UPDATE_INSTANCE_CONTENT": {
      const snapshot = takeSnapshot(state);
      const inst = state.instances[action.payload.id];
      if (!inst) return state;
      return {
        ...state,
        instances: {
          ...state.instances,
          [action.payload.id]: { ...inst, content: { ...inst.content, ...action.payload.content } },
        },
        isDirty: true,
        history: [...state.history.slice(0, state.historyIndex + 1), snapshot].slice(-MAX_HISTORY),
        historyIndex: Math.min(state.historyIndex + 1, MAX_HISTORY - 1),
      };
    }

    case "UPDATE_INSTANCE_STYLE": {
      const inst = state.instances[action.payload.id];
      if (!inst) return state;
      return {
        ...state,
        instances: {
          ...state.instances,
          [action.payload.id]: { ...inst, custom_style: { ...inst.custom_style, ...action.payload.style } },
        },
        isDirty: true,
      };
    }

    case "REORDER_INSTANCES": {
      const snapshot = takeSnapshot(state);
      const { pageSlug, fromIndex, toIndex } = action.payload;
      const ids = [...(state.instancesByPage[pageSlug] ?? [])];
      const [moved] = ids.splice(fromIndex, 1);
      ids.splice(toIndex, 0, moved);
      const newInstances = { ...state.instances };
      ids.forEach((id, i) => { newInstances[id] = { ...newInstances[id], sort_order: i }; });
      return {
        ...state,
        instances: newInstances,
        instancesByPage: { ...state.instancesByPage, [pageSlug]: ids },
        isDirty: true,
        history: [...state.history.slice(0, state.historyIndex + 1), snapshot].slice(-MAX_HISTORY),
        historyIndex: Math.min(state.historyIndex + 1, MAX_HISTORY - 1),
      };
    }

    case "TOGGLE_INSTANCE_VISIBILITY": {
      const inst = state.instances[action.payload];
      if (!inst) return state;
      return {
        ...state,
        instances: {
          ...state.instances,
          [action.payload]: { ...inst, is_hidden: !inst.is_hidden },
        },
        isDirty: true,
      };
    }

    case "UPDATE_STYLE_GUIDE": {
      const snapshot = takeSnapshot(state);
      const newGuide = mergeDeep(state.styleGuide, action.payload) as StyleGuide;
      return {
        ...state,
        styleGuide: newGuide,
        isDirty: true,
        history: [...state.history.slice(0, state.historyIndex + 1), snapshot].slice(-MAX_HISTORY),
        historyIndex: Math.min(state.historyIndex + 1, MAX_HISTORY - 1),
      };
    }

    case "ADD_PAGE": {
      return {
        ...state,
        sitemap: [...state.sitemap, action.payload],
        activePage: action.payload.slug,
        isDirty: true,
      };
    }

    case "DUPLICATE_PAGE": {
      const snapshot = takeSnapshot(state);
      const srcPage = state.sitemap.find((p) => p.id === action.payload);
      if (!srcPage) return state;
      const newId = nanoid();
      const newSlug = srcPage.slug === "/" ? `/copy-${newId.slice(0, 6)}` : `${srcPage.slug}-copy`;
      const newPage = { ...srcPage, id: newId, slug: newSlug, title: `${srcPage.title} (copie)` };
      const srcInstances = state.instancesByPage[srcPage.slug] ?? [];
      const newInstances = { ...state.instances };
      const newIds: string[] = [];
      for (const instId of srcInstances) {
        const src = state.instances[instId];
        if (!src) continue;
        const newInstId = nanoid();
        newInstances[newInstId] = { ...src, id: newInstId, page_slug: newSlug };
        newIds.push(newInstId);
      }
      return {
        ...state,
        sitemap: [...state.sitemap, newPage],
        instances: newInstances,
        instancesByPage: { ...state.instancesByPage, [newSlug]: newIds },
        activePage: newSlug,
        isDirty: true,
        history: [...state.history.slice(0, state.historyIndex + 1), snapshot].slice(-MAX_HISTORY),
        historyIndex: Math.min(state.historyIndex + 1, MAX_HISTORY - 1),
      };
    }

    case "REMOVE_PAGE": {
      const newSitemap = state.sitemap.filter((p) => p.id !== action.payload);
      const removedPage = state.sitemap.find((p) => p.id === action.payload);
      const newInstances = { ...state.instances };
      const newByPage = { ...state.instancesByPage };
      if (removedPage) {
        for (const id of newByPage[removedPage.slug] ?? []) {
          delete newInstances[id];
        }
        delete newByPage[removedPage.slug];
      }
      return {
        ...state,
        sitemap: newSitemap,
        instances: newInstances,
        instancesByPage: newByPage,
        activePage: newSitemap[0]?.slug ?? "/",
        isDirty: true,
      };
    }

    case "UPDATE_PAGE": {
      return {
        ...state,
        sitemap: state.sitemap.map((p) =>
          p.id === action.payload.id ? { ...p, ...action.payload.data } : p
        ),
        isDirty: true,
      };
    }

    case "TOGGLE_AI_PANEL":
      return { ...state, aiPanelOpen: !state.aiPanelOpen, stylePanelOpen: false };

    case "TOGGLE_STYLE_PANEL":
      return { ...state, stylePanelOpen: !state.stylePanelOpen, aiPanelOpen: false };

    case "TOGGLE_LIBRARY":
      return { ...state, libraryOpen: !state.libraryOpen };

    case "UNDO": {
      if (state.historyIndex < 0) return state;
      const entry = state.history[state.historyIndex];
      if (!entry) return state;
      return {
        ...state,
        instances: entry.instances,
        instancesByPage: entry.instancesByPage,
        styleGuide: entry.styleGuide,
        sitemap: entry.sitemap,
        historyIndex: state.historyIndex - 1,
        isDirty: true,
      };
    }

    case "REDO": {
      if (state.historyIndex >= state.history.length - 1) return state;
      const entry = state.history[state.historyIndex + 1];
      if (!entry) return state;
      return {
        ...state,
        instances: entry.instances,
        instancesByPage: entry.instancesByPage,
        styleGuide: entry.styleGuide,
        sitemap: entry.sitemap,
        historyIndex: state.historyIndex + 1,
        isDirty: true,
      };
    }

    case "MARK_SAVED":
      return { ...state, isDirty: false };

    default:
      return state;
  }
}

function mergeDeep<T>(target: T, source: Partial<T>): T {
  if (typeof target !== "object" || target === null) return source as T;
  const out = { ...target } as Record<string, unknown>;
  const src = source as Record<string, unknown>;
  const tgt = target as Record<string, unknown>;
  for (const key of Object.keys(src)) {
    const sv = src[key];
    const tv = tgt[key];
    if (sv !== null && typeof sv === "object" && !Array.isArray(sv) && typeof tv === "object" && tv !== null) {
      out[key] = mergeDeep(tv as Record<string, unknown>, sv as Partial<Record<string, unknown>>);
    } else if (sv !== undefined) {
      out[key] = sv;
    }
  }
  return out as T;
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface RelumeBuilderContextValue {
  state: RelumeBuilderState;
  dispatch: React.Dispatch<RelumeBuilderAction>;
}

const RelumeBuilderContext = React.createContext<RelumeBuilderContextValue | null>(null);

export function useRelumeBuilder() {
  const ctx = React.useContext(RelumeBuilderContext);
  if (!ctx) throw new Error("useRelumeBuilder must be used within RelumeBuilderProvider");
  return ctx;
}

// ─── Provider ────────────────────────────────────────────────────────────────

const initialState: RelumeBuilderState = {
  siteId: "",
  siteName: "",
  styleGuide: DEFAULT_STYLE_GUIDE,
  sitemap: [{ id: "page-home", slug: "/", title: "Accueil" }],
  instances: {},
  instancesByPage: {},
  activePage: "/",
  selectedInstanceId: null,
  selectedSnippetId: null,
  deviceView: "desktop",
  activeWorkspace: "sitemap",
  aiPanelOpen: false,
  stylePanelOpen: false,
  libraryOpen: true,
  isDirty: false,
  history: [],
  historyIndex: -1,
};

interface RelumeBuilderProviderProps {
  siteId: string;
  siteName: string;
  children: React.ReactNode;
}

export function RelumeBuilderProvider({ siteId, siteName, children }: RelumeBuilderProviderProps) {
  const [state, dispatch] = React.useReducer(reducer, {
    ...initialState,
    siteId,
    siteName,
  });

  return (
    <RelumeBuilderContext.Provider value={{ state, dispatch }}>
      {children}
    </RelumeBuilderContext.Provider>
  );
}

export { nanoid };
