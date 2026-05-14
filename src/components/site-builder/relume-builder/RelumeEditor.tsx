"use client";

import React from "react";
import {
  Save, Globe, Check, Share2, Upload,
  Building2, ChevronDown, Search, Bookmark, Palette, X, Loader2,
  Undo2, Redo2, ArrowUpDown,
} from "lucide-react";
import { toast } from "sonner";
import type { SiteSectionDef, SiteSectionInstance, StyleGuide, SitemapPage, SiteMenus, WorkspaceId } from "@/types";
import { DEFAULT_STYLE_GUIDE } from "@/types";
import { RelumeBuilderProvider, useRelumeBuilder, nanoid } from "./RelumeBuilderProvider";
import { serializeTheme, type SerializedThemeConfig } from "@/lib/site-builder/theme-serializer";
import { ThemeLibraryDialog } from "./ThemeLibraryDialog";
import { useSiteAutosave } from "@/hooks/useSiteAutosave";
import { useGoogleFonts } from "./StyleGuideWorkspace";
import { SiteVersionHistory } from "@/components/site-builder/SiteVersionHistory";
import { SitemapWorkspace } from "./SitemapWorkspace";
import { WireframeWorkspace } from "./WireframeWorkspace";
import { StyleGuideWorkspace } from "./StyleGuideWorkspace";
import { DesignWorkspace } from "./DesignWorkspace";

// ─── Public API ───────────────────────────────────────────────────────────────

export interface RelumeEditorProps {
  siteId: string;
  siteName: string;
  enterpriseId?: number;
  initialProjectId?: string;
  isPublished?: boolean;
  publishedSubdomain?: string;
  initialSections?: SiteSectionDef[];
  initialInstances?: SiteSectionInstance[];
  initialStyleGuide?: StyleGuide | null;
  initialSitemap?: SitemapPage[];
  initialMenus?: SiteMenus | null;
  /** ISO timestamp of the last publish. Used to show "unpublished changes" indicator. */
  publishedAt?: string | null;
}

export function RelumeEditor(props: RelumeEditorProps) {
  return (
    <RelumeBuilderProvider siteId={props.siteId} siteName={props.siteName}>
      <RelumeEditorInner {...props} />
    </RelumeBuilderProvider>
  );
}

// ─── Entreprise type ──────────────────────────────────────────────────────────

interface Entreprise {
  id: number;
  nom: string;
  pret_pour_lm?: boolean;
}

// ─── Company Dropdown ─────────────────────────────────────────────────────────

