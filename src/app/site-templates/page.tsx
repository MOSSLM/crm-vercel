"use client";

import React from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Plus, Trash2, Pencil, LayoutTemplate, Globe, Copy, Tag, X, Check,
} from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import type { SiteTemplate } from "@/types";

const CATEGORIES = [
  { value: "general", label: "Général" },
  { value: "artisan", label: "Artisan / Métiers" },
  { value: "services", label: "Services professionnels" },
  { value: "retail", label: "Commerce / Retail" },
  { value: "restaurant", label: "Restaurant / Food" },
  { value: "sante", label: "Santé / Bien-être" },
  { value: "immobilier", label: "Immobilier" },
];

export default function SiteTemplatesPage() {
  const [templates, setTemplates] = React.useState<SiteTemplate[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editTemplate, setEditTemplate] = React.useState<SiteTemplate | null>(null);
  const [applyingId, setApplyingId] = React.useState<string | null>(null);
  const [filterCategory, setFilterCategory] = React.useState<string>("all");

  const fetchTemplates = async () => {
    try {
      const res = await fetch("/api/site-templates");
      if (!res.ok) throw new Error();
      setTemplates(await res.json());
    } catch {
      toast.error("Erreur lors du chargement des templates");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => { fetchTemplates(); }, []);

  const handleDelete = async (id: string) => {
    if (!window.confirm("Supprimer ce template ?")) return;
    try {
      const res = await fetch(`/api/site-templates/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      toast.success("Template supprimé");
    } catch {
      toast.error("Erreur lors de la suppression");
    }
  };

  const handleApplyToNewSite = async (template: SiteTemplate) => {
    setApplyingId(template.id);
    try {
      const res = await fetch("/api/site-builder-v2/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Site depuis "${template.name}"`,
          site_config: template.site_config,
        }),
      });
      if (!res.ok) throw new Error();
      const site = await res.json();
      toast.success("Site créé depuis le template !");
      window.location.href = `/site-builder-v2/${site.id}`;
    } catch {
      toast.error("Erreur lors de la création du site");
    } finally {
      setApplyingId(null);
    }
  };

  const filtered = filterCategory === "all"
    ? templates
    : templates.filter((t) => t.category === filterCategory);

  const categoryLabel = (cat?: string) =>
    CATEGORIES.find((c) => c.value === cat)?.label ?? cat ?? "Général";

  return (
    <AppLayout>
      <div className="flex flex-col gap-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Templates de Sites</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Créez et gérez des templates réutilisables pour vos sites clients
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Nouveau template
          </Button>
        </div>

        {/* Category filter */}
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filterCategory === "all"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
            onClick={() => setFilterCategory("all")}
          >
            Tous ({templates.length})
          </button>
          {CATEGORIES.filter((c) => templates.some((t) => t.category === c.value)).map((c) => (
            <button
              key={c.value}
              type="button"
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filterCategory === c.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
              onClick={() => setFilterCategory(c.value)}
            >
              {c.label} ({templates.filter((t) => t.category === c.value).length})
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-48 bg-muted animate-pulse rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <LayoutTemplate className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-medium mb-1">
              {templates.length === 0 ? "Aucun template" : "Aucun template dans cette catégorie"}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {templates.length === 0
                ? "Créez votre premier template pour le réutiliser sur plusieurs sites"
                : "Essayez une autre catégorie"}
            </p>
            {templates.length === 0 && (
              <Button onClick={() => setCreateOpen(true)} variant="outline" className="gap-2">
                <Plus className="h-4 w-4" />
                Créer un template
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((template) => (
              <Card key={template.id} className="overflow-hidden hover:shadow-md transition-shadow group">
                {/* Preview image */}
                {template.preview_image_url ? (
                  <div className="h-36 overflow-hidden bg-muted">
                    <img
                      src={template.preview_image_url}
                      alt={template.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                ) : (
                  <div className="h-36 bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                    <LayoutTemplate className="h-10 w-10 text-primary/30" />
                  </div>
                )}

                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-semibold text-sm leading-tight truncate">{template.name}</h3>
                    <Badge variant="outline" className="text-[10px] shrink-0 gap-1">
                      <Tag className="h-2.5 w-2.5" />
                      {categoryLabel(template.category)}
                    </Badge>
                  </div>

                  {template.description && (
                    <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
                      {template.description}
                    </p>
                  )}

                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
                    <Globe className="h-3 w-3" />
                    <span>
                      {(template.site_config?.sections?.length ?? 0)} section(s)
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1 gap-1.5 text-xs"
                      onClick={() => handleApplyToNewSite(template)}
                      disabled={applyingId === template.id}
                    >
                      {applyingId === template.id ? (
                        <span className="animate-spin h-3 w-3 border border-white border-t-transparent rounded-full" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                      Utiliser
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => setEditTemplate(template)}
                      title="Modifier"
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleDelete(template.id)}
                      title="Supprimer"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create dialog */}
      <TemplateFormDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={(t) => {
          setTemplates((prev) => [t, ...prev]);
          setCreateOpen(false);
          toast.success("Template créé");
        }}
      />

      {/* Edit dialog */}
      {editTemplate && (
        <TemplateFormDialog
          open={!!editTemplate}
          template={editTemplate}
          onClose={() => setEditTemplate(null)}
          onSuccess={(t) => {
            setTemplates((prev) => prev.map((x) => (x.id === t.id ? t : x)));
            setEditTemplate(null);
            toast.success("Template mis à jour");
          }}
        />
      )}
    </AppLayout>
  );
}

// ─── Template Form Dialog ────────────────────────────────────────────────────

interface TemplateFormDialogProps {
  open: boolean;
  template?: SiteTemplate;
  onClose: () => void;
  onSuccess: (t: SiteTemplate) => void;
}

function TemplateFormDialog({ open, template, onClose, onSuccess }: TemplateFormDialogProps) {
  const [name, setName] = React.useState(template?.name ?? "");
  const [description, setDescription] = React.useState(template?.description ?? "");
  const [previewUrl, setPreviewUrl] = React.useState(template?.preview_image_url ?? "");
  const [category, setCategory] = React.useState(template?.category ?? "general");
  const [configJson, setConfigJson] = React.useState(
    () => JSON.stringify(template?.site_config ?? { theme: "theme-default", settings: {}, sections: [] }, null, 2)
  );
  const [jsonError, setJsonError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const handleConfigChange = (v: string) => {
    setConfigJson(v);
    try { JSON.parse(v); setJsonError(null); } catch { setJsonError("JSON invalide"); }
  };

  const handleSubmit = async () => {
    if (!name.trim()) { toast.error("Nom requis"); return; }
    if (jsonError) { toast.error("JSON invalide"); return; }

    setSaving(true);
    try {
      const url = template
        ? `/api/site-templates/${template.id}`
        : "/api/site-templates";
      const method = template ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          preview_image_url: previewUrl.trim() || null,
          category,
          site_config: JSON.parse(configJson),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Erreur");
      onSuccess(await res.json());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template ? "Modifier le template" : "Nouveau template"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <Label>Nom *</Label>
              <Input
                className="mt-1"
                placeholder="Template Artisan Pro"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <Label>Catégorie</Label>
              <select
                className="mt-1 w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <Label>Description</Label>
            <Textarea
              className="mt-1"
              placeholder="Décrivez ce template, son usage, ses sections..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <div>
            <Label>URL de l'image de prévisualisation</Label>
            <Input
              className="mt-1"
              placeholder="https://..."
              value={previewUrl}
              onChange={(e) => setPreviewUrl(e.target.value)}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <Label>Configuration JSON (site_config)</Label>
              {jsonError ? (
                <span className="text-xs text-red-500 flex items-center gap-1">
                  <X className="h-3 w-3" /> {jsonError}
                </span>
              ) : (
                <span className="text-xs text-green-600 flex items-center gap-1">
                  <Check className="h-3 w-3" /> Valide
                </span>
              )}
            </div>
            <textarea
              value={configJson}
              onChange={(e) => handleConfigChange(e.target.value)}
              rows={16}
              className={`w-full font-mono text-xs border rounded-md p-3 bg-muted/30 resize-none focus:outline-none focus:ring-2 ${
                jsonError ? "border-red-400 focus:ring-red-400" : "border-input focus:ring-ring"
              }`}
              spellCheck={false}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={handleSubmit} disabled={saving || !!jsonError}>
            {saving ? "Sauvegarde…" : template ? "Mettre à jour" : "Créer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
