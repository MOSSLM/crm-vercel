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
  const [serviceTags, setServiceTags] = React.useState<string[]>([]);

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
              <Label className="text-zinc-300">HTML / CSS de la page</Label>
              <Textarea
                value={impHtml}
                onChange={(e) => setImpHtml(e.target.value)}
                placeholder="Collez ici le HTML (Tailwind de préférence) généré avec Claude ou exporté de Figma…"
                className="bg-zinc-800 border-zinc-700 text-white font-mono text-xs h-56"
              />
              <p className="text-[11px] text-zinc-500">
                L&apos;IA découpe la page en sections et les convertit en React, fidèlement
                (mode brut). Astuce : encadrez chaque section avec
                <code className="mx-1 text-zinc-400">data-section</code>/
                <code className="text-zinc-400">data-service-tag</code> pour un découpage fiable.
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
