"use client";

import React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { format } from "date-fns";
import { Globe, Layout, MoreVertical, Plus, Trash2 } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sitesApi } from "@/utils/siteBuilderApi";
import type { Site } from "@/types";

export default function SiteBuilderPage() {
  const [sites, setSites] = React.useState<Site[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newDesc, setNewDesc] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  const fetchSites = async () => {
    try {
      const data = await sitesApi.fetchAll();
      setSites(data);
    } catch {
      toast.error("Erreur lors du chargement des sites");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => { fetchSites(); }, []);

  const handleCreate = async () => {
    if (!newName.trim()) { toast.error("Le nom est requis"); return; }
    setCreating(true);
    try {
      const site = await sitesApi.create({ name: newName.trim(), description: newDesc.trim() || undefined });
      setSites((prev) => [site, ...prev]);
      setCreateOpen(false);
      setNewName("");
      setNewDesc("");
      toast.success("Site créé");
    } catch {
      toast.error("Erreur lors de la création");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (siteId: string) => {
    try {
      await sitesApi.delete(siteId);
      setSites((prev) => prev.filter((s) => s.id !== siteId));
      toast.success("Site supprimé");
    } catch {
      toast.error("Erreur lors de la suppression");
    }
  };

  const handleTogglePublish = async (site: Site) => {
    try {
      const updated = await sitesApi.update(site.id, { published: !site.published });
      setSites((prev) => prev.map((s) => (s.id === site.id ? updated : s)));
      toast.success(updated.published ? "Site publié" : "Site dépublié");
    } catch {
      toast.error("Erreur lors de la mise à jour");
    }
  };

  return (
    <AppLayout>
      <div className="flex flex-col gap-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Layout className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Site Builder</h1>
              <p className="text-sm text-muted-foreground">Créez et gérez vos sites web</p>
            </div>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Nouveau site
          </Button>
        </div>

        {/* Sites grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-40 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : sites.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
              <Layout className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-base font-medium mb-1">Aucun site</h3>
            <p className="text-sm text-muted-foreground mb-4">Créez votre premier site web</p>
            <Button onClick={() => setCreateOpen(true)} variant="outline" className="gap-2">
              <Plus className="h-4 w-4" />
              Créer un site
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sites.map((site) => (
              <Card key={site.id} className="group relative overflow-hidden hover:shadow-md transition-shadow">
                <Link href={`/site-builder/${site.id}`} className="block p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Globe className="h-5 w-5 text-primary" />
                    </div>
                    <Badge variant={site.published ? "default" : "secondary"} className="text-xs">
                      {site.published ? "Publié" : "Brouillon"}
                    </Badge>
                  </div>
                  <h3 className="font-semibold text-sm mb-1 truncate">{site.name}</h3>
                  {site.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{site.description}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-auto">
                    Modifié le {format(new Date(site.updated_at), "dd/MM/yyyy")}
                  </p>
                </Link>
                <div className="absolute top-3 right-3">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.preventDefault()}>
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleTogglePublish(site)}>
                        <Globe className="mr-2 h-4 w-4" />
                        {site.published ? "Dépublier" : "Publier"}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDelete(site.id)} className="text-destructive focus:text-destructive">
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

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouveau site</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="site-name">Nom du site *</Label>
              <Input
                id="site-name"
                placeholder="Mon site web"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="site-desc">Description (optionnel)</Label>
              <Input
                id="site-desc"
                placeholder="Description du site..."
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Annuler</Button>
            <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
              {creating ? "Création..." : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
