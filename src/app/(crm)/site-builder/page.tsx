"use client";

import React from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Plus,
  Globe,
  Pencil,
  Trash2,
  Sparkles,
  LayoutGrid,
  FileArchive,
  Layers,
  CopyPlus,
  AlertTriangle,
} from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import { DesignImportDialog } from "@/components/site-builder/claude-design/DesignImportDialog";
import { MultiPageImportDialog } from "@/components/site-builder/claude-design/MultiPageImportDialog";
import { CreateDemoSiteDialog, type DemoTemplateRef } from "@/components/site-builder/claude-design/CreateDemoSiteDialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { SiteV2 } from "@/types";
import { authedFetch } from "@/utils/authedFetch";
import { SITE_DOMAIN } from "@/lib/site-domain";
import {
  ORIGIN_ALL,
  ORIGIN_NONE,
  filterDemosByTemplate,
  siteLabel,
  splitClaudeSpaces,
  templateOrigin,
  templateOriginLabel,
} from "@/lib/site-builder/claude-spaces";

/** The listing API now also returns the Claude-design discriminators. */
type SiteRow = SiteV2 & {
  id: string;
  name: string;
  is_claude_design?: boolean;
  is_template?: boolean;
  build_stage?: string | null;
  /** Template dont ce site est le clone — absent tant que la migration n'est pas passée. */
  source_template_id?: string | null;
};

const BUILD_STAGES: Record<string, string> = {
  a_faire: "À faire",
  en_cours: "En cours",
  a_verifier: "À vérifier",
  pret: "Prêt",
};

const SkeletonGrid = () => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
    {[...Array(3)].map((_, i) => (
      <div key={i} className="h-40 bg-muted animate-pulse rounded-xl" />
    ))}
  </div>
);

/** Lien public d'un site déployé — partagé par les deux types de cartes. */
function PublishedLink({ subdomain }: { subdomain?: string | null }) {
  if (!subdomain) return null;
  return (
    <a
      href={`https://${subdomain}.${SITE_DOMAIN}`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs text-blue-600 hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      {subdomain}.{SITE_DOMAIN} ↗
    </a>
  );
}

function DeleteButton({ onClick, title }: { onClick: () => void; title: string }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs gap-1"
      onClick={onClick}
      title={title}
    >
      <Trash2 className="h-3 w-3" />
    </Button>
  );
}

/* ── Sites « classiques » (thèmes + sections) ────────────────────────────── */

function SiteCard({ site, onDelete }: { site: SiteRow; onDelete: (site: SiteRow) => void }) {
  return (
    <Card className="p-5 hover:shadow-md transition-shadow group">
      <div className="flex items-start justify-between mb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Globe className={`h-5 w-5 ${site.is_published ? "text-primary" : "text-muted-foreground"}`} />
        </div>
        <div className="flex items-center gap-1.5">
          {site.is_template && (
            <Badge variant="outline" className="text-xs gap-1">
              <Layers className="h-3 w-3" />
              Template
            </Badge>
          )}
          <Badge variant={site.is_published ? "default" : "secondary"} className="text-xs">
            {site.is_published ? "Publié" : "Brouillon"}
          </Badge>
        </div>
      </div>
      <h3 className="font-semibold truncate mb-1">{siteLabel(site)}</h3>
      <PublishedLink subdomain={site.published_subdomain} />
      <div className="flex gap-2 mt-4">
        <Link href={`/site-builder/${site.id}`} className="flex-1">
          <Button variant="outline" size="sm" className="w-full gap-2 text-xs">
            <Pencil className="h-3 w-3" />
            Éditer
          </Button>
        </Link>
        <DeleteButton onClick={() => onDelete(site)} title="Supprimer ce site" />
      </div>
    </Card>
  );
}

/* ── Espace TEMPLATE ─────────────────────────────────────────────────────── */

