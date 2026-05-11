"use client";

import React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, Globe, Pencil, Trash2 } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SiteV2 } from "@/types";

export default function SiteBuilderV2ListPage() {
  const [sites, setSites] = React.useState<SiteV2[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  const fetchSites = async () => {
    try {
      const res = await fetch("/api/site-builder/sites");
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
      const res = await fetch("/api/site-builder/sites", {
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

  const handleDelete = async (id: string) => {
    if (!window.confirm("Supprimer ce site ?")) return;
    try {
      const res = await fetch(`/api/site-builder/sites/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setSites((prev) => prev.filter((s) => s.id !== id));
      toast.success("Site supprimé");
    } catch {
      toast.error("Erreur lors de la suppression");
    }
  };

  return (
    <AppLayout>
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Sites V2</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Créez et gérez des sites avec le nouveau système de thèmes à sections
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Nouveau site
          </Button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-40 bg-muted animate-pulse rounded-xl" />
            ))}
          </div>
        ) : sites.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Globe className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-medium mb-1">Aucun site</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Créez votre premier site avec thèmes et sections
            </p>
            <Button onClick={() => setCreateOpen(true)} variant="outline" className="gap-2">
              <Plus className="h-4 w-4" />
              Créer un site
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sites.map((site) => (
              <Card key={site.id} className="p-5 hover:shadow-md transition-shadow group">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    {site.is_published ? (
                      <Globe className="h-5 w-5 text-primary" />
                    ) : (
                      <Globe className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <Badge variant={site.is_published ? "default" : "secondary"} className="text-xs">
                    {site.is_published ? "Publié" : "Brouillon"}
                  </Badge>
                </div>
                <h3 className="font-semibold truncate mb-1">{site.name}</h3>
                {site.published_subdomain && (
                  <a
                    href={`https://${site.published_subdomain}.samadigitalstudio.fr`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {site.published_subdomain}.samadigitalstudio.fr ↗
                  </a>
                )}
                <div className="flex gap-2 mt-4">
                  <Link href={`/site-builder/${site.id}`} className="flex-1">
                    <Button variant="outline" size="sm" className="w-full gap-2 text-xs">
                      <Pencil className="h-3 w-3" />
                      Éditer
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs gap-1"
                    onClick={() => handleDelete(site.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
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
    </AppLayout>
  );
}
