"use client";

import React from "react";
import {
  Sparkles, FileText, MoreHorizontal, Plus, Trash2,
  ChevronRight, Send, Loader2, AlertCircle, ChevronDown, RefreshCw, MessageSquare,
  Copy, ZoomIn, ZoomOut, Maximize2, Search, X, Tag,
} from "lucide-react";
import { toast } from "sonner";
import type { SiteSectionDef, SitemapPage, SitemapSection } from "@/types";
import { useRelumeBuilder, nanoid } from "./RelumeBuilderProvider";
import { parseServiceTags } from "@/lib/site-builder/menu-overrides";
import { buildSitemapTree, normalizePageSlug, deriveSlugFromTitle, isSlugAutoDerived, parentPathOf } from "@/lib/site-builder/sitemap-tree";
import { useAIModel } from "@/hooks/useAIModel";
import { VariableTextarea } from "./VariableTextarea";
import { PageSeoFields } from "./SeoPanel";
import { AlertSoft, Btn, Pane, PaneBody, PaneHeader, Pill, Pop } from "./skin-primitives";
import { authedFetch } from "@/utils/authedFetch";

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

  /** Non-passive wheel listener (see DesignWorkspace.useCanvasPanZoom). */
  const wheelRef = React.useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        setScale((s) => Math.min(2, Math.max(0.25, s * delta)));
      } else {
        setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
      }
    };
    el.addEventListener("wheel", handler, { passive: false });
    (el as HTMLDivElement & { __wheelCleanup?: () => void }).__wheelCleanup?.();
    (el as HTMLDivElement & { __wheelCleanup?: () => void }).__wheelCleanup = () => el.removeEventListener("wheel", handler);
  }, []);

  const zoomIn = () => setScale((s) => Math.min(2, parseFloat((s + 0.1).toFixed(2))));
  const zoomOut = () => setScale((s) => Math.max(0.25, parseFloat((s - 0.1).toFixed(2))));
  const resetZoom = () => { setScale(1); setPan({ x: 60, y: 60 }); };

  return { pan, scale, didPan, onMouseDown, onMouseMove, onMouseUp, wheelRef, zoomIn, zoomOut, resetZoom };
}

// ─── Model Dropdown ────────────────────────────────────────────────────────────