function TemplateCard({
  template,
  demoCount,
  variantCount,
  onCreateDemo,
  onShowDemos,
  onDelete,
}: {
  template: SiteRow;
  demoCount: number;
  variantCount: number;
  onCreateDemo: (t: DemoTemplateRef) => void;
  onShowDemos: (templateId: string) => void;
  onDelete: (site: SiteRow) => void;
}) {
  const name = siteLabel(template);
  // Un template cloné depuis un autre template : c'est une variation du même
  // modèle, pas un import distinct.
  const isVariant = !!template.source_template_id;

  return (
    <Card className="p-5 hover:shadow-md transition-shadow border-primary/25">
      <div className="flex items-start justify-between mb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Layers className="h-5 w-5 text-primary" />
        </div>
        <div className="flex items-center gap-1.5">
          {isVariant && (
            <Badge variant="secondary" className="text-xs gap-1">
              <CopyPlus className="h-3 w-3" />
              Variante
            </Badge>
          )}
          <Badge variant="outline" className="text-xs gap-1 border-primary/40 text-primary">
            <Sparkles className="h-3 w-3" />
            Template
          </Badge>
        </div>
      </div>

      <h3 className="font-semibold truncate mb-1">{name}</h3>

      {demoCount > 0 ? (
        <button
          type="button"
          onClick={() => onShowDemos(template.id)}
          className="text-xs text-blue-600 hover:underline"
        >
          {demoCount} site{demoCount > 1 ? "s" : ""} démo créé{demoCount > 1 ? "s" : ""} ↗
        </button>
      ) : (
        <p className="text-xs text-muted-foreground">Aucun site démo pour l&apos;instant</p>
      )}
      {variantCount > 0 && (
        <p className="text-xs text-muted-foreground mt-0.5">
          {variantCount} variante{variantCount > 1 ? "s" : ""} de ce modèle
        </p>
      )}

      <div className="flex gap-2 mt-4">
        <Link href={`/site-builder/claude/${template.id}`} className="flex-1">
          <Button variant="outline" size="sm" className="w-full gap-2 text-xs">
            <Pencil className="h-3 w-3" />
            Éditer le modèle
          </Button>
        </Link>
        <Button
          size="sm"
          className="gap-1 text-xs"
          onClick={() => onCreateDemo({ id: template.id, name })}
          title="Cloner ce template en site démo pour une entreprise"
        >
          <Plus className="h-3 w-3" />
          Site démo
        </Button>
        <DeleteButton onClick={() => onDelete(template)} title="Supprimer ce template" />
      </div>
    </Card>
  );
}

/* ── Espace SITE DÉMO ────────────────────────────────────────────────────── */

function DemoSiteCard({
  site,
  nameById,
  onFilterTemplate,
  onDelete,
}: {
  site: SiteRow;
  nameById: Record<string, string>;
  onFilterTemplate: (templateId: string) => void;
  onDelete: (site: SiteRow) => void;
}) {
  const origin = templateOrigin(site, nameById);
  const stage = BUILD_STAGES[site.build_stage ?? ""] ?? null;

  return (
    <Card className="p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Globe className={`h-5 w-5 ${site.is_published ? "text-primary" : "text-muted-foreground"}`} />
        </div>
        <div className="flex items-center gap-1.5">
          {stage && (
            <Badge variant="secondary" className="text-xs">
              {stage}
            </Badge>
          )}
          <Badge variant={site.is_published ? "default" : "secondary"} className="text-xs">
            {site.is_published ? "Publié" : "Brouillon"}
          </Badge>
        </div>
      </div>

      <h3 className="font-semibold truncate mb-1">{siteLabel(site)}</h3>

      {origin.kind === "known" ? (
        <button
          type="button"
          onClick={() => onFilterTemplate(origin.id)}
          className="inline-flex max-w-full items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          title="Ne montrer que les sites issus de ce template"
        >
          <Layers className="h-3 w-3 shrink-0" />
          <span className="truncate">Depuis « {origin.name} »</span>
        </button>
      ) : (
        <span className="inline-flex items-center gap-1 text-xs text-amber-600" title={
          origin.kind === "missing"
            ? "Le template d'origine a été supprimé"
            : "Site créé avant le suivi des templates"
        }>
          <AlertTriangle className="h-3 w-3 shrink-0" />
          {templateOriginLabel(origin)}
        </span>
      )}

      <div className="mt-1">
        <PublishedLink subdomain={site.published_subdomain} />
      </div>

      <div className="flex gap-2 mt-4">
        <Link href={`/site-builder/claude/${site.id}`} className="flex-1">
          <Button variant="outline" size="sm" className="w-full gap-2 text-xs">
            <Pencil className="h-3 w-3" />
            Éditer
          </Button>
        </Link>
        <DeleteButton onClick={() => onDelete(site)} title="Supprimer ce site démo" />
      </div>
    </Card>
  );
}

