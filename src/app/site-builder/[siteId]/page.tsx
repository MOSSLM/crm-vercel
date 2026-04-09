"use client";

import React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { ArrowLeft, ExternalLink, FileText, Globe, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sitesApi, sitePagesApi } from "@/utils/siteBuilderApi";
import type { Site, SitePage } from "@/types";

export default function SiteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const siteId = params.siteId as string;

  const [site, setSite] = React.useState<Site | null>(null);
  const [pages, setPages] = React.useState<SitePage[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [newPageName, setNewPageName] = React.useState("");
  const [newPagePath, setNewPagePath] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  const fetchData = async () => {
    try {
      const [siteData, pagesData] = await Promise.all([
        sitesApi.fetchById(siteId),
        sitePagesApi.fetchBySite(siteId),
      ]);
      setSite(siteData);
      setPages(pagesData);
    } catch {
      toast.error("Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => { fetchData(); }, [siteId]);

  const handleCreatePage = async () => {
    if (!newPageName.trim()) { toast.error("Le nom est requis"); return; }
    setCreating(true);
    try {
      const page = await sitePagesApi.create({
        site_id: siteId,
        name: newPageName.trim(),
        path_name: newPagePath.trim() || newPageName.trim().toLowerCase().replace(/\s+/g, "-"),
        order: pages.length,
      });
      setPages((prev) => [...prev, page]);
      setCreateOpen(false);
      setNewPageName("");
      setNewPagePath("");
      toast.success("Page créée");
    } catch {
      toast.error("Erreur lors de la création");
    } finally {
      setCreating(false);
    }
  };

  const handleDeletePage = async (pageId: string) => {
    try {
      await sitePagesApi.delete(pageId);
      setPages((prev) => prev.filter((p) => p.id !== pageId));
      toast.success("Page supprimée");
    } catch {
      toast.error("Erreur lors de la suppression");
    }
  };

  const handleTogglePublish = async () => {
    if (!site) return;
    try {
      const updated = await sitesApi.update(site.id, { published: !site.published });
      setSite(updated);
      toast.success(updated.published ? "Site publié" : "Site dépublié");
    } catch {
      toast.error("Erreur lors de la mise à jour");
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="p-6 flex flex-col gap-4">
          <div className="h-8 w-48 bg-muted animate-pulse rounded" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => <div key={i} className="h-36 bg-muted animate-pulse rounded-xl" />)}
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!site) {
    return (
      <AppLayout>
        <div className="p-6 flex flex-col items-center justify-center py-20">
          <p className="text-muted-foreground">Site introuvable</p>
          <Button variant="link" onClick={() => router.push("/site-builder")}>Retour aux sites</Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex flex-col gap-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/site-builder" className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold">{site.name}</h1>
                <Badge variant={site.published ? "default" : "secondary"}>
                  {site.published ? "Publié" : "Brouillon"}
                </Badge>
              </div>
              {site.description && (
                <p className="text-sm text-muted-foreground">{site.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleTogglePublish} className="gap-2">
              <Globe className="h-4 w-4" />
              {site.published ? "Dépublier" : "Publier"}
            </Button>
            <Button onClick={() => setCreateOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Nouvelle page
            </Button>
          </div>
        </div>

        {/* Pages grid */}
        {pages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-base font-medium mb-1">Aucune page</h3>
            <p className="text-sm text-muted-foreground mb-4">Créez votre première page</p>
            <Button onClick={() => setCreateOpen(true)} variant="outline" className="gap-2">
              <Plus className="h-4 w-4" />
              Créer une page
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {pages.map((page) => (
              <Card key={page.id} className="group relative overflow-hidden hover:shadow-md transition-shadow">
                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                      {page.visits} vues
                    </span>
                  </div>
                  <h3 className="font-semibold text-sm mb-1 truncate">{page.name}</h3>
                  <p className="text-xs text-muted-foreground mb-3">/{page.path_name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    Modifié le {format(new Date(page.updated_at), "dd/MM/yyyy")}
                  </p>
                  <div className="flex gap-2 mt-4">
                    <Link href={`/site-builder/${siteId}/editor/${page.id}`} className="flex-1">
                      <Button variant="outline" size="sm" className="w-full gap-2 text-xs">
                        <Pencil className="h-3 w-3" />
                        Éditer
                      </Button>
                    </Link>
                  </div>
                </div>
                <div className="absolute top-3 right-3">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link href={`/site-builder/${siteId}/editor/${page.id}`}>
                          <ExternalLink className="mr-2 h-4 w-4" />
                          Ouvrir l&apos;éditeur
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDeletePage(page.id)} className="text-destructive focus:text-destructive">
                        <Trash2 className="mr-2 h-4 w-4" />
                        Supprimer
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create page dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouvelle page</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="page-name">Nom de la page *</Label>
              <Input
                id="page-name"
                placeholder="Accueil"
                value={newPageName}
                onChange={(e) => setNewPageName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreatePage()}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="page-path">Chemin URL (optionnel)</Label>
              <div className="flex items-center gap-1">
                <span className="text-sm text-muted-foreground">/</span>
                <Input
                  id="page-path"
                  placeholder="accueil"
                  value={newPagePath}
                  onChange={(e) => setNewPagePath(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Annuler</Button>
            <Button onClick={handleCreatePage} disabled={creating || !newPageName.trim()}>
              {creating ? "Création..." : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
