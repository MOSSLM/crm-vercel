"use client";

import React from "react";
import type {
  RelumeBuilderState,
  RelumeBuilderAction,
  RelumeHistoryEntry,
  SiteSectionInstance,
  SitemapPage,
  SiteMenus,
  SiteMenuItem,
  StyleGuide,
  WorkspaceId,
} from "@/types";
import { DEFAULT_STYLE_GUIDE } from "@/types";
import { normalizePageSlug, buildSitemapTree, type SitemapTreeNode } from "@/lib/site-builder/sitemap-tree";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DEFAULT_MENUS: SiteMenus = { nav: [], footer: [], footerLegal: [] };

/** Build default nav menus from sitemap pages */
function buildMenusFromSitemap(sitemap: SitemapPage[], existing: SiteMenus): SiteMenus {
  // Auto nav mirrors the slug hierarchy: nested pages become sub-items.
  const toNavItem = (node: SitemapTreeNode): SiteMenuItem => ({
    id: node.page.id,
    label: node.page.title,
    url: node.page.slug,
    ...(node.children.length > 0 ? { children: node.children.map(toNavItem) } : {}),
  });
  const navItems: SiteMenuItem[] = buildSitemapTree(sitemap).map(toNavItem);
  // Only auto-populate if nav is empty
  const nav = existing.nav.length === 0 ? navItems : existing.nav;
  const footerLegal = existing.footerLegal.length === 0
    ? [
        { id: "legal-privacy", label: "Politique de confidentialité", url: "/confidentialite" },
        { id: "legal-terms", label: "Mentions légales", url: "/mentions-legales" },
      ]
    : existing.footerLegal;
  const footer = existing.footer.length === 0
    ? buildSitemapTree(sitemap)
        .slice(0, 5)
        .map((node) => ({ id: `footer-${node.page.id}`, label: node.page.title, url: node.page.slug }))
    : existing.footer;
  return { nav, footer, footerLegal };
}