function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">{icon}</div>
      <h3 className="font-medium mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-md">{hint}</p>
      {action}
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */

type ClaudeSpace = "templates" | "demos";

export default function SiteBuilderV2ListPage() {
  const [sites, setSites] = React.useState<SiteRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [multiImportOpen, setMultiImportOpen] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [space, setSpace] = React.useState<ClaudeSpace>("templates");
  const [originFilter, setOriginFilter] = React.useState<string>(ORIGIN_ALL);
  const [demoFor, setDemoFor] = React.useState<DemoTemplateRef | null>(null);

  const fetchSites = async () => {
    try {
      const res = await authedFetch("/api/site-builder/sites");
      if (!res.ok) throw new Error();
      setSites(await res.json());
    } catch {
      toast.error("Erreur lors du chargement des sites");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => { fetchSites(); }, []);

  const handleCreate = async () => {
    if (!newName.trim()) { toast.error("Nom requis"); return; }
    setCreating(true);
    try {
      const res = await authedFetch("/api/site-builder/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!res.ok) throw new Error();
      const site = await res.json();
      setSites((prev) => [site, ...prev]);
      setCreateOpen(false);
      setNewName("");
      toast.success("Site créé");
    } catch {
      toast.error("Erreur lors de la création");
    } finally {
      setCreating(false);
    }
  };

  // Claude designs are managed from their own tab / hub — keep them out of the
  // classic list so the two builders don't get mixed up.
  const classicSites = sites.filter((s) => !s.is_claude_design);
  const claudeSites = sites.filter((s) => s.is_claude_design);

  // L'espace template et l'espace démo sont séparés ici : dans une grille
  // unique, un modèle et les dix sites qui en sortent se ressemblent trop.
  const { templates, demos, demoCountByTemplate, variantCountByTemplate } = splitClaudeSpaces(claudeSites);

  // Table des noms bâtie sur TOUS les sites, pas seulement les designs Claude :
  // un modèle dont le drapeau `is_claude_design` aurait été retiré doit quand
  // même s'afficher par son nom plutôt que comme « Template supprimé ».
  const nameById = React.useMemo(
    () => Object.fromEntries(sites.map((s) => [s.id, siteLabel(s)])),
    [sites],
  );

  // Le template filtré peut disparaître (suppression) : sans ce garde-fou le
  // menu retomberait sur une valeur inconnue et n'afficherait plus rien.
  const activeFilter =
    originFilter === ORIGIN_ALL ||
    originFilter === ORIGIN_NONE ||
    templates.some((t) => t.id === originFilter)
      ? originFilter
      : ORIGIN_ALL;

  const visibleDemos = filterDemosByTemplate(demos, activeFilter, nameById);
  const strayDemos = demos.filter((d) => templateOrigin(d, nameById).kind !== "known");

  const showDemosOfTemplate = (templateId: string) => {
    setOriginFilter(templateId);
    setSpace("demos");
  };

  const handleDelete = async (site: SiteRow) => {
    const name = siteLabel(site);
    const derived = demoCountByTemplate[site.id] ?? 0;
    const variants = variantCountByTemplate[site.id] ?? 0;

    let message: string;
    if (site.is_template) {
      const attached = [
        derived > 0 ? `${derived} site${derived > 1 ? "s" : ""} démo` : null,
        variants > 0 ? `${variants} variante${variants > 1 ? "s" : ""}` : null,
      ].filter(Boolean).join(" et ");
      const many = derived + variants > 1;
      message = attached
        ? `Supprimer le template « ${name} » ?\n\n${attached} en ${many ? "dépendent" : "dépend"}. ` +
          `${many ? "Ils ne seront PAS supprimés, mais ils perdront" : "Il ne sera PAS supprimé, mais il perdra"}` +
          ` le lien vers ce modèle.`
        : `Supprimer le template « ${name} » ?`;
    } else {
      message = `Supprimer le site « ${name} » ?`;
    }
    if (!window.confirm(message)) return;

    try {
      const res = await authedFetch(`/api/site-builder/sites/${site.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setSites((prev) => prev.filter((s) => s.id !== site.id));
      toast.success(site.is_template ? "Template supprimé" : "Site supprimé");
    } catch {
      toast.error("Erreur lors de la suppression");
    }
  };

  return (
    <AppLayout>
      <div className="flex flex-col gap-6 p-6">
        <div>
          <h1 className="text-xl font-semibold">Site Builder</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Créez et gérez des sites avec le nouveau système de thèmes à sections
          </p>
        </div>

        <Tabs defaultValue="sites" className="gap-6">
          <TabsList>
            <TabsTrigger value="sites">Sites ({classicSites.length})</TabsTrigger>
            <TabsTrigger value="claude" className="gap-2">
              <Sparkles className="h-4 w-4" />
              Claude Design ({claudeSites.length})
            </TabsTrigger>
          </TabsList>

          {/* ── Onglet « Sites » (classiques) ────────────────────────── */}
          <TabsContent value="sites" className="flex flex-col gap-4">
            <div className="flex justify-end">
              <Button onClick={() => setCreateOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Nouveau site
              </Button>
            </div>

            {loading ? (
              <SkeletonGrid />
            ) : classicSites.length === 0 ? (
              <EmptyState
                icon={<Globe className="h-8 w-8 text-muted-foreground" />}
                title="Aucun site"
                hint="Créez votre premier site avec thèmes et sections"
                action={
                  <Button onClick={() => setCreateOpen(true)} variant="outline" className="gap-2">
                    <Plus className="h-4 w-4" />
                    Créer un site
                  </Button>
                }
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {classicSites.map((site) => (
                  <SiteCard key={site.id} site={site} onDelete={handleDelete} />
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Onglet « Claude Design » ─────────────────────────────── */}
          <TabsContent value="claude" className="flex flex-col gap-4">
            <Tabs value={space} onValueChange={(v) => setSpace(v as ClaudeSpace)} className="gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <TabsList>
                  <TabsTrigger value="templates" className="gap-2">
                    <Layers className="h-4 w-4" />
                    Templates ({templates.length})
                  </TabsTrigger>
                  <TabsTrigger value="demos" className="gap-2">
                    <Globe className="h-4 w-4" />
                    Sites démo ({demos.length})
                  </TabsTrigger>
                </TabsList>

                <div className="flex flex-wrap justify-end gap-2">
                  <Link href="/site-builder/claude">
                    <Button variant="outline" className="gap-2">
                      <LayoutGrid className="h-4 w-4" />
                      Projets (Kanban)
                    </Button>
                  </Link>
                  {space === "templates" && (
                    <>
                      <Button onClick={() => setMultiImportOpen(true)} variant="outline" className="gap-2">
                        <FileArchive className="h-4 w-4" />
                        Importer un template (ZIP)
                      </Button>
                      <Button onClick={() => setImportOpen(true)} variant="outline" className="gap-2">
                        <Sparkles className="h-4 w-4" />
                        Importer un design Claude
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* ── Espace template ──────────────────────────────────── */}
              <TabsContent value="templates" className="flex flex-col gap-4">
                <p className="text-sm text-muted-foreground">
                  Les modèles réutilisables importés depuis Claude. On ne les publie pas : on les clone
                  pour créer un site démo, et les retouches faites ici ne redescendent pas sur les sites
                  déjà créés.
                </p>

                {loading ? (
                  <SkeletonGrid />
                ) : templates.length === 0 ? (
                  <EmptyState
                    icon={<Layers className="h-8 w-8 text-muted-foreground" />}
                    title="Aucun template"
                    hint="Importez un export Claude (.zip) pour démarrer un design multi-pages réutilisable"
                    action={
                      <Button onClick={() => setMultiImportOpen(true)} variant="outline" className="gap-2">
                        <FileArchive className="h-4 w-4" />
                        Importer un template (ZIP)
                      </Button>
                    }
                  />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {templates.map((template) => (
                      <TemplateCard
                        key={template.id}
                        template={template}
                        demoCount={demoCountByTemplate[template.id] ?? 0}
                        variantCount={variantCountByTemplate[template.id] ?? 0}
                        onCreateDemo={setDemoFor}
                        onShowDemos={showDemosOfTemplate}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* ── Espace site démo ─────────────────────────────────── */}
              <TabsContent value="demos" className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-sm text-muted-foreground flex-1 min-w-[16rem]">
                    Les sites créés à partir d&apos;un template, un par entreprise. Les modifier n&apos;altère
                    jamais le modèle d&apos;origine.
                  </p>
                  <div className="flex items-center gap-2">
                    <label htmlFor="origin-filter" className="text-sm text-muted-foreground">
                      Template :
                    </label>
                    <select
                      id="origin-filter"
                      className="rounded-md border bg-background px-2 py-1.5 text-sm"
                      value={activeFilter}
                      onChange={(e) => setOriginFilter(e.target.value)}
                    >
                      <option value={ORIGIN_ALL}>Tous ({demos.length})</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {siteLabel(t)} ({demoCountByTemplate[t.id] ?? 0})
                        </option>
                      ))}
                      {strayDemos.length > 0 && (
                        <option value={ORIGIN_NONE}>Sans template ({strayDemos.length})</option>
                      )}
                    </select>
                  </div>
                </div>

                {loading ? (
                  <SkeletonGrid />
                ) : demos.length === 0 ? (
                  <EmptyState
                    icon={<Globe className="h-8 w-8 text-muted-foreground" />}
                    title="Aucun site démo"
                    hint="Les sites démo naissent d'un template : ouvrez l'espace Templates et cliquez « Site démo »."
                    action={
                      <Button onClick={() => setSpace("templates")} variant="outline" className="gap-2">
                        <Layers className="h-4 w-4" />
                        Voir les templates
                      </Button>
                    }
                  />
                ) : visibleDemos.length === 0 ? (
                  <EmptyState
                    icon={<Globe className="h-8 w-8 text-muted-foreground" />}
                    title="Aucun site pour ce filtre"
                    hint="Ce template n'a pas encore servi à créer un site démo."
                    action={
                      <Button onClick={() => setOriginFilter(ORIGIN_ALL)} variant="outline">
                        Voir tous les sites démo
                      </Button>
                    }
                  />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {visibleDemos.map((site) => (
                      <DemoSiteCard
                        key={site.id}
                        site={site}
                        nameById={nameById}
                        onFilterTemplate={setOriginFilter}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouveau site V2</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Label htmlFor="site-name">Nom du site *</Label>
            <Input
              id="site-name"
              className="mt-1"
              placeholder="Site de mon client"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Annuler</Button>
            <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
              {creating ? "Création…" : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DesignImportDialog open={importOpen} onOpenChange={setImportOpen} onImported={fetchSites} />
      <MultiPageImportDialog open={multiImportOpen} onOpenChange={setMultiImportOpen} onImported={fetchSites} />
      <CreateDemoSiteDialog
        template={demoFor}
        onClose={() => setDemoFor(null)}
        onCreated={() => {
          const templateId = demoFor?.id ?? ORIGIN_ALL;
          setDemoFor(null);
          fetchSites();
          setOriginFilter(templateId);
          setSpace("demos");
        }}
      />
    </AppLayout>
  );
}