function CompanyDropdown({
  currentEnterpriseId,
  onSelect,
}: {
  currentEnterpriseId?: number;
  onSelect: (id: number | null, nom: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [companies, setCompanies] = React.useState<Entreprise[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [currentName, setCurrentName] = React.useState<string>("");
  const [sortByLm, setSortByLm] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  const loadCompanies = React.useCallback(() => {
    setLoading(true);
    fetch("/api/site-builder/entreprises")
      .then((r) => r.json())
      .then((data: unknown) => {
        const list = Array.isArray(data) ? (data as Entreprise[]) : [];
        setCompanies(list);
        if (currentEnterpriseId) {
          const found = list.find((c) => c.id === currentEnterpriseId);
          if (found) setCurrentName(found.nom);
        }
      })
      .catch(() => toast.error("Erreur chargement entreprises"))
      .finally(() => setLoading(false));
  }, [currentEnterpriseId]);

  React.useEffect(() => {
    if (open && companies.length === 0) loadCompanies();
  }, [open]);

  // Load current name on mount
  React.useEffect(() => {
    if (currentEnterpriseId && !currentName) loadCompanies();
  }, [currentEnterpriseId]);

  // Close on outside click
  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const filtered = React.useMemo(() => {
    const matched = companies.filter((c) =>
      c.nom.toLowerCase().includes(search.toLowerCase())
    );
    if (sortByLm) {
      return [...matched].sort((a, b) => {
        if (a.pret_pour_lm === b.pret_pour_lm) return a.nom.localeCompare(b.nom);
        return a.pret_pour_lm ? -1 : 1;
      });
    }
    return matched;
  }, [companies, search, sortByLm]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1 text-xs text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors max-w-[160px]"
      >
        <Building2 size={12} className="flex-shrink-0 text-gray-400" />
        <span className="truncate">{currentName || "Lier une entreprise"}</span>
        <ChevronDown size={10} className="flex-shrink-0 text-gray-400" />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-72 bg-white border border-gray-200 rounded-xl shadow-xl z-50">
          <div className="p-2 border-b border-gray-100 flex items-center gap-2">
            <div className="relative flex-1">
              <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher une entreprise..."
                className="w-full pl-7 pr-2 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-blue-400"
              />
            </div>
            <button
              onClick={() => setSortByLm((v) => !v)}
              title={sortByLm ? "Tri : Prêts LM en premier" : "Tri : A–Z"}
              className={`flex-shrink-0 flex items-center gap-1 px-2 py-1.5 rounded-md text-xs border transition-colors ${sortByLm ? "bg-green-50 border-green-300 text-green-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}
            >
              <ArrowUpDown size={10} />
              {sortByLm ? "LM" : "A–Z"}
            </button>
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {loading && (
              <div className="flex items-center justify-center py-4">
                <Loader2 size={14} className="animate-spin text-gray-400" />
              </div>
            )}
            {!loading && currentEnterpriseId && (
              <button
                onClick={() => { onSelect(null, ""); setCurrentName(""); setOpen(false); }}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
              >
                <X size={10} />
                Aucune entreprise
              </button>
            )}
            {!loading && filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => { onSelect(c.id, c.nom); setCurrentName(c.nom); setOpen(false); setSearch(""); }}
                className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left transition-colors hover:bg-gray-50 ${c.id === currentEnterpriseId ? "text-blue-600 font-medium" : "text-gray-700"}`}
              >
                <Building2 size={10} className="text-gray-400 flex-shrink-0" />
                <span className="flex-1 truncate">{c.nom}</span>
                {c.pret_pour_lm && (
                  <span className="flex-shrink-0 text-[9px] px-1 py-0.5 rounded bg-green-100 text-green-700 font-medium">LM</span>
                )}
                {c.id === currentEnterpriseId && <span className="flex-shrink-0 text-blue-500">✓</span>}
              </button>
            ))}
            {!loading && filtered.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-3">Aucune entreprise trouvée</p>
            )}
          </div>
          {!loading && companies.length > 0 && (
            <div className="px-3 py-1.5 border-t border-gray-100 text-[10px] text-gray-400">
              {filtered.length} / {companies.length} entreprises qualifiées
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Project Dropdown ─────────────────────────────────────────────────────────

interface LMProject {
  id: string;
  override_city: string | null;
  override_location: string | null;
  override_entreprise_name: string | null;
  statut: string | null;
}

function ProjectDropdown({
  enterpriseId,
  currentProjectId,
  onSelect,
}: {
  enterpriseId?: number;
  currentProjectId?: string;
  onSelect: (id: string | null) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [projects, setProjects] = React.useState<LMProject[]>([]);
  const [loading, setLoading] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!enterpriseId) { setProjects([]); return; }
    setLoading(true);
    fetch(`/api/site-builder/lead-magnet-projects?enterprise=${enterpriseId}`)
      .then((r) => r.json())
      .then((data: unknown) => { if (Array.isArray(data)) setProjects(data as LMProject[]); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [enterpriseId]);

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const current = projects.find((p) => p.id === currentProjectId);
  const label = current
    ? (current.override_city ?? current.override_location ?? `Projet ${current.id.slice(0, 6)}`)
    : "Projet LM";

  if (!enterpriseId) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1 text-xs text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors max-w-[160px]"
        title="Lier un lead magnet project (ville SEO + avis)"
      >
        <span className="truncate">{loading ? "…" : label}</span>
        <ChevronDown size={12} className="flex-shrink-0" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
          <div className="p-1 max-h-60 overflow-y-auto">
            <button
              className="w-full text-left px-3 py-2 text-xs text-gray-400 hover:bg-gray-50 rounded"
              onClick={() => { onSelect(null); setOpen(false); }}
            >
              — Aucun projet
            </button>
            {projects.map((p) => (
              <button
                key={p.id}
                className={`w-full text-left px-3 py-2 text-xs rounded hover:bg-gray-50 ${p.id === currentProjectId ? "font-semibold text-gray-900" : "text-gray-700"}`}
                onClick={() => { onSelect(p.id); setOpen(false); }}
              >
                <span className="font-medium">{p.override_city ?? p.override_location ?? p.id.slice(0, 8)}</span>
                {p.override_entreprise_name && (
                  <span className="ml-1 text-gray-400">· {p.override_entreprise_name}</span>
                )}
                {p.statut && <span className="ml-1 text-gray-400">({p.statut})</span>}
              </button>
            ))}
            {!loading && projects.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-3">Aucun projet trouvé</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Save As Theme Dialog ─────────────────────────────────────────────────────

function SaveAsThemeDialog({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (name: string, description: string) => Promise<void>;
}) {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  if (!open) return null;

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave(name.trim(), description.trim());
      setName("");
      setDescription("");
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-80 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Bookmark size={16} className="text-gray-600" />
          <span className="font-semibold text-gray-900">Enregistrer comme thème</span>
          <button onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-600"><X size={14} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Nom du thème</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mon thème pro"
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Description (optionnel)</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Un thème professionnel pour..."
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
            />
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 py-2 text-sm text-gray-500 border border-gray-200 rounded-md hover:bg-gray-50">Annuler</button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="flex-1 py-2 text-sm font-semibold bg-gray-900 text-white rounded-md hover:bg-gray-700 disabled:opacity-50"
          >
            {saving ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}


// ─── Inner Editor ─────────────────────────────────────────────────────────────

function RelumeEditorInner({
  siteId,
  siteName,
  enterpriseId: initialEnterpriseId,
  initialProjectId,
  isPublished,
  publishedSubdomain,
  publishedAt,
  initialSections = [],
  initialInstances = [],
  initialStyleGuide,
  initialSitemap,
  initialMenus,
}: RelumeEditorProps) {
  const { state, dispatch } = useRelumeBuilder();
  const [saving, setSaving] = React.useState(false);
  const [publishing, setPublishing] = React.useState(false);
  // True once autosave has fired since the last publish → indicates unpublished draft changes
  const [hasDraftChanges, setHasDraftChanges] = React.useState(false);
  // Unused `publishedAt` kept for future "modified since X" display
  void publishedAt;

  const { status: autosaveStatus } = useSiteAutosave({
    siteId,
    state,
    onSaved: () => {
      dispatch({ type: "MARK_SAVED" });
      if (isPublished) setHasDraftChanges(true);
    },
  });

  // Load selected fonts globally so all workspaces render them correctly
  useGoogleFonts([state.styleGuide.fonts.heading, state.styleGuide.fonts.body]);
  const [publishDomain, setPublishDomain] = React.useState(publishedSubdomain ?? "");
  const [showPublish, setShowPublish] = React.useState(false);
  const [enterpriseId, setEnterpriseId] = React.useState<number | undefined>(initialEnterpriseId);
  const [projectId, setProjectId] = React.useState<string | undefined>(initialProjectId);
  const [showSaveTheme, setShowSaveTheme] = React.useState(false);
  const [themeLibraryOpen, setThemeLibraryOpen] = React.useState(false);

  // Fetch and store enterprise variable context whenever the linked enterprise/project changes
  const fetchVariables = React.useCallback((id: number | undefined, pid?: string) => {
    if (!id) { dispatch({ type: "SET_VARIABLE_CONTEXT", payload: {} }); return; }
    const url = `/api/site-builder/variables?enterprise=${id}${pid ? `&project=${pid}` : ""}`;
    fetch(url)
      .then((r) => r.json())
      .then((data: unknown) => {
        if (data && typeof data === "object" && !Array.isArray(data)) {
          dispatch({ type: "SET_VARIABLE_CONTEXT", payload: data as Record<string, string> });
        }
      })
      .catch(() => {});
  }, [dispatch]);

  // Load on mount if an enterprise is already linked
  React.useEffect(() => {
    if (initialEnterpriseId) fetchVariables(initialEnterpriseId, initialProjectId);
  }, [initialEnterpriseId, initialProjectId, fetchVariables]);

  const sectionDefs = React.useMemo(
    () => Object.fromEntries(initialSections.map((s) => [s.id, s])),
    [initialSections]
  );

  React.useEffect(() => {
    dispatch({
      type: "LOAD",
      payload: {
        styleGuide: initialStyleGuide ?? DEFAULT_STYLE_GUIDE,
        sitemap: initialSitemap ?? [{ id: "page-home", slug: "/", title: "Accueil" }],
        menus: initialMenus ?? undefined,
        instances: initialInstances.map((inst) => ({
          ...inst,
          section_def: inst.section_id ? sectionDefs[inst.section_id] : (inst as unknown as { section_def?: SiteSectionDef }).section_def,
        })),
      },
    });
  }, [siteId]);

  // ─── Keyboard shortcuts ───────────────────────────────────────────────────────

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        dispatch({ type: "UNDO" });
      } else if (e.key === "y" || (e.key === "z" && e.shiftKey)) {
        e.preventDefault();
        dispatch({ type: "REDO" });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dispatch]);

  // ─── Save ────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    try {
      const r1 = await fetch(`/api/site-builder/sites/${siteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          style_guide: state.styleGuide,
          sitemap: state.sitemap,
          site_config: { menus: state.menus },
        }),
      });
      if (!r1.ok) { const e = await r1.json(); throw new Error(e.error ?? "Erreur PATCH site"); }

      const instances = Object.values(state.instances).map((inst) => ({
        id: inst.id,
        site_id: inst.site_id,
        section_id: inst.section_id ?? null,
        page_slug: inst.page_slug,
        sort_order: inst.sort_order,
        content: inst.content,
        blocks: inst.blocks ?? [],
        custom_style: inst.custom_style ?? {},
        is_hidden: inst.is_hidden ?? false,
      }));
      const r2 = await fetch(`/api/site-builder/sites/${siteId}/instances`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instances }),
      });
      if (!r2.ok) { const e = await r2.json(); throw new Error(e.error ?? "Erreur PUT instances"); }

      // Version snapshot — non-blocking (ignore errors)
      fetch(`/api/site-builder/sites/${siteId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ style_guide: state.styleGuide, sitemap: state.sitemap }),
      }).catch(() => {});

      dispatch({ type: "MARK_SAVED" });
      toast.success("Sauvegardé ✓");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  // ─── Publish ─────────────────────────────────────────────────────────────────

  const handlePublish = async () => {
    if (!publishDomain.trim()) return;
    setPublishing(true);
    try {
      const res = await fetch(`/api/site-builder/sites/${siteId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subdomain: publishDomain.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Erreur");
      }
      setShowPublish(false);
      setHasDraftChanges(false);
      toast.success(`Site publié sur ${publishDomain}.${process.env.NEXT_PUBLIC_SITE_DOMAIN ?? "samadigitalstudio.fr"}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur de publication");
    } finally {
      setPublishing(false);
    }
  };

  // ─── Link company ─────────────────────────────────────────────────────────────

  const handleSelectCompany = async (id: number | null) => {
    setEnterpriseId(id ?? undefined);
    setProjectId(undefined); // reset project when company changes
    fetchVariables(id ?? undefined, undefined);
    try {
      await fetch(`/api/site-builder/sites/${siteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enterprise_id: id, lead_magnet_project_id: null }),
      });
      toast.success(id ? "Entreprise liée" : "Entreprise dissociée");
    } catch {
      toast.error("Erreur lors de la liaison");
    }
  };

  const handleSelectProject = async (id: string | null) => {
    setProjectId(id ?? undefined);
    fetchVariables(enterpriseId, id ?? undefined);
    try {
      await fetch(`/api/site-builder/sites/${siteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_magnet_project_id: id }),
      });
      toast.success(id ? "Projet LM lié" : "Projet LM dissocié");
    } catch {
      toast.error("Erreur lors de la liaison du projet");
    }
  };

  // ─── Apply theme from library ─────────────────────────────────────────────────

  const handleApplyTheme = (config: SerializedThemeConfig) => {
    const flatInstances: SiteSectionInstance[] = [];
    for (const [pageSlug, serialized] of Object.entries(config.instancesByPage)) {
      for (const s of serialized) {
        const id = nanoid();
        const createdAt = new Date().toISOString();
        flatInstances.push({
          id,
          site_id: siteId,
          section_id: s.section_id,
          section_def: sectionDefs[s.section_id] ?? undefined,
          page_slug: pageSlug,
          sort_order: s.sort_order,
          content: s.content,
          blocks: s.blocks.map((block) => ({
            id: block.id ?? nanoid(),
            type: block.type,
            settings: block.settings,
          })),
          custom_style: s.custom_style,
          is_hidden: s.is_hidden,
          created_at: createdAt,
          updated_at: createdAt,
        });
      }
    }
    dispatch({
      type: "LOAD",
      payload: {
        styleGuide: config.styleGuide,
        sitemap: config.sitemap,
        menus: config.menus,
        instances: flatInstances,
      },
    });
    toast.success("Thème appliqué");
  };

  // ─── Save as theme ────────────────────────────────────────────────────────────

  const handleSaveTheme = async (name: string, description: string) => {
    const config = serializeTheme(state);
    const res = await fetch("/api/site-builder/themes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description: description || undefined,
        config,
        enterprise_id: enterpriseId,
        is_public: false,
      }),
    });
    if (!res.ok) {
      const e = await res.json();
      throw new Error(e.error ?? "Erreur");
    }
    toast.success(`Thème "${name}" enregistré`);
  };

  // ─── AI Regenerate Section ────────────────────────────────────────────────────

  const handleRegenerateSection = async (instanceId: string, prompt: string, model = "claude-sonnet-4-6") => {
    const instance = state.instances[instanceId];
    const sectionDef = instance?.section_def ?? (instance?.section_id ? sectionDefs[instance.section_id] : null);
    if (!instance || !sectionDef) return;
    try {
      const res = await fetch("/api/site-builder/ai/regenerate-section", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId,
          instanceId,
          sectionType: sectionDef.type,
          currentContent: instance.content,
          defaultContent: sectionDef.default_content,
          prompt,
          model,
          variableContext: state.variableContext,
        }),
      });
      if (!res.ok) throw new Error("Erreur IA");
      const { content } = await res.json();
      dispatch({ type: "UPDATE_INSTANCE_CONTENT", payload: { id: instanceId, content } });
      toast.success("Contenu régénéré");
    } catch {
      toast.error("Erreur lors de la régénération");
    }
  };

  const WORKSPACES: { id: WorkspaceId; label: string }[] = [
    { id: "sitemap", label: "Sitemap" },
    { id: "wireframe", label: "Wireframe" },
    { id: "style-guide", label: "Style Guide" },
    { id: "design", label: "Design" },
  ];

  return (
    <div className="flex flex-col h-screen bg-white text-gray-900 overflow-hidden">

      {/* ─ Dialogs ─────────────────────────────────────────────────────────── */}
      <SaveAsThemeDialog
        open={showSaveTheme}
        onClose={() => setShowSaveTheme(false)}
        onSave={handleSaveTheme}
      />
      <ThemeLibraryDialog
        open={themeLibraryOpen}
        onClose={() => setThemeLibraryOpen(false)}
        onApply={handleApplyTheme}
        enterpriseId={enterpriseId}
      />

      {/* ─ Top Bar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center h-12 px-4 border-b border-gray-200 bg-white flex-shrink-0 z-40 select-none gap-2">

        {/* Logo + Site name */}
        <div className="flex items-center gap-2 min-w-0 flex-shrink-0">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex-shrink-0 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-white/80" />
          </div>
          <span className="text-sm font-medium text-gray-800 truncate max-w-[140px]">{siteName}</span>
        </div>

        {/* Company linker */}
        <CompanyDropdown
          currentEnterpriseId={enterpriseId}
          onSelect={(id, _nom) => handleSelectCompany(id)}
        />

        {/* Lead magnet project picker (ville SEO + avis) */}
        <ProjectDropdown
          enterpriseId={enterpriseId}
          currentProjectId={projectId}
          onSelect={handleSelectProject}
        />

        {/* Center workspace tabs */}
        <div className="flex items-center gap-0.5 mx-auto">
          {WORKSPACES.map((ws) => (
            <button
              key={ws.id}
              onClick={() => dispatch({ type: "SET_WORKSPACE", payload: ws.id })}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                state.activeWorkspace === ws.id
                  ? "bg-gray-900 text-white"
                  : "text-gray-500 hover:text-gray-800 hover:bg-gray-100"
              }`}
            >
              {ws.label}
            </button>
          ))}
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2 ml-auto flex-shrink-0">
          {/* Undo / Redo */}
          <div className="flex items-center border border-gray-200 rounded-md overflow-hidden">
            <button
              onClick={() => dispatch({ type: "UNDO" })}
              disabled={state.historyIndex < 0}
              title="Annuler (Ctrl+Z)"
              className="px-2 py-1.5 text-gray-500 hover:bg-gray-50 disabled:opacity-30 transition-colors"
            >
              <Undo2 size={13} />
            </button>
            <button
              onClick={() => dispatch({ type: "REDO" })}
              disabled={state.historyIndex >= state.history.length - 1}
              title="Rétablir (Ctrl+Y)"
              className="px-2 py-1.5 text-gray-500 hover:bg-gray-50 disabled:opacity-30 transition-colors border-l border-gray-200"
            >
              <Redo2 size={13} />
            </button>
          </div>

          {/* Autosave / dirty indicator */}
          {autosaveStatus === "saving" && (
            <span className="flex items-center gap-1 text-xs text-gray-400 px-2 py-0.5">
              <div className="w-2.5 h-2.5 border border-gray-400 border-t-transparent rounded-full animate-spin" />
              Sauvegarde...
            </span>
          )}
          {autosaveStatus === "saved" && (
            <span className="text-xs text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
              Sauvegardé ✓
            </span>
          )}
          {autosaveStatus === "error" && (
            <span className="text-xs text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
              Erreur de sauvegarde
            </span>
          )}
          {autosaveStatus === "idle" && state.isDirty && (
            <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
              Non sauvegardé
            </span>
          )}

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={saving || !state.isDirty}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-40"
          >
            {saving ? (
              <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
            ) : state.isDirty ? (
              <Save size={12} />
            ) : (
              <Check size={12} className="text-green-600" />
            )}
            {saving ? "Sauvegarde..." : "Enregistrer"}
          </button>

          {/* Historique des versions */}
          <SiteVersionHistory siteId={siteId} />

          {/* Theme library */}
          <button
            onClick={() => setThemeLibraryOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
            title="Bibliothèque de thèmes"
          >
            <Palette size={12} />
            Thèmes
          </button>

          {/* Save as theme */}
          <button
            onClick={() => setShowSaveTheme(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
            title="Enregistrer comme thème réutilisable"
          >
            <Bookmark size={12} />
            Sauver
          </button>

          {/* Share */}
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors">
            <Share2 size={12} />
            Share
          </button>

          {/* Export */}
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors">
            <Upload size={12} />
            Export
          </button>

          {/* Publish / Upgrade */}
          <div className="relative">
            <button
              onClick={() => setShowPublish(!showPublish)}
              className="relative flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-gray-900 text-white rounded-md hover:bg-gray-700 transition-colors"
            >
              <Globe size={12} />
              {isPublished ? "Republier" : "Publier"}
              {hasDraftChanges && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-400 rounded-full border-2 border-white" title="Modifications non publiées" />
              )}
            </button>
            {showPublish && (
              <div className="absolute top-full right-0 mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-xl p-4 z-50">
                <div className="text-sm font-semibold mb-1 text-gray-900">
                  {isPublished ? "Publier les modifications" : "Publier le site"}
                </div>
                {isPublished && publishedSubdomain && (
                  <p className="text-[11px] text-gray-400 mb-3">
                    Actuellement en ligne sur{" "}
                    <a
                      href={`https://${publishedSubdomain}.${process.env.NEXT_PUBLIC_SITE_DOMAIN ?? "samadigitalstudio.fr"}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:underline"
                    >
                      {publishedSubdomain}.{process.env.NEXT_PUBLIC_SITE_DOMAIN ?? "samadigitalstudio.fr"}
                    </a>
                  </p>
                )}
                {hasDraftChanges && (
                  <div className="flex items-start gap-2 p-2 mb-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <span className="text-amber-500 text-[11px] leading-tight">⚠ Des modifications non publiées existent. Publiez pour les mettre en ligne.</span>
                  </div>
                )}
                <div className="flex items-center gap-1 mb-3">
                  <input
                    type="text"
                    value={publishDomain}
                    onChange={(e) => setPublishDomain(e.target.value.replace(/[^a-z0-9-]/g, ""))}
                    placeholder="mon-site"
                    className="flex-1 bg-gray-50 border border-gray-200 rounded px-3 py-2 text-xs text-gray-900 font-mono focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-xs text-gray-400">.{process.env.NEXT_PUBLIC_SITE_DOMAIN ?? "samadigitalstudio.fr"}</span>
                </div>
                <button
                  onClick={handlePublish}
                  disabled={publishing || !publishDomain.trim()}
                  className="w-full py-2 text-xs font-semibold bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
                >
                  {publishing ? "Publication en cours…" : isPublished ? "Mettre à jour le site live" : "Publier"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─ Workspace ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {state.activeWorkspace === "sitemap" && (
          <SitemapWorkspace
            siteId={siteId}
            enterpriseId={enterpriseId}
            availableSections={initialSections}
          />
        )}
        {state.activeWorkspace === "wireframe" && (
          <WireframeWorkspace
            sectionDefs={sectionDefs}
            availableSections={initialSections}
            onRegenerateSection={handleRegenerateSection}
          />
        )}
        {state.activeWorkspace === "style-guide" && (
          <StyleGuideWorkspace sectionDefs={sectionDefs} />
        )}
        {state.activeWorkspace === "design" && (
          <DesignWorkspace
            sectionDefs={sectionDefs}
            onRegenerateSection={handleRegenerateSection}
          />
        )}
      </div>
    </div>
  );
}