function nanoid() {
  return crypto.randomUUID();
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

function takeSnapshot(state: RelumeBuilderState, tag?: string): RelumeHistoryEntry {
  return {
    instances: { ...state.instances },
    instancesByPage: { ...state.instancesByPage },
    styleGuide: { ...state.styleGuide },
    sitemap: [...state.sitemap],
    _tag: tag,
  };
}

/** Push a snapshot onto the history stack, coalescing if the last entry shares the same tag. */
function pushHistory(state: RelumeBuilderState, snapshot: RelumeHistoryEntry): Pick<RelumeBuilderState, 'history' | 'historyIndex'> {
  const base = state.history.slice(0, state.historyIndex + 1);
  const last = base[base.length - 1];
  // Coalesce: if the incoming entry has a tag that matches the last entry's tag, replace it.
  const stack = (snapshot._tag && last?._tag === snapshot._tag)
    ? [...base.slice(0, -1), snapshot]
    : [...base, snapshot];
  const trimmed = stack.slice(-MAX_HISTORY);
  return {
    history: trimmed,
    historyIndex: trimmed.length - 1,
  };
}

const MAX_HISTORY = 50;

// ─── Reducer ──────────────────────────────────────────────────────────────────

function reducer(state: RelumeBuilderState, action: RelumeBuilderAction): RelumeBuilderState {
  switch (action.type) {
    case "LOAD": {
      const instancesMap: Record<string, SiteSectionInstance> = {};
      for (const inst of action.payload.instances) {
        instancesMap[inst.id] = { ...inst, blocks: Array.isArray(inst.blocks) ? inst.blocks : [] };
      }
      const byPage = buildInstancesByPage(instancesMap);
      const firstPage = action.payload.sitemap[0]?.slug ?? "/";
      const safeStyleGuide = mergeDeep(DEFAULT_STYLE_GUIDE, action.payload.styleGuide) as StyleGuide;
      const rawMenus = action.payload.menus ?? DEFAULT_MENUS;
      const menus = buildMenusFromSitemap(action.payload.sitemap, rawMenus);
      return {
        ...state,
        styleGuide: safeStyleGuide,
        sitemap: action.payload.sitemap,
        menus,
        instances: instancesMap,
        instancesByPage: byPage,
        activePage: firstPage,
        selectedInstanceId: null,
        selectedSnippetId: null,
        faviconUrl: action.payload.faviconUrl ?? state.faviconUrl ?? null,
        seo: action.payload.seo ?? state.seo ?? {},
        isDirty: action.payload.isDirty ?? false,
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

      // Update sort_orders + ensure blocks is always an array
      const newInstances = { ...state.instances };
      newInstances[instance.id] = {
        ...instance,
        blocks: Array.isArray(instance.blocks) ? instance.blocks : [],
        page_slug: pageSlug,
        sort_order: insertAt,
      };
      for (let i = 0; i < newIds.length; i++) {
        newInstances[newIds[i]] = { ...newInstances[newIds[i]], sort_order: i };
      }

      return {
        ...state,
        instances: newInstances,
        instancesByPage: { ...state.instancesByPage, [pageSlug]: newIds },
        selectedInstanceId: instance.id,
        isDirty: true,
        ...pushHistory(state, snapshot),
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
        ...pushHistory(state, snapshot),
      };
    }

    case "REPLACE_INSTANCE": {
      const { instanceId, sectionDef } = action.payload;
      const inst = state.instances[instanceId];
      if (!inst || !sectionDef) return state;
      const snapshot = takeSnapshot(state);
      const baseContent: Record<string, unknown> = { ...(sectionDef.default_content as Record<string, unknown>) };
      const isLibrary = !!(sectionDef.theme_slug && sectionDef.theme_section_id);
      if (isLibrary) {
        baseContent.__library = {
          theme_slug: sectionDef.theme_slug!,
          section_id: sectionDef.theme_section_id!,
        };
      }
      return {
        ...state,
        instances: {
          ...state.instances,
          [instanceId]: {
            ...inst,
            section_def: sectionDef,
            section_id: isLibrary ? null : (sectionDef.id ?? null),
            content: baseContent,
            blocks: [],
          },
        },
        previewReplace: null,
        isDirty: true,
        ...pushHistory(state, snapshot),
      };
    }

    case "SET_PREVIEW_REPLACE": {
      return { ...state, previewReplace: action.payload };
    }

    case "UPDATE_INSTANCE_CONTENT": {
      const snapshot = takeSnapshot(state, `content:${action.payload.id}`);
      const inst = state.instances[action.payload.id];
      if (!inst) return state;
      return {
        ...state,
        instances: {
          ...state.instances,
          [action.payload.id]: { ...inst, content: { ...inst.content, ...action.payload.content } },
        },
        isDirty: true,
        ...pushHistory(state, snapshot),
      };
    }

    case "UPDATE_INSTANCE_STYLE": {
      const inst = state.instances[action.payload.id];
      if (!inst) return state;
      const snapshot = takeSnapshot(state, `style:${action.payload.id}`);
      return {
        ...state,
        instances: {
          ...state.instances,
          [action.payload.id]: { ...inst, custom_style: { ...inst.custom_style, ...action.payload.style } },
        },
        isDirty: true,
        ...pushHistory(state, snapshot),
      };
    }

    case "ADD_BLOCK": {
      const snapshot = takeSnapshot(state);
      const inst = state.instances[action.payload.instanceId];
      if (!inst) return state;
      const newBlock = {
        id: nanoid(),
        type: action.payload.blockType,
        settings: action.payload.settings ?? {},
      };
      const blocks = [...inst.blocks];
      const at = action.payload.index ?? blocks.length;
      blocks.splice(at, 0, newBlock);
      return {
        ...state,
        instances: { ...state.instances, [inst.id]: { ...inst, blocks } },
        isDirty: true,
        ...pushHistory(state, snapshot),
      };
    }

    case "UPDATE_BLOCK": {
      const inst = state.instances[action.payload.instanceId];
      if (!inst) return state;
      const snapshot = takeSnapshot(state, `block:${action.payload.instanceId}:${action.payload.blockId}`);
      const blocks = inst.blocks.map((b) =>
        b.id === action.payload.blockId
          ? { ...b, settings: { ...b.settings, ...action.payload.settings } }
          : b
      );
      return {
        ...state,
        instances: { ...state.instances, [inst.id]: { ...inst, blocks } },
        isDirty: true,
        ...pushHistory(state, snapshot),
      };
    }

    case "UPDATE_BLOCK_TAG": {
      const inst = state.instances[action.payload.instanceId];
      if (!inst) return state;
      const snapshot = takeSnapshot(state);
      const blocks = inst.blocks.map((b) =>
        b.id === action.payload.blockId
          ? { ...b, service_tag: action.payload.service_tag ?? undefined }
          : b
      );
      return {
        ...state,
        instances: { ...state.instances, [inst.id]: { ...inst, blocks } },
        isDirty: true,
        ...pushHistory(state, snapshot),
      };
    }

    case "SYNC_ADAPTIVE_BLOCKS": {
      const inst = state.instances[action.payload.instanceId];
      if (!inst) return state;
      const { tags, blockType, defaults } = action.payload;
      const existingTags = new Set(
        inst.blocks.filter((b) => b.type === blockType && b.service_tag).map((b) => b.service_tag),
      );
      const missing = tags.filter((t) => !existingTags.has(t));
      if (missing.length === 0) return state;
      const snapshot = takeSnapshot(state);
      const added = missing.map((tag) => ({
        id: nanoid(),
        type: blockType,
        settings: { ...defaults },
        service_tag: tag,
      }));
      return {
        ...state,
        instances: {
          ...state.instances,
          [inst.id]: { ...inst, blocks: [...inst.blocks, ...added] },
        },
        isDirty: true,
        ...pushHistory(state, snapshot),
      };
    }

    case "REMOVE_BLOCK": {
      const snapshot = takeSnapshot(state);
      const inst = state.instances[action.payload.instanceId];
      if (!inst) return state;
      const blocks = inst.blocks.filter((b) => b.id !== action.payload.blockId);
      return {
        ...state,
        instances: { ...state.instances, [inst.id]: { ...inst, blocks } },
        isDirty: true,
        ...pushHistory(state, snapshot),
      };
    }

    case "DUPLICATE_BLOCK": {
      const snapshot = takeSnapshot(state);
      const inst = state.instances[action.payload.instanceId];
      if (!inst) return state;
      const idx = inst.blocks.findIndex((b) => b.id === action.payload.blockId);
      if (idx < 0) return state;
      const original = inst.blocks[idx];
      const copy = { id: nanoid(), type: original.type, settings: { ...original.settings }, service_tag: original.service_tag };
      const blocks = [...inst.blocks.slice(0, idx + 1), copy, ...inst.blocks.slice(idx + 1)];
      return {
        ...state,
        instances: { ...state.instances, [inst.id]: { ...inst, blocks } },
        isDirty: true,
        ...pushHistory(state, snapshot),
      };
    }

    case "REORDER_BLOCKS": {
      const snapshot = takeSnapshot(state);
      const inst = state.instances[action.payload.instanceId];
      if (!inst) return state;
      const blocks = [...inst.blocks];
      const [moved] = blocks.splice(action.payload.fromIndex, 1);
      if (!moved) return state;
      blocks.splice(action.payload.toIndex, 0, moved);
      return {
        ...state,
        instances: { ...state.instances, [inst.id]: { ...inst, blocks } },
        isDirty: true,
        ...pushHistory(state, snapshot),
      };
    }

    case "APPLY_PRESET": {
      const snapshot = takeSnapshot(state);
      const inst = state.instances[action.payload.instanceId];
      if (!inst) return state;
      const { preset } = action.payload;
      const newBlocks = (preset.blocks ?? []).map((b) => ({
        id: nanoid(),
        type: b.type,
        settings: { ...(b.settings ?? {}) },
      }));
      return {
        ...state,
        instances: {
          ...state.instances,
          [inst.id]: {
            ...inst,
            content: { ...inst.content, ...(preset.settings ?? {}) },
            blocks: newBlocks,
          },
        },
        isDirty: true,
        ...pushHistory(state, snapshot),
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
        ...pushHistory(state, snapshot),
      };
    }

    case "TOGGLE_INSTANCE_VISIBILITY": {
      const inst = state.instances[action.payload];
      if (!inst) return state;
      const snapshot = takeSnapshot(state);
      return {
        ...state,
        instances: {
          ...state.instances,
          [action.payload]: { ...inst, is_hidden: !inst.is_hidden },
        },
        isDirty: true,
        ...pushHistory(state, snapshot),
      };
    }

    case "UPDATE_MENUS": {
      return {
        ...state,
        menus: { ...state.menus, ...action.payload },
        isDirty: true,
      };
    }

    case "SYNC_MENUS_FROM_SITEMAP": {
      const synced = buildMenusFromSitemap(state.sitemap, DEFAULT_MENUS);
      return { ...state, menus: synced, isDirty: true };
    }

    case "UPDATE_STYLE_GUIDE": {
      const snapshot = takeSnapshot(state);
      const newGuide = mergeDeep(state.styleGuide, action.payload) as StyleGuide;
      return {
        ...state,
        styleGuide: newGuide,
        isDirty: true,
        ...pushHistory(state, snapshot),
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
      // Unique slug for the copy (avoid two "-copy" pages colliding in the
      // slug-derived hierarchy and in RENAME_PAGE_SLUG's collision guard).
      const taken = new Set(state.sitemap.map((p) => p.slug));
      const base = srcPage.slug === "/" ? "/copy" : `${srcPage.slug}-copy`;
      let newSlug = normalizePageSlug(base);
      let n = 2;
      while (taken.has(newSlug)) newSlug = normalizePageSlug(`${base}-${n++}`);
      const newPage = { ...srcPage, id: newId, slug: newSlug, title: `${srcPage.title} (copie)` };
      const srcInstances = state.instancesByPage[srcPage.slug] ?? [];
      const newInstances = { ...state.instances };
      const newIds: string[] = [];
      for (const instId of srcInstances) {
        const src = state.instances[instId];
        if (!src) continue;
        const newInstId = nanoid();
        newInstances[newInstId] = {
          ...src,
          id: newInstId,
          page_slug: newSlug,
          // Deep-clone everything (content incl. __overrides, custom_style and
          // each block's settings) with fresh block ids so the copy is fully
          // independent — edits to the copy never bleed back to the source.
          content: structuredClone(src.content),
          custom_style: src.custom_style ? structuredClone(src.custom_style) : src.custom_style,
          blocks: src.blocks.map((b) => ({ id: nanoid(), type: b.type, settings: structuredClone(b.settings), service_tag: b.service_tag })),
        };
        newIds.push(newInstId);
      }
      return {
        ...state,
        sitemap: [...state.sitemap, newPage],
        instances: newInstances,
        instancesByPage: { ...state.instancesByPage, [newSlug]: newIds },
        activePage: newSlug,
        isDirty: true,
        ...pushHistory(state, snapshot),
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

    case "RENAME_PAGE_SLUG": {
      const page = state.sitemap.find((p) => p.id === action.payload.id);
      if (!page) return state;
      const oldSlug = page.slug;
      const newSlug = normalizePageSlug(action.payload.slug);
      if (newSlug === oldSlug) return state;
      // Reject collisions with another existing page.
      if (state.sitemap.some((p) => p.id !== page.id && p.slug === newSlug)) return state;

      const snapshot = takeSnapshot(state);

      // Remap the page and every descendant (slug prefix) to the new path.
      const slugRemap = new Map<string, string>();
      slugRemap.set(oldSlug, newSlug);
      for (const p of state.sitemap) {
        if (p.slug !== oldSlug && p.slug.startsWith(oldSlug + "/")) {
          slugRemap.set(p.slug, newSlug + p.slug.slice(oldSlug.length));
        }
      }
      const remap = (slug: string) => slugRemap.get(slug) ?? slug;

      const newSitemap = state.sitemap.map((p) =>
        slugRemap.has(p.slug) ? { ...p, slug: remap(p.slug) } : p,
      );

      const newInstances: Record<string, SiteSectionInstance> = {};
      for (const [id, inst] of Object.entries(state.instances)) {
        newInstances[id] = slugRemap.has(inst.page_slug)
          ? { ...inst, page_slug: remap(inst.page_slug) }
          : inst;
      }

      const remapMenuItems = (items: SiteMenuItem[]): SiteMenuItem[] =>
        items.map((item) => ({
          ...item,
          url: slugRemap.has(item.url) ? remap(item.url) : item.url,
          children: item.children ? remapMenuItems(item.children) : item.children,
        }));

      return {
        ...state,
        sitemap: newSitemap,
        instances: newInstances,
        instancesByPage: buildInstancesByPage(newInstances),
        activePage: slugRemap.has(state.activePage) ? remap(state.activePage) : state.activePage,
        menus: {
          nav: remapMenuItems(state.menus.nav),
          footer: remapMenuItems(state.menus.footer),
          footerLegal: remapMenuItems(state.menus.footerLegal),
        },
        isDirty: true,
        ...pushHistory(state, snapshot),
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

    case "SET_VARIABLE_CONTEXT":
      return { ...state, variableContext: action.payload };

    case "SET_TAG_CATALOG":
      return { ...state, tagCatalog: action.payload };

    case "SET_SIMULATED_TAGS":
      return { ...state, simulatedTags: action.payload };

    case "SET_FAVICON_URL":
      return { ...state, faviconUrl: action.payload, isDirty: true };

    case "UPDATE_SEO":
      return { ...state, seo: { ...state.seo, ...action.payload }, isDirty: true };

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
  menus: DEFAULT_MENUS,
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
  faviconUrl: null,
  seo: {},
  variableContext: {},
  tagCatalog: [],
  simulatedTags: null,
  previewReplace: null,
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
