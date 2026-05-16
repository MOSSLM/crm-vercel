"use client";

import React from "react";
import {
  Save, Globe, Check, Share2, Upload,
  Building2, ChevronDown, Search, Bookmark, Palette, X, Loader2,
  Undo2, Redo2, ArrowUpDown, AlertTriangle,
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
import "./site-builder-skin.css";
import { AlertSoft, Btn, ModalBody, ModalFt, ModalHd, ModalShell, Pop, Seg, TopChip, cx } from "./skin-primitives";

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
  }, [open, companies.length, loadCompanies]);

  React.useEffect(() => {
    if (currentEnterpriseId && !currentName) loadCompanies();
  }, [currentEnterpriseId, currentName, loadCompanies]);

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const filtered = React.useMemo(() => {
    const matched = companies.filter((c) => c.nom.toLowerCase().includes(search.toLowerCase()));
    if (sortByLm) {
      return [...matched].sort((a, b) => {
        if (a.pret_pour_lm === b.pret_pour_lm) return a.nom.localeCompare(b.nom);
        return a.pret_pour_lm ? -1 : 1;
      });
    }
    return matched;
  }, [companies, search, sortByLm]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <TopChip onClick={() => setOpen(!open)} empty={!currentName} aria-expanded={open}>
        <Building2 size={11} />
        <span className="truncate">{currentName || "Lier une entreprise"}</span>
        <ChevronDown size={10} style={{ flexShrink: 0, opacity: 0.6 }} />
      </TopChip>
      {open && (
        <Pop style={{ top: "100%", left: 0, marginTop: 4, minWidth: 288 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: 8, borderBottom: "1px solid var(--border)" }}>
            <div style={{ position: "relative", flex: 1 }}>
              <Search size={11} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--text-4)" }} />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher une entreprise…"
                className="input"
                style={{ paddingLeft: 24, height: 26, fontSize: 12 }}
              />
            </div>
            <Btn
              size="sm"
              variant={sortByLm ? "subtle" : "outline"}
              onClick={() => setSortByLm((v) => !v)}
              title={sortByLm ? "Tri : Prêts LM en premier" : "Tri : A–Z"}
            >
              <ArrowUpDown size={10} />
              {sortByLm ? "LM" : "A–Z"}
            </Btn>
          </div>
          <div style={{ maxHeight: 240, overflow: "auto", padding: "4px 0" }}>
            {loading && (
              <div style={{ display: "flex", justifyContent: "center", padding: 16 }}>
                <Loader2 size={14} className="animate-spin" style={{ color: "var(--text-4)" }} />
              </div>
            )}
            {!loading && currentEnterpriseId && (
              <button
                onClick={() => { onSelect(null, ""); setCurrentName(""); setOpen(false); }}
                className="btn ghost"
                style={{ width: "100%", justifyContent: "flex-start", height: 28, padding: "0 12px", borderRadius: 0 }}
              >
                <X size={10} /> Aucune entreprise
              </button>
            )}
            {!loading && filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => { onSelect(c.id, c.nom); setCurrentName(c.nom); setOpen(false); setSearch(""); }}
                className="btn ghost"
                style={{
                  width: "100%",
                  justifyContent: "flex-start",
                  height: 28,
                  padding: "0 12px",
                  borderRadius: 0,
                  color: c.id === currentEnterpriseId ? "var(--accent-2)" : undefined,
                  fontWeight: c.id === currentEnterpriseId ? 600 : 500,
                }}
              >
                <Building2 size={10} style={{ color: "var(--text-4)", flexShrink: 0 }} />
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "left" }}>{c.nom}</span>
                {c.pret_pour_lm && <span className="pill ok" style={{ height: 16, padding: "0 5px", fontSize: 9 }}>LM</span>}
                {c.id === currentEnterpriseId && <Check size={11} style={{ color: "var(--accent)" }} />}
              </button>
            ))}
            {!loading && filtered.length === 0 && (
              <p style={{ fontSize: 11, color: "var(--text-4)", textAlign: "center", padding: 12, margin: 0 }}>Aucune entreprise trouvée</p>
            )}
          </div>
          {!loading && companies.length > 0 && (
            <div style={{ padding: "6px 12px", borderTop: "1px solid var(--border)", fontSize: 10, color: "var(--text-4)", fontFamily: "var(--font-mono)" }}>
              {filtered.length} / {companies.length} entreprises
            </div>
          )}
        </Pop>
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
    <div ref={ref} style={{ position: "relative" }}>
      <TopChip onClick={() => setOpen(!open)} title="Lier un lead magnet project" empty={!current}>
        <span className="truncate">{loading ? "…" : label}</span>
        <ChevronDown size={10} style={{ flexShrink: 0, opacity: 0.6 }} />
      </TopChip>
      {open && (
        <Pop style={{ top: "100%", left: 0, marginTop: 4, minWidth: 220 }}>
          <div style={{ padding: 4, maxHeight: 240, overflow: "auto" }}>
            <button
              onClick={() => { onSelect(null); setOpen(false); }}
              className="btn ghost"
              style={{ width: "100%", justifyContent: "flex-start", height: 28 }}
            >
              — Aucun projet
            </button>
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => { onSelect(p.id); setOpen(false); }}
                className="btn ghost"
                style={{
                  width: "100%",
                  justifyContent: "flex-start",
                  height: 28,
                  fontWeight: p.id === currentProjectId ? 600 : 500,
                  color: p.id === currentProjectId ? "var(--text)" : "var(--text-2)",
                }}
              >
                <span style={{ fontWeight: 600 }}>{p.override_city ?? p.override_location ?? p.id.slice(0, 8)}</span>
                {p.override_entreprise_name && (
                  <span style={{ color: "var(--text-4)", fontSize: 11 }}>· {p.override_entreprise_name}</span>
                )}
                {p.statut && <span className="pill" style={{ marginLeft: "auto" }}>{p.statut}</span>}
              </button>
            ))}
            {!loading && projects.length === 0 && (
              <p style={{ fontSize: 11, color: "var(--text-4)", textAlign: "center", padding: 12, margin: 0 }}>Aucun projet trouvé</p>
            )}
          </div>
        </Pop>
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
    <ModalShell open={open} onClose={onClose} size="sm">
      <ModalHd
        icon={<Bookmark size={14} />}
        title="Enregistrer comme thème"
        subtitle="Réutilise cette configuration sur un autre site"
        right={<Btn variant="ghost" size="sm" icon onClick={onClose}><X size={13} /></Btn>}
      />
      <ModalBody>
        <div className="field">
          <div className="field-label">Nom du thème <span className="req">*</span></div>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Mon thème pro"
            className="input"
          />
        </div>
        <div className="field">
          <div className="field-label">Description <span className="hint">optionnel</span></div>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Un thème professionnel pour…"
            className="input"
          />
        </div>
      </ModalBody>
      <ModalFt>
        <span className="grow" />
        <Btn variant="outline" onClick={onClose}>Annuler</Btn>
        <Btn variant="primary" onClick={handleSave} disabled={saving || !name.trim()}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </Btn>
      </ModalFt>
    </ModalShell>
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
  const [hasDraftChanges, setHasDraftChanges] = React.useState(false);
  void publishedAt;

  const { status: autosaveStatus } = useSiteAutosave({
    siteId,
    state,
    onSaved: () => {
      dispatch({ type: "MARK_SAVED" });
      if (isPublished) setHasDraftChanges(true);
    },
  });

  useGoogleFonts([state.styleGuide.fonts.heading, state.styleGuide.fonts.body]);
  const [publishDomain, setPublishDomain] = React.useState(publishedSubdomain ?? "");
  const [showPublish, setShowPublish] = React.useState(false);
  const publishRef = React.useRef<HTMLDivElement>(null);
  const [enterpriseId, setEnterpriseId] = React.useState<number | undefined>(initialEnterpriseId);
  const [enterpriseName, setEnterpriseName] = React.useState<string>("");
  const [projectId, setProjectId] = React.useState<string | undefined>(initialProjectId);
  const [showSaveTheme, setShowSaveTheme] = React.useState(false);
  const [themeLibraryOpen, setThemeLibraryOpen] = React.useState(false);

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

  React.useEffect(() => {
    if (initialEnterpriseId) fetchVariables(initialEnterpriseId, initialProjectId);
  }, [initialEnterpriseId, initialProjectId, fetchVariables]);

  // Close publish popover on outside click
  React.useEffect(() => {
    if (!showPublish) return;
    const handler = (e: MouseEvent) => {
      if (publishRef.current && !publishRef.current.contains(e.target as Node)) setShowPublish(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showPublish]);

  const sectionDefs = React.useMemo(
    () => Object.fromEntries(initialSections.map((s) => [s.id, s])),
    [initialSections],
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const handleSelectCompany = async (id: number | null, nom: string) => {
    setEnterpriseId(id ?? undefined);
    setEnterpriseName(id ? nom : "");
    setProjectId(undefined);
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

  const currentWorkspace = WORKSPACES.find((w) => w.id === state.activeWorkspace);
  const savedClass = autosaveStatus === "saving" ? "saved saving"
    : autosaveStatus === "error" ? "saved dirty"
    : state.isDirty ? "saved dirty"
    : "saved";
  const savedText = autosaveStatus === "saving" ? "Sauvegarde…"
    : autosaveStatus === "error" ? "Erreur"
    : state.isDirty ? "Non sauvé"
    : "Sauvegardé";

  return (
    <div className="sb-skin" data-workspace={state.activeWorkspace}>
      <div className="sb-app">

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

      {/* ─ Topbar ─────────────────────────────────────────────────────────── */}
      <div className="topbar">

        {/* Left group: brand + breadcrumb + autosave */}
        <div className="left-group">
          <div className="brand">
            <div className="brand-mark">S</div>
          </div>
          <div className="crumbs">
            {enterpriseName && <><span>{enterpriseName}</span><span className="sep">/</span></>}
            <span className="cur">{siteName}</span>
            {currentWorkspace && <><span className="sep">/</span><span style={{ color: "var(--text-3)" }}>{currentWorkspace.label}</span></>}
          </div>
          <span className={savedClass} aria-live="polite">
            <i />{savedText}
          </span>
          <span style={{ width: 6 }} />
          <CompanyDropdown currentEnterpriseId={enterpriseId} onSelect={handleSelectCompany} />
          <ProjectDropdown enterpriseId={enterpriseId} currentProjectId={projectId} onSelect={handleSelectProject} />
        </div>

        {/* Center workspace tabs */}
        <div className="tabs" role="tablist">
          {WORKSPACES.map((ws) => (
            <button
              key={ws.id}
              role="tab"
              aria-selected={state.activeWorkspace === ws.id ? "true" : "false"}
              onClick={() => dispatch({ type: "SET_WORKSPACE", payload: ws.id })}
              className="tab"
            >
              {ws.label}
            </button>
          ))}
        </div>

        {/* Right actions */}
        <div className="right">
          <Seg compact>
            <button
              onClick={() => dispatch({ type: "UNDO" })}
              disabled={state.historyIndex < 0}
              title="Annuler (Ctrl+Z)"
            >
              <Undo2 size={12} />
            </button>
            <button
              onClick={() => dispatch({ type: "REDO" })}
              disabled={state.historyIndex >= state.history.length - 1}
              title="Rétablir (Ctrl+Y)"
            >
              <Redo2 size={12} />
            </button>
          </Seg>

          <SiteVersionHistory siteId={siteId} />

          <Btn variant="ghost" size="sm" onClick={() => setThemeLibraryOpen(true)} title="Bibliothèque de thèmes">
            <Palette size={12} />
            Thèmes
          </Btn>

          <Btn variant="ghost" size="sm" onClick={() => setShowSaveTheme(true)} title="Enregistrer comme thème">
            <Bookmark size={12} />
            Sauver
          </Btn>

          <Btn variant="outline" size="sm" onClick={handleSave} disabled={saving || !state.isDirty}>
            {saving ? (
              <Loader2 size={12} className="animate-spin" />
            ) : state.isDirty ? (
              <Save size={12} />
            ) : (
              <Check size={12} style={{ color: "var(--ok)" }} />
            )}
            {saving ? "Sauvegarde…" : "Enregistrer"}
          </Btn>

          <Btn variant="ghost" size="sm">
            <Share2 size={12} />
            Partager
          </Btn>

          <Btn variant="ghost" size="sm">
            <Upload size={12} />
            Export
          </Btn>

          <div ref={publishRef} style={{ position: "relative" }}>
            <Btn variant="accent" size="sm" onClick={() => setShowPublish((v) => !v)}>
              <Globe size={12} />
              {isPublished ? "Republier" : "Publier"}
              {hasDraftChanges && (
                <span
                  style={{
                    position: "absolute",
                    top: -3,
                    right: -3,
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "var(--warn)",
                    border: "2px solid var(--bg)",
                  }}
                  title="Modifications non publiées"
                />
              )}
            </Btn>
            {showPublish && (
              <Pop style={{ top: "100%", right: 0, marginTop: 6, width: 320, padding: 14 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)", marginBottom: 2 }}>
                  {isPublished ? "Publier les modifications" : "Publier le site"}
                </div>
                {isPublished && publishedSubdomain && (
                  <div style={{ fontSize: 11, color: "var(--text-4)", marginBottom: 10 }}>
                    En ligne sur{" "}
                    <a
                      href={`https://${publishedSubdomain}.${process.env.NEXT_PUBLIC_SITE_DOMAIN ?? "samadigitalstudio.fr"}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "var(--info)", textDecoration: "none" }}
                    >
                      {publishedSubdomain}.{process.env.NEXT_PUBLIC_SITE_DOMAIN ?? "samadigitalstudio.fr"}
                    </a>
                  </div>
                )}
                {hasDraftChanges && (
                  <AlertSoft tone="warn" className="mb-2">
                    <AlertTriangle size={12} />
                    <span>Des modifications non publiées existent.</span>
                  </AlertSoft>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "10px 0" }}>
                  <input
                    type="text"
                    value={publishDomain}
                    onChange={(e) => setPublishDomain(e.target.value.replace(/[^a-z0-9-]/g, ""))}
                    placeholder="mon-site"
                    className="input mono"
                  />
                  <span style={{ fontSize: 11, color: "var(--text-4)", fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>
                    .{process.env.NEXT_PUBLIC_SITE_DOMAIN ?? "samadigitalstudio.fr"}
                  </span>
                </div>
                <Btn variant="primary" onClick={handlePublish} disabled={publishing || !publishDomain.trim()} style={{ width: "100%", justifyContent: "center" }}>
                  {publishing ? <><Loader2 size={12} className="animate-spin" /> Publication…</> : isPublished ? "Mettre à jour le site" : "Publier"}
                </Btn>
              </Pop>
            )}
          </div>
        </div>
      </div>

      {/* ─ Workspace body ────────────────────────────────────────────────── */}
      <div className={cx("sb-body", "sb-body--" + state.activeWorkspace)} style={{ flex: "1 1 auto", minHeight: 0, display: "flex", overflow: "hidden" }}>
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
            availableSections={initialSections}
            onRegenerateSection={handleRegenerateSection}
          />
        )}
      </div>
      </div>
    </div>
  );
}
