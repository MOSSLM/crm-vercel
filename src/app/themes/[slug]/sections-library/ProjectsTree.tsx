"use client";

import React from "react";
import {
  ChevronRight,
  ChevronDown,
  FolderPlus,
  Folder,
  Upload,
  Rocket,
  Trash2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { authedFetch } from "@/utils/authedFetch";
import type { ThemeSection } from "./types";

interface ProjectPageRef {
  section_id: string;
  service_tag?: string | null;
}
interface ProjectPage {
  id: string;
  slug: string;
  title: string;
  sort_order: number;
  sections: ProjectPageRef[];
}
interface Project {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  pages: ProjectPage[];
}

/** Reference to a stored import visual (rendered screenshot / PDF). */
interface ImportVisualRef {
  type: "image" | "pdf";
  media_type: string;
  storage_path: string;
}

interface Props {
  themeSlug: string;
  sections: ThemeSection[];
  onSelectSection: (section: ThemeSection) => void;
  /** Refresh the parent's flat section list after an import. */
  onSectionsChanged: () => void;
}

// Kept in sync with resolveImportModel() in @/lib/ai/import-page-sections.
const IMPORT_MODEL_OPTIONS = [
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (rapide)" },
  { id: "claude-opus-4-7", label: "Claude Opus 4.7 (qualité supérieure)" },
];

export default function ProjectsTree({
  themeSlug,
  sections,
  onSelectSection,
  onSectionsChanged,
}: Props) {
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [collapsedProjects, setCollapsedProjects] = React.useState<Set<string>>(new Set());
  const [collapsedPages, setCollapsedPages] = React.useState<Set<string>>(new Set());
  const [sectionsOpen, setSectionsOpen] = React.useState(true);

  // Dialog state
  const [createOpen, setCreateOpen] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  const [importTarget, setImportTarget] = React.useState<Project | null>(null);
  const [impTitle, setImpTitle] = React.useState("");
  const [impSlug, setImpSlug] = React.useState("");
  const [impHtml, setImpHtml] = React.useState("");
  const [impTag, setImpTag] = React.useState("");
  const [impModel, setImpModel] = React.useState("claude-sonnet-4-6");
  const [importing, setImporting] = React.useState(false);
  const [impMode, setImpMode] = React.useState<"url" | "html">("url");
  const [impUrl, setImpUrl] = React.useState("");
  const [fetchingUrl, setFetchingUrl] = React.useState(false);
  const [fetchInfo, setFetchInfo] = React.useState<{
    method: string;
    warnings: string[];
    chars: number;
  } | null>(null);
  const [fetchedAssets, setFetchedAssets] = React.useState<{ css: string; links: string[] } | null>(null);
  const [serviceTags, setServiceTags] = React.useState<string[]>([]);
  // Visual reference (rendered screenshot/PDF) given to the AI for fidelity.
  const [visual, setVisual] = React.useState<ImportVisualRef | null>(null);
  const [visualSource, setVisualSource] = React.useState<"auto" | "manual" | null>(null);
  const [renderingAuto, setRenderingAuto] = React.useState(false);
  const [uploadingVisual, setUploadingVisual] = React.useState(false);
  const visualInputRef = React.useRef<HTMLInputElement | null>(null);
  // Manual visual always wins over a later-arriving auto render.
  const visualSourceRef = React.useRef<"auto" | "manual" | null>(null);
  React.useEffect(() => {
    visualSourceRef.current = visualSource;
  }, [visualSource]);

  const [deleteTarget, setDeleteTarget] = React.useState<Project | null>(null);
  const [instantiatingId, setInstantiatingId] = React.useState<string | null>(null);

  const sectionMap = React.useMemo(
    () => new Map(sections.map((s) => [s.section_id, s])),
    [sections],
  );

  const fetchProjects = React.useCallback(async () => {
    if (!themeSlug) return;
    try {
      const res = await authedFetch(`/api/themes/${themeSlug}/projects`);
      if (!res.ok) return;
      setProjects(await res.json());
    } catch {
      /* silent — projects are optional */
    }
  }, [themeSlug]);

  React.useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // Catalogue of service tags (distinct enterprise service_tags) for the dropdown.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authedFetch(`/api/site-builder/service-tags`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data.tags)) setServiceTags(data.tags as string[]);
      } catch {
        /* optional — leave the dropdown with just "Aucun service" */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = (set: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) =>
    set((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await authedFetch(`/api/themes/${themeSlug}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success(`Projet "${newName.trim()}" créé`);
      setCreateOpen(false);
      setNewName("");
      fetchProjects();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setCreating(false);
    }
  };

  const openImport = (project: Project) => {
    setImportTarget(project);
    setImpTitle("");
    setImpSlug("");
    setImpHtml("");
    setImpTag("");
    setImpModel("claude-sonnet-4-6");
    setImpMode("url");
    setImpUrl("");
    setFetchInfo(null);
    setFetchedAssets(null);
    setVisual(null);
    setVisualSource(null);
  };

  /**
   * Best-effort: render the page via the external provider to capture a visual
   * (and higher-fidelity rendered HTML). Silent on failure / not-configured —
   * manual upload remains available. A manual visual is never overwritten.
   */
  const tryAutoRender = async (url: string) => {
    setRenderingAuto(true);
    try {
      const res = await authedFetch(`/api/site-builder/screenshot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (res.status === 501) return; // provider not configured
      const data = await res.json();
      if (!res.ok) return;
      if (visualSourceRef.current === "manual") return;
      if (data.visual) {
        setVisual(data.visual as ImportVisualRef);
        setVisualSource("auto");
      }
      if (data.renderedHtml) setImpHtml(data.renderedHtml as string);
    } catch {
      /* silent — manual upload remains available */
    } finally {
      setRenderingAuto(false);
    }
  };

  const handleUploadVisual = async (file: File) => {
    setUploadingVisual(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await authedFetch(`/api/site-builder/import-visual`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setVisual(data as ImportVisualRef);
      setVisualSource("manual");
      toast.success("Visuel ajouté");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Échec de l'envoi du visuel");
    } finally {
      setUploadingVisual(false);
    }
  };

  const handleFetchUrl = async () => {
    if (!impUrl.trim()) return;
    setFetchingUrl(true);
    try {
      const res = await authedFetch(`/api/site-builder/fetch-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: impUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.hint ? `${data.error} ${data.hint}` : data.error);
      setImpHtml(data.html ?? "");
      setFetchedAssets({ css: data.css ?? "", links: data.links ?? [] });
      if (data.title && !impTitle.trim()) setImpTitle(data.title);
      setFetchInfo({
        method: data.method,
        warnings: data.warnings ?? [],
        chars: (data.html ?? "").length,
      });
      toast.success(`Page récupérée (${Math.round((data.html ?? "").length / 1000)} ko)`);
      // Fire-and-forget visual capture (rendered page) — improves fidelity when
      // the render provider is configured; otherwise silently a no-op.
      void tryAutoRender(impUrl.trim());
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Échec de récupération");
    } finally {
      setFetchingUrl(false);
    }
  };

  const handleImport = async () => {
    if (!importTarget || !impTitle.trim() || !impHtml.trim()) return;
    setImporting(true);
    try {
      const res = await authedFetch(
        `/api/themes/${themeSlug}/projects/${importTarget.id}/import-page`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            page_title: impTitle.trim(),
            page_slug: impSlug.trim(),
            html: impHtml,
            service_tag: impTag.trim() || null,
            model: impModel,
            ...(fetchedAssets ? { css: fetchedAssets.css, links: fetchedAssets.links } : {}),
            ...(visual ? { visuals: [visual] } : {}),
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`${data.sections_created} section(s) importée(s)`);
      setImportTarget(null);
      await fetchProjects();
      onSectionsChanged();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Échec de l'import");
    } finally {
      setImporting(false);
    }
  };

  const handleInstantiate = async (project: Project) => {
    setInstantiatingId(project.id);
    try {
      const res = await authedFetch(
        `/api/themes/${themeSlug}/projects/${project.id}/instantiate`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`Site créé (${data.pages} page(s), ${data.sections} section(s))`, {
        action: {
          label: "Ouvrir",
          onClick: () => window.open(`/site-builder/${data.siteId}`, "_blank"),
        },
      });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Échec de l'instanciation");
    } finally {
      setInstantiatingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await authedFetch(
        `/api/themes/${themeSlug}/projects/${deleteTarget.id}`,
        { method: "DELETE" },
      );
      if (!res.ok && res.status !== 204) throw new Error("Erreur de suppression");
      toast.success(`Projet "${deleteTarget.name}" supprimé`);
      setDeleteTarget(null);
      fetchProjects();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  };

  return (
    <div className="border-b border-zinc-800 pb-1">
      {/* Section header */}
      <div className="flex items-center justify-between px-3 py-1.5">
        <button
          className="flex items-center gap-1 text-xs font-semibold text-zinc-400 uppercase tracking-wider hover:text-zinc-200"
          onClick={() => setSectionsOpen((o) => !o)}
        >
          {sectionsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          Projets
        </button>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-zinc-400 hover:text-white"
          onClick={() => setCreateOpen(true)}
          title="Nouveau projet"
        >
          <FolderPlus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {sectionsOpen && (
        <div>
          {projects.length === 0 && (
            <div className="px-4 py-3 text-center text-zinc-600 text-[11px] leading-relaxed">
              Aucun projet. Créez-en un pour importer
              <br />
              des pages HTML (Claude/Figma) en sections.
            </div>
          )}

          {projects.map((project) => {
            const projCollapsed = collapsedProjects.has(project.id);
            return (
              <div key={project.id}>
                {/* Project row */}
                <div className="group flex items-center gap-1 px-3 py-1 hover:bg-zinc-800/40">
                  <button
                    className="flex items-center gap-1 flex-1 min-w-0 text-left"
                    onClick={() => toggle(setCollapsedProjects, project.id)}
                  >
                    {projCollapsed ? (
                      <ChevronRight className="h-3 w-3 flex-shrink-0 text-zinc-500" />
                    ) : (
                      <ChevronDown className="h-3 w-3 flex-shrink-0 text-zinc-500" />
                    )}
                    <Folder className="h-3 w-3 flex-shrink-0 text-amber-400/70" />
                    <span className="text-xs text-zinc-300 truncate">{project.name}</span>
                  </button>
                  <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      className="p-0.5 rounded text-zinc-500 hover:text-blue-300"
                      onClick={() => openImport(project)}
                      title="Importer une page HTML"
                    >
                      <Upload className="h-3 w-3" />
                    </button>
                    <button
                      className="p-0.5 rounded text-zinc-500 hover:text-emerald-300 disabled:opacity-40"
                      onClick={() => handleInstantiate(project)}
                      disabled={instantiatingId === project.id || project.pages.length === 0}
                      title="Créer un site à partir de ce projet"
                    >
                      {instantiatingId === project.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Rocket className="h-3 w-3" />
                      )}
                    </button>
                    <button
                      className="p-0.5 rounded text-zinc-500 hover:text-red-400"
                      onClick={() => setDeleteTarget(project)}
                      title="Supprimer le projet"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                {/* Pages */}
                {!projCollapsed &&
                  project.pages.map((page) => {
                    const pageCollapsed = collapsedPages.has(page.id);
                    return (
                      <div key={page.id}>
                        <button
                          className="flex items-center gap-1 w-full pl-7 pr-2 py-0.5 text-left hover:bg-zinc-800/30"
                          onClick={() => toggle(setCollapsedPages, page.id)}
                        >
                          {pageCollapsed ? (
                            <ChevronRight className="h-2.5 w-2.5 flex-shrink-0 text-zinc-600" />
                          ) : (
                            <ChevronDown className="h-2.5 w-2.5 flex-shrink-0 text-zinc-600" />
                          )}
                          <span className="text-[11px] text-zinc-400 truncate">{page.title}</span>
                          <span className="text-[10px] text-zinc-600 ml-auto flex-shrink-0">
                            {page.sections.length}
                          </span>
                        </button>
                        {!pageCollapsed &&
                          page.sections.map((ref, i) => {
                            const sec = sectionMap.get(ref.section_id);
                            return (
                              <button
                                key={`${page.id}:${ref.section_id}:${i}`}
                                className="flex items-center gap-1.5 w-full pl-11 pr-2 py-0.5 text-left text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-200 disabled:opacity-40"
                                onClick={() => sec && onSelectSection(sec)}
                                disabled={!sec}
                                title={sec ? sec.name : "Section introuvable — rafraîchissez"}
                              >
                                <span className="font-mono text-[10px] truncate">
                                  {sec?.name ?? ref.section_id}
                                </span>
                                {ref.service_tag && (
                                  <span className="text-[9px] text-amber-400/60 ml-auto flex-shrink-0">
                                    #{ref.service_tag}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                      </div>
                    );
                  })}
              </div>
            );
          })}
        </div>
      )}

      {/* Create project dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white">
          <DialogHeader>
            <DialogTitle>Nouveau projet</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label className="text-zinc-300">Nom du projet</Label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Landing Q4, Template SaaS…"
              className="bg-zinc-800 border-zinc-700 text-white"
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
            <p className="text-[11px] text-zinc-500">
              Un projet regroupe plusieurs pages importées (HTML Claude/Figma) en sections
              cohérentes, instanciables ensuite en site multi-pages.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)} className="text-zinc-400">
              Annuler
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {creating ? "Création…" : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import page dialog */}
      <Dialog open={!!importTarget} onOpenChange={(o) => !o && setImportTarget(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle>Importer une page — {importTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex gap-1 rounded-md bg-zinc-800 border border-zinc-700 p-1 w-fit">
              <button
                type="button"
                onClick={() => setImpMode("url")}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  impMode === "url" ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Depuis une URL
              </button>
              <button
                type="button"
                onClick={() => {
                  setImpMode("html");
                  setFetchedAssets(null);
                }}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  impMode === "html" ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Coller le HTML
              </button>
            </div>

            {impMode === "url" && (
              <div className="space-y-1.5">
                <Label className="text-zinc-300">URL de la page</Label>
                <div className="flex gap-2">
                  <Input
                    value={impUrl}
                    onChange={(e) => {
                      setImpUrl(e.target.value);
                      setFetchedAssets(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleFetchUrl();
                      }
                    }}
                    placeholder="https://exemple.fr/"
                    className="bg-zinc-800 border-zinc-700 text-white"
                  />
                  <Button
                    onClick={handleFetchUrl}
                    disabled={fetchingUrl || !impUrl.trim()}
                    variant="secondary"
                    className="shrink-0"
                  >
                    {fetchingUrl ? (
                      <span className="flex items-center gap-1.5">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Récupération…
                      </span>
                    ) : (
                      "Récupérer"
                    )}
                  </Button>
                </div>
                {fetchInfo && (
                  <p className="text-[11px] text-emerald-400/80">
                    ✓ Page récupérée ({Math.round(fetchInfo.chars / 1000)} ko).
                    {fetchInfo.warnings.length > 0 && (
                      <span className="text-amber-400/80"> ⚠ {fetchInfo.warnings.join(" · ")}</span>
                    )}
                  </p>
                )}
                <p className="text-[11px] text-zinc-500">
                  Récupération directe (sans navigateur). Si le site bloque les robots ou nécessite
                  JavaScript, basculez sur « Coller le HTML ».
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-zinc-300">Titre de la page</Label>
                <Input
                  value={impTitle}
                  onChange={(e) => setImpTitle(e.target.value)}
                  placeholder="Accueil"
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-300">Chemin (optionnel)</Label>
                <Input
                  value={impSlug}
                  onChange={(e) => setImpSlug(e.target.value)}
                  placeholder="/ ou /a-propos"
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-zinc-300">Modèle IA</Label>
                <select
                  value={impModel}
                  onChange={(e) => setImpModel(e.target.value)}
                  className="w-full h-9 rounded-md bg-zinc-800 border border-zinc-700 text-white text-sm px-2"
                >
                  {IMPORT_MODEL_OPTIONS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-300">Service</Label>
                <select
                  value={impTag}
                  onChange={(e) => setImpTag(e.target.value)}
                  className="w-full h-9 rounded-md bg-zinc-800 border border-zinc-700 text-white text-sm px-2"
                >
                  <option value="">Aucun service</option>
                  {serviceTags.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-300">Rendu visuel (fidélité)</Label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={visualInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUploadVisual(f);
                    e.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => visualInputRef.current?.click()}
                  disabled={uploadingVisual}
                >
                  {uploadingVisual ? (
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Envoi…
                    </span>
                  ) : (
                    "Ajouter une capture (PDF/image)"
                  )}
                </Button>
                {renderingAuto && (
                  <span className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                    <Loader2 className="h-3 w-3 animate-spin" /> Capture auto…
                  </span>
                )}
                {visual && !renderingAuto && (
                  <span className="text-[11px] text-emerald-400/80">
                    ✓ Visuel {visualSource === "manual" ? "importé" : "auto"} ({visual.type.toUpperCase()})
                  </span>
                )}
                {visual && (
                  <button
                    type="button"
                    className="text-[11px] text-zinc-500 hover:text-red-400"
                    onClick={() => {
                      setVisual(null);
                      setVisualSource(null);
                    }}
                  >
                    retirer
                  </button>
                )}
              </div>
              <p className="text-[11px] text-zinc-500">
                Une capture du rendu (idéalement un PDF pleine page paginé, ex. extension
                GoFullPage) aide l&apos;IA à reproduire fidèlement l&apos;apparence. En mode URL elle
                est générée automatiquement si le service de rendu est configuré ; sinon, ajoutez-la
                manuellement.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-zinc-300">
                {impMode === "url" ? "HTML récupéré (modifiable)" : "HTML / CSS de la page"}
              </Label>
              <Textarea
                value={impHtml}
                onChange={(e) => setImpHtml(e.target.value)}
                placeholder={
                  impMode === "url"
                    ? "Le HTML récupéré apparaîtra ici après « Récupérer »…"
                    : "Collez ici le HTML (Tailwind de préférence) généré avec Claude ou exporté de Figma…"
                }
                className="bg-zinc-800 border-zinc-700 text-white font-mono text-xs h-56"
              />
              <p className="text-[11px] text-zinc-500">
                L&apos;IA découpe la page en sections et les convertit en React, fidèlement (mode
                brut). Les URLs (images, CSS) sont absolutisées automatiquement ; le logo, le nom et
                les avis se lient à l&apos;entreprise à l&apos;import.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setImportTarget(null)} className="text-zinc-400">
              Annuler
            </Button>
            <Button
              onClick={handleImport}
              disabled={importing || !impTitle.trim() || !impHtml.trim()}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {importing ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Conversion…
                </span>
              ) : (
                "Importer"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-800 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le projet ?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Le projet <span className="font-mono text-red-400">{deleteTarget?.name}</span> et ses
              pages seront supprimés. Les sections créées par l&apos;import restent dans la
              bibliothèque (réutilisables).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700">
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