export function ModelDropdown({ value, onChange }: { value: AIModelId; onChange: (v: AIModelId) => void }) {
  const [open, setOpen] = React.useState(false);
  const model = AI_MODELS.find((m) => m.id === value) ?? AI_MODELS[0];
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", width: "100%" }}>
      <button onClick={() => setOpen(!open)} className="model-pick" style={{ width: "100%" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className={`dot ${model.provider}`} />
          <span>{model.label}</span>
        </span>
        <ChevronDown size={11} style={{ color: "var(--text-4)" }} />
      </button>
      {open && (
        <Pop style={{ top: "100%", left: 0, right: 0, marginTop: 4, padding: 4 }}>
          {[
            { provider: "anthropic", label: "Claude" },
            { provider: "openai", label: "ChatGPT" },
          ].map((group) => (
            <div key={group.provider}>
              <div style={{ padding: "6px 10px 4px", fontSize: 9, fontWeight: 600, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: ".08em", fontFamily: "var(--font-mono)" }}>
                {group.label}
              </div>
              {AI_MODELS.filter((m) => m.provider === group.provider).map((m) => (
                <button
                  key={m.id}
                  onClick={() => { onChange(m.id); setOpen(false); }}
                  className="btn ghost"
                  style={{
                    width: "100%",
                    justifyContent: "flex-start",
                    height: 28,
                    fontWeight: m.id === value ? 600 : 500,
                    color: m.id === value ? "var(--accent-2)" : "var(--text-2)",
                  }}
                >
                  <span className={`dot ${m.provider}`} style={{ width: 7, height: 7, borderRadius: "50%", display: "inline-block", background: m.provider === "anthropic" ? "var(--accent)" : "var(--ok)" }} />
                  <span>{m.label}</span>
                  {m.id === value && <span style={{ marginLeft: "auto", color: "var(--accent)" }}>✓</span>}
                </button>
              ))}
            </div>
          ))}
        </Pop>
      )}
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface SitemapWorkspaceProps {
  siteId: string;
  enterpriseId?: number;
  availableSections: SiteSectionDef[];
  /** Global authorized service-tag catalogue, so service pages can be prepared
   *  in advance even before a company is linked. */
  tagCatalog?: string[];
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SitemapWorkspace({ siteId, enterpriseId, availableSections, tagCatalog = [] }: SitemapWorkspaceProps) {
  const { state, dispatch } = useRelumeBuilder();
  const canvas = useCanvasPanZoom();
  const enterpriseServiceTags = parseServiceTags(state.variableContext);
  // Enterprise tags + global catalogue: lets you assign a service tag to a page
  // up front. Render-time visibility still depends on the linked enterprise.
  const serviceTags = React.useMemo(
    () => Array.from(new Set([...enterpriseServiceTags, ...tagCatalog])).sort((a, b) => a.localeCompare(b, "fr")),
    [enterpriseServiceTags, tagCatalog],
  );
  const [aiInput, setAiInput] = React.useState("");
  const [aiLoading, setAiLoading] = React.useState(false);
  const [aiStep, setAiStep] = React.useState<"idle" | "generating" | "done" | "error">("idle");
  const [expandedPages, setExpandedPages] = React.useState<Set<string>>(new Set());
  const [menuOpen, setMenuOpen] = React.useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useAIModel();

  // Per-page state
  const [pageContexts, setPageContexts] = React.useState<Record<string, string>>({});
  const [pageContextOpen, setPageContextOpen] = React.useState<string | null>(null);
  const [pageLoading, setPageLoading] = React.useState<string | null>(null);
  const [editingPageId, setEditingPageId] = React.useState<string | null>(null);
  const [editingTitle, setEditingTitle] = React.useState("");
  const [editingSlugId, setEditingSlugId] = React.useState<string | null>(null);
  const [editingSlug, setEditingSlug] = React.useState("");
  const [pickerOpenForPage, setPickerOpenForPage] = React.useState<string | null>(null);
  const [pickerSearch, setPickerSearch] = React.useState("");

  // ─── AI Generation ─────────────────────────────────────────────────────────

  const handleGenerate = async () => {
    if (!aiInput.trim()) return;
    setAiLoading(true);
    setAiStep("generating");
    try {
      const pageList = state.sitemap.map((p) => p.title).join(", ");
      const res = await authedFetch("/api/site-builder/ai/generate-sitemap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId,
          enterpriseId,
          description: aiInput,
          pages: pageList,
          availableSectionTypes: availableSections.map((s) => s.type),
          model: selectedModel,
          variableContext: state.variableContext,
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
          const baseContent: Record<string, unknown> = { ...(inst.content ?? {}) };
          if (secDef.theme_slug && secDef.theme_section_id) {
            baseContent.__library = { theme_slug: secDef.theme_slug, section_id: secDef.theme_section_id };
          }
          dispatch({
            type: "ADD_INSTANCE",
            payload: {
              instance: {
                id: nanoid(),
                site_id: siteId,
                section_id: null,
                section_def: secDef,
                page_slug: inst.pageSlug ?? "/",
                sort_order: inst.sortOrder ?? 0,
                content: baseContent,
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

  const handleRegeneratePage = async (page: SitemapPage) => {
    setPageLoading(page.id);
    try {
      const context = pageContexts[page.id] ?? "";
      const res = await authedFetch("/api/site-builder/ai/regenerate-page", {
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
          variableContext: state.variableContext,
        }),
      });
      if (!res.ok) throw new Error("Erreur IA");
      const data = await res.json();

      if (data.sections) {
        dispatch({ type: "UPDATE_PAGE", payload: { id: page.id, data: { sections: data.sections } } });
      }
      if (data.instances?.length) {
        const existingIds = state.instancesByPage[page.slug] ?? [];
        for (const id of existingIds) {
          dispatch({ type: "REMOVE_INSTANCE", payload: id });
        }
        for (const inst of data.instances) {
          const secDef = availableSections.find((s) => s.type === inst.sectionType);
          if (!secDef) continue;
          const baseContent: Record<string, unknown> = { ...(inst.content ?? {}) };
          if (secDef.theme_slug && secDef.theme_section_id) {
            baseContent.__library = { theme_slug: secDef.theme_slug, section_id: secDef.theme_section_id };
          }
          dispatch({
            type: "ADD_INSTANCE",
            payload: {
              instance: {
                id: nanoid(),
                site_id: siteId,
                section_id: null,
                section_def: secDef,
                page_slug: page.slug,
                sort_order: inst.sortOrder ?? 0,
                content: baseContent,
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

  /** Slug derived from a parent path + title, made unique against the sitemap. */
  const uniqueSlug = (parentPath: string, title: string) => {
    const taken = new Set(state.sitemap.map((p) => p.slug));
    const wanted = deriveSlugFromTitle(parentPath, title);
    let slug = wanted;
    let n = 2;
    while (taken.has(slug)) slug = `${wanted}-${n++}`;
    return slug;
  };

  const addPage = () => {
    const id = nanoid();
    const title = "Nouvelle page";
    dispatch({ type: "ADD_PAGE", payload: { id, slug: uniqueSlug("", title), title, sections: [] } });
  };

  const addSubPage = (parent: SitemapPage) => {
    const id = nanoid();
    const title = "Nouvelle sous-page";
    dispatch({ type: "ADD_PAGE", payload: { id, slug: uniqueSlug(parent.slug, title), title, sections: [] } });
  };

  /** Commit a page title rename and, when the slug is still auto-derived (not
   *  manually customised), re-derive the path from the new name + parent path.
   *  RENAME_PAGE_SLUG cascades to descendants, instances and menus. */
  const commitTitle = (page: SitemapPage, rawTitle: string) => {
    const title = rawTitle.trim();
    setEditingPageId(null);
    if (!title || title === page.title) return;
    dispatch({ type: "UPDATE_PAGE", payload: { id: page.id, data: { title } } });
    if (page.slug !== "/" && isSlugAutoDerived(page.slug, page.title)) {
      const nextSlug = deriveSlugFromTitle(parentPathOf(page.slug), title);
      if (nextSlug !== page.slug) {
        dispatch({ type: "RENAME_PAGE_SLUG", payload: { id: page.id, slug: nextSlug } });
      }
    }
  };

  const removePage = (id: string) => {
    dispatch({ type: "REMOVE_PAGE", payload: id });
  };

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
    const baseContent: Record<string, unknown> = { ...sectionDef.default_content };
    if (sectionDef.theme_slug && sectionDef.theme_section_id) {
      baseContent.__library = { theme_slug: sectionDef.theme_slug, section_id: sectionDef.theme_section_id };
    }
    dispatch({
      type: "ADD_INSTANCE",
      payload: {
        instance: {
          id: nanoid(),
          site_id: siteId,
          section_id: null,
          section_def: sectionDef,
          page_slug: page.slug,
          sort_order: existingIds.length,
          content: baseContent,
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
    (s.category ?? "").toLowerCase().includes(pickerSearch.toLowerCase()),
  );

  // Resolve `section_id` → SiteSectionDef once for fast lookup.
  const sectionDefById = React.useMemo(() => {
    const m = new Map<string, SiteSectionDef>();
    for (const s of availableSections) m.set(s.id, s);
    return m;
  }, [availableSections]);

  /** Live list of sections shown under a page card. Derived from the actual
   *  section instances (state.instancesByPage) instead of the legacy
   *  page.sections array — that way both manual adds and AI-generated
   *  sections surface here without any sync glue.
   *
   *  Descriptions only exist when the AI wrote them: we look them up by
   *  position-or-type in page.sections and fall back to empty otherwise. */
  const getDisplaySections = React.useCallback((page: SitemapPage): Array<{ id: string; name: string; description: string }> => {
    const ids = state.instancesByPage[page.slug] ?? [];
    const aiDescriptions = page.sections ?? [];
    return ids
      .map((id) => state.instances[id])
      .filter((inst): inst is NonNullable<typeof inst> => Boolean(inst))
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((inst, idx) => {
        const def = inst.section_def ?? (inst.section_id ? sectionDefById.get(inst.section_id) : undefined);
        const name = def?.name ?? "Section";
        const aiAt = aiDescriptions[idx];
        const aiByType = def?.type
          ? aiDescriptions.find((s) => s.type === def.type)
          : undefined;
        const description = (aiAt?.description ?? aiByType?.description ?? "").trim();
        return { id: inst.id, name, description };
      });
  }, [state.instancesByPage, state.instances, sectionDefById]);

  const toggleExpand = (id: string) => {
    setExpandedPages((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  };

  // ─── SVG layout ──────────────────────────────────────────────────────────

  const PAGE_CARD_WIDTH = 280;
  const PAGE_CARD_GAP = 40;
  const DEPTH_Y_STEP = 70;
  const ROOT_TOP = 60;
  const PAGES_TOP = 200;

  // Depth-first flatten of the slug-derived hierarchy so each child card
  // immediately follows its parent and is stepped down by its depth.
  const flatPages = React.useMemo(() => {
    const out: Array<{ page: SitemapPage; depth: number }> = [];
    const walk = (nodes: ReturnType<typeof buildSitemapTree>) => {
      for (const n of nodes) {
        out.push({ page: n.page, depth: n.depth });
        walk(n.children);
      }
    };
    walk(buildSitemapTree(state.sitemap));
    return out;
  }, [state.sitemap]);

  const posBySlug = new Map<string, { x: number; y: number }>();
  flatPages.forEach((fp, i) => {
    posBySlug.set(fp.page.slug, {
      x: i * (PAGE_CARD_WIDTH + PAGE_CARD_GAP),
      y: PAGES_TOP + fp.depth * DEPTH_Y_STEP,
    });
  });
  const slugToParent = new Map<string, string | null>();
  {
    const slugSet = new Set(state.sitemap.map((p) => p.slug));
    for (const { page } of flatPages) {
      const parts = page.slug.split("/").filter(Boolean);
      let parent: string | null = null;
      for (let i = parts.length - 1; i >= 1; i--) {
        const cand = "/" + parts.slice(0, i).join("/");
        if (slugSet.has(cand)) { parent = cand; break; }
      }
      slugToParent.set(page.slug, parent);
    }
  }

  const totalWidth = Math.max(600, flatPages.length * (PAGE_CARD_WIDTH + PAGE_CARD_GAP) + 120);
  const rootX = totalWidth / 2 - 80;

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden", flex: 1, minHeight: 0 }}>

      {/* ─ Left AI Panel ──────────────────────────────────────────────────── */}
      <Pane style={{ width: 280, flexShrink: 0 }}>
        <div className="ai-side-hd">
          <div className="title">
            <span className="mark"><Sparkles size={13} /></span>
            <span>Assistant IA</span>
          </div>
          <div className="desc">Décrivez votre activité pour générer votre sitemap automatiquement.</div>
        </div>

        <PaneBody>
          <div className="ai-side-body">
            {!enterpriseId && (
              <AlertSoft tone="warn">
                <AlertCircle size={12} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>Aucune entreprise liée. Les résultats seront génériques.</span>
              </AlertSoft>
            )}

            <div>
              <div className="field-label">Modèle IA</div>
              <ModelDropdown value={selectedModel} onChange={setSelectedModel} />
            </div>

            <div>
              <div className="field-label">Description de votre activité</div>
              <VariableTextarea
                value={aiInput}
                onChange={setAiInput}
                placeholder="Ex: Entreprise de plomberie à Paris, spécialisée…"
                rows={5}
                className="textarea"
                variables={state.variableContext}
                variant="light"
              />
            </div>

            <div>
              <div className="field-label">Pages souhaitées <span className="hint">{state.sitemap.length}</span></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {state.sitemap.map((page) => (
                  <div key={page.id} className="page-pill">
                    <FileText size={11} style={{ color: "var(--text-4)" }} />
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{page.title}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={addPage}
                className="btn ghost xs"
                style={{ color: "var(--magic)", marginTop: 4, paddingLeft: 4 }}
              >
                <Plus size={11} />Ajouter une page
              </button>
            </div>

            {aiStep === "done" && (
              <AlertSoft tone="ok"><span>Sitemap généré avec succès !</span></AlertSoft>
            )}
            {aiStep === "error" && (
              <AlertSoft tone="warn"><span>Une erreur est survenue. Réessayez.</span></AlertSoft>
            )}
          </div>
        </PaneBody>

        <div className="ai-side-foot">
          <Btn
            variant="magic"
            onClick={handleGenerate}
            disabled={aiLoading || !aiInput.trim()}
            style={{ width: "100%", justifyContent: "center", height: 32 }}
          >
            {aiLoading ? (<><Loader2 size={13} className="animate-spin" />Génération…</>) : (<><Send size={12} />Générer le sitemap</>)}
          </Btn>
        </div>
      </Pane>

      {/* ─ Canvas ──────────────────────────────────────────────────────────── */}
      <div
        ref={canvas.wheelRef}
        className="sm-canvas"
        onMouseDown={canvas.onMouseDown}
        onMouseMove={canvas.onMouseMove}
        onMouseUp={canvas.onMouseUp}
        onMouseLeave={canvas.onMouseUp}
        style={{ cursor: "grab", flex: 1 }}
      >
        <div className="canvas-dotgrid" />

        <div
          className="sm-stage"
          style={{
            transform: `translate(${canvas.pan.x}px, ${canvas.pan.y}px) scale(${canvas.scale})`,
            width: totalWidth + 200,
          }}
        >
          <svg
            style={{ position: "absolute", top: 0, left: 0, width: totalWidth + 200, height: 600, overflow: "visible", pointerEvents: "none" }}
          >
            {flatPages.map(({ page }) => {
              const pos = posBySlug.get(page.slug)!;
              const parentSlug = slugToParent.get(page.slug) ?? null;
              const parentPos = parentSlug ? posBySlug.get(parentSlug) : null;
              const fromX = parentPos ? parentPos.x + PAGE_CARD_WIDTH / 2 : rootX + 80;
              const fromY = parentPos ? parentPos.y + 30 : ROOT_TOP + 36;
              const toX = pos.x + PAGE_CARD_WIDTH / 2;
              const toY = pos.y;
              const midY = (fromY + toY) / 2;
              return (
                <path
                  key={page.id}
                  d={`M ${fromX} ${fromY} C ${fromX} ${midY}, ${toX} ${midY}, ${toX} ${toY}`}
                  stroke="rgba(20,18,14,0.18)"
                  strokeWidth={1.5}
                  fill="none"
                  strokeDasharray="4 3"
                />
              );
            })}
          </svg>

          {/* Root "Project" node */}
          <div className="sm-root-node" style={{ position: "absolute", top: ROOT_TOP, left: rootX, width: 160 }}>
            <div className="ic"><FileText size={12} /></div>
            <span>Project</span>
          </div>

          {/* Page cards */}
          {flatPages.map(({ page }) => {
            const pos = posBySlug.get(page.slug)!;
            const isExpanded = expandedPages.has(page.id);
            const sections = getDisplaySections(page);
            const isLoadingPage = pageLoading === page.id;
            const pageCtx = pageContexts[page.id] ?? "";
            const isContextOpen = pageContextOpen === page.id;

            return (
              <div
                key={page.id}
                className="sm-page-card"
                style={{ position: "absolute", top: pos.y, left: pos.x, width: PAGE_CARD_WIDTH }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="hd">
                  <div className="ic"><FileText size={11} /></div>
                  {editingPageId === page.id ? (
                    <input
                      autoFocus
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onBlur={() => commitTitle(page, editingTitle)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitTitle(page, editingTitle);
                        if (e.key === "Escape") setEditingPageId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="input"
                      style={{ flex: 1, height: 22, padding: "0 4px", fontSize: 12, fontWeight: 600, borderColor: "var(--accent)" }}
                    />
                  ) : (
                    <span
                      className="title"
                      onDoubleClick={(e) => { e.stopPropagation(); setEditingPageId(page.id); setEditingTitle(page.title); }}
                      title="Double-clic pour renommer"
                    >
                      {page.title}
                    </span>
                  )}
                  {editingSlugId === page.id ? (
                    <input
                      autoFocus
                      value={editingSlug}
                      onChange={(e) => setEditingSlug(e.target.value)}
                      onBlur={() => {
                        if (editingSlug.trim()) dispatch({ type: "RENAME_PAGE_SLUG", payload: { id: page.id, slug: editingSlug } });
                        setEditingSlugId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          if (editingSlug.trim()) dispatch({ type: "RENAME_PAGE_SLUG", payload: { id: page.id, slug: editingSlug } });
                          setEditingSlugId(null);
                        }
                        if (e.key === "Escape") setEditingSlugId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="input"
                      placeholder="/chemin/de-la-page"
                      style={{ width: 130, height: 20, padding: "0 4px", fontSize: 10.5, fontFamily: "var(--font-mono)", borderColor: "var(--accent)" }}
                    />
                  ) : (
                    <span
                      className="slug"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        if (page.slug === "/") return;
                        setEditingSlugId(page.id);
                        setEditingSlug(page.slug);
                      }}
                      title={page.slug === "/" ? "Page d'accueil" : "Double-clic pour modifier le chemin (ex: /services/climatisation)"}
                      style={{ cursor: page.slug === "/" ? "default" : "text" }}
                    >
                      {page.slug}
                    </span>
                  )}
                  <div className="tools">
                    <button
                      onClick={() => setPageContextOpen(isContextOpen ? null : page.id)}
                      className={isContextOpen ? "magic-on" : undefined}
                      title="Régénérer avec l'IA"
                    >
                      <Sparkles size={11} />
                    </button>
                    <button
                      onClick={() => toggleExpand(page.id)}
                      title={isExpanded ? "Réduire" : "Développer"}
                    >
                      <ChevronRight size={11} style={{ transform: isExpanded ? "rotate(90deg)" : undefined, transition: "transform .15s" }} />
                    </button>
                    <div style={{ position: "relative" }}>
                      <button onClick={() => setMenuOpen(menuOpen === page.id ? null : page.id)}>
                        <MoreHorizontal size={11} />
                      </button>
                      {menuOpen === page.id && (
                        <Pop style={{ position: "absolute", right: 0, top: "100%", marginTop: 4, minWidth: 160, padding: 4, zIndex: 50 }}>
                          <button
                            onClick={() => { setEditingPageId(page.id); setEditingTitle(page.title); setMenuOpen(null); }}
                            className="btn ghost sm"
                            style={{ width: "100%", justifyContent: "flex-start" }}
                          >
                            <FileText size={11} />Renommer
                          </button>
                          {page.slug !== "/" && (
                            <button
                              onClick={() => { setEditingSlugId(page.id); setEditingSlug(page.slug); setMenuOpen(null); }}
                              className="btn ghost sm"
                              style={{ width: "100%", justifyContent: "flex-start" }}
                            >
                              <ChevronRight size={11} />Modifier le chemin
                            </button>
                          )}
                          <button
                            onClick={() => { addSubPage(page); setMenuOpen(null); }}
                            className="btn ghost sm"
                            style={{ width: "100%", justifyContent: "flex-start" }}
                          >
                            <Plus size={11} />Ajouter une sous-page
                          </button>
                          <button
                            onClick={() => { dispatch({ type: "DUPLICATE_PAGE", payload: page.id }); setMenuOpen(null); }}
                            className="btn ghost sm"
                            style={{ width: "100%", justifyContent: "flex-start" }}
                          >
                            <Copy size={11} />Dupliquer
                          </button>
                          <button
                            onClick={() => { removePage(page.id); setMenuOpen(null); }}
                            className="btn danger sm"
                            style={{ width: "100%", justifyContent: "flex-start" }}
                          >
                            <Trash2 size={11} />Supprimer
                          </button>
                        </Pop>
                      )}
                    </div>
                  </div>
                </div>

                {/* Service tag picker — page only shown to enterprises with this tag */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderTop: "1px solid var(--line-1)", background: "var(--surface-2, transparent)" }}>
                  <Tag size={10} style={{ color: "var(--text-3)" }} />
                  <span style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 500 }}>Service tag :</span>
                  <select
                    value={page.service_tag ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      dispatch({ type: "UPDATE_PAGE", payload: { id: page.id, data: { service_tag: v === "" ? null : v } } });
                    }}
                    style={{ flex: 1, fontSize: 11, padding: "2px 4px", border: "1px solid var(--line-1)", borderRadius: 4, background: "white", minWidth: 0 }}
                    title="Si défini, cette page n'apparaît que sur les entreprises ayant ce tag."
                  >
                    <option value="">— Toujours afficher</option>
                    {serviceTags.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                {/* Per-page SEO override (falls back to the site defaults) */}
                <details style={{ borderTop: "1px solid var(--line-1)" }}>
                  <summary style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 500, padding: "6px 10px", cursor: "default", userSelect: "none", display: "flex", alignItems: "center", gap: 6 }}>
                    <Search size={10} style={{ color: "var(--text-3)" }} /> SEO &amp; méta de la page
                  </summary>
                  <div style={{ padding: "4px 10px 10px" }}>
                    <PageSeoFields page={page} />
                  </div>
                </details>

                {/* Per-page AI context */}
                {isContextOpen && (
                  <div className="ai-ctx">
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
                      <MessageSquare size={10} style={{ color: "var(--magic)" }} />
                      <span style={{ fontSize: 10, fontWeight: 600, color: "var(--magic)", textTransform: "uppercase", letterSpacing: ".05em" }}>
                        Contexte pour cette page
                      </span>
                    </div>
                    <VariableTextarea
                      value={pageCtx}
                      onChange={(v) => setPageContexts((prev) => ({ ...prev, [page.id]: v }))}
                      placeholder={`Instructions spécifiques pour "${page.title}"…`}
                      rows={3}
                      variables={state.variableContext}
                      variant="light"
                    />
                    <Btn
                      variant="magic"
                      size="sm"
                      onClick={() => handleRegeneratePage(page)}
                      disabled={isLoadingPage}
                      style={{ width: "100%", justifyContent: "center", marginTop: 8 }}
                    >
                      {isLoadingPage ? (<><Loader2 size={10} className="animate-spin" /> Génération…</>) : (<><RefreshCw size={10} /> Régénérer cette page</>)}
                    </Btn>
                  </div>
                )}

                {/* Sections — derived live from real instances */}
                {sections.length > 0 && (
                  <div>
                    {(isExpanded ? sections : sections.slice(0, 4)).map((sec) => (
                      <div key={sec.id} className="sec-row">
                        <div className="name">{sec.name}</div>
                        {sec.description && <div className="desc">{sec.description}</div>}
                      </div>
                    ))}
                    {!isExpanded && sections.length > 4 && (
                      <button
                        onClick={() => toggleExpand(page.id)}
                        className="sec-row"
                        style={{ width: "100%", textAlign: "left", appearance: "none", border: 0, background: "transparent", fontSize: 10.5, color: "var(--text-4)", cursor: "default" }}
                      >
                        +{sections.length - 4} sections de plus…
                      </button>
                    )}
                  </div>
                )}

                {sections.length === 0 && (
                  <div style={{ padding: "10px 12px", textAlign: "center", fontSize: 10.5, color: "var(--text-4)", lineHeight: 1.5 }}>
                    Page vide — sert de catégorie. Ne sera pas publiée comme page tant qu&apos;aucune section n&apos;est ajoutée.
                  </div>
                )}

                <div style={{ position: "relative" }}>
                  <button
                    onClick={() => {
                      setPickerOpenForPage(pickerOpenForPage === page.id ? null : page.id);
                      setPickerSearch("");
                    }}
                    className="add-row"
                    style={{ width: "100%", appearance: "none", border: 0, background: "transparent" }}
                  >
                    <Plus size={11} />Ajouter une section
                  </button>
                  {pickerOpenForPage === page.id && (
                    <Pop
                      style={{ position: "absolute", left: 8, right: 8, top: "100%", marginTop: 4, maxHeight: 280, display: "flex", flexDirection: "column", zIndex: 40 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="modal-search" style={{ padding: 8 }}>
                        <div className="search-wrap" style={{ flex: 1 }}>
                          <Search size={11} />
                          <input
                            autoFocus
                            value={pickerSearch}
                            onChange={(e) => setPickerSearch(e.target.value)}
                            placeholder="Rechercher une section…"
                            className="input"
                            style={{ height: 26, fontSize: 12 }}
                          />
                        </div>
                        <button onClick={() => setPickerOpenForPage(null)} className="btn ghost sm icon" title="Fermer">
                          <X size={11} />
                        </button>
                      </div>
                      <div style={{ overflow: "auto", padding: 4 }}>
                        {filteredSectionsForPicker.length === 0 && (
                          <p style={{ fontSize: 10.5, color: "var(--text-4)", textAlign: "center", padding: 12, margin: 0 }}>Aucune section</p>
                        )}
                        {filteredSectionsForPicker.map((sec) => (
                          <button
                            key={sec.id}
                            onClick={() => { addSectionToPage(page, sec); setPickerOpenForPage(null); }}
                            className="btn ghost"
                            style={{ width: "100%", justifyContent: "flex-start", height: 32, padding: "0 10px" }}
                          >
                            <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                              <div style={{ fontSize: 11.5, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sec.name}</div>
                              <div style={{ fontSize: 10, color: "var(--text-4)", fontFamily: "var(--font-mono)" }}>{sec.category ?? sec.type}</div>
                            </div>
                            <Plus size={10} style={{ color: "var(--text-4)" }} />
                          </button>
                        ))}
                      </div>
                    </Pop>
                  )}
                </div>
              </div>
            );
          })}

          <button
            onClick={addPage}
            className="sm-add-page"
            style={{ position: "absolute", top: PAGES_TOP + 6, left: flatPages.length * (PAGE_CARD_WIDTH + PAGE_CARD_GAP), appearance: "none" }}
            title="Ajouter une page"
          >
            <Plus size={16} />
          </button>
        </div>

        <div className="canvas-tools">
          <div className="grp">
            <button onClick={canvas.zoomOut} title="Dézoomer"><ZoomOut size={12} /></button>
            <button onClick={canvas.resetZoom} title="Réinitialiser">
              <span className="zoom-val">{Math.round(canvas.scale * 100)}%</span>
            </button>
            <button onClick={canvas.zoomIn} title="Zoomer"><ZoomIn size={12} /></button>
          </div>
          <div className="grp">
            <button onClick={canvas.resetZoom} title="Recentrer"><Maximize2 size={12} /></button>
          </div>
        </div>

        <div className="canvas-help">
          Glisser · <kbd>⌘</kbd>+scroll pour zoomer
        </div>

        {aiLoading && (
          <div
            style={{
              position: "absolute",
              bottom: 18,
              left: "50%",
              transform: "translateX(-50%)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "var(--text)",
              color: "var(--bg)",
              fontSize: 12,
              padding: "8px 16px",
              borderRadius: 999,
              boxShadow: "var(--shadow-2)",
            }}
          >
            <Sparkles size={12} style={{ color: "var(--magic)" }} />
            Génération du sitemap…
            <button
              onClick={() => setAiLoading(false)}
              style={{ marginLeft: 4, width: 16, height: 16, borderRadius: "50%", background: "rgba(255,255,255,.18)", border: 0, color: "inherit", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "default" }}
            >
              ×
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
