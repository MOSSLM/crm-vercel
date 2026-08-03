"use client";

import React from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Plus, Globe, Layout, ToggleLeft, ToggleRight,
  Trash2, Eye, ExternalLink, Sparkles, X, Loader2,
  CheckCircle, XCircle, BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import AppLayout from "@/components/layout/AppLayout";
import type { ManagedTheme } from "@/types";
import { authedFetch } from "@/utils/authedFetch";

export default function ThemesPage() {
  const [themes, setThemes] = React.useState<ManagedTheme[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [generateOpen, setGenerateOpen] = React.useState(false);

  const loadThemes = React.useCallback(async () => {
    try {
      const res = await authedFetch("/api/themes");
      if (!res.ok) throw new Error("Erreur de chargement");
      setThemes(await res.json());
    } catch {
      toast.error("Erreur lors du chargement des thèmes");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { loadThemes(); }, [loadThemes]);

  const handleToggle = async (theme: ManagedTheme) => {
    try {
      const res = await authedFetch(`/api/themes/${theme.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_enabled: !theme.is_enabled }),
      });
      if (!res.ok) throw new Error();
      setThemes((prev) =>
        prev.map((t) => t.slug === theme.slug ? { ...t, is_enabled: !theme.is_enabled } : t)
      );
      toast.success(theme.is_enabled ? "Thème désactivé" : "Thème activé");
    } catch {
      toast.error("Erreur lors de la mise à jour");
    }
  };

  const handleDelete = async (theme: ManagedTheme) => {
    if (!window.confirm(`Supprimer le thème "${theme.name}" ?`)) return;
    try {
      const res = await authedFetch(`/api/themes/${theme.slug}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setThemes((prev) => prev.filter((t) => t.slug !== theme.slug));
      toast.success("Thème supprimé");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    }
  };

  const handleThemeCreated = (newTheme: ManagedTheme) => {
    setThemes((prev) => [...prev, newTheme]);
    setCreateOpen(false);
    setGenerateOpen(false);
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Thèmes</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Gérez les thèmes disponibles pour le builder de sites.{" "}
              <Link href="/docs/themes" className="text-primary hover:underline">
                Voir la documentation →
              </Link>
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setGenerateOpen(true)} className="gap-2">
              <Sparkles className="h-4 w-4" />
              Créer depuis une URL
            </Button>
            <Button onClick={() => setCreateOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Nouveau thème
            </Button>
          </div>
        </div>

        {/* Themes grid */}
        {themes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <Layout className="h-10 w-10 mb-3 opacity-20" />
            <p>Aucun thème installé.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {themes.map((theme) => (
              <ThemeCard
                key={theme.slug}
                theme={theme}
                onToggle={() => handleToggle(theme)}
                onDelete={() => handleDelete(theme)}
              />
            ))}
          </div>
        )}

        {/* Create dialog */}
        <CreateThemeDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={handleThemeCreated}
        />

        {/* Generate from URL dialog */}
        <GenerateFromUrlDialog
          open={generateOpen}
          onClose={() => setGenerateOpen(false)}
          onCreated={handleThemeCreated}
        />
      </div>
    </AppLayout>
  );
}

// ── Theme Card ─────────────────────────────────────────────────────────────

function ThemeCard({
  theme,
  onToggle,
  onDelete,
}: {
  theme: ManagedTheme;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const config = theme.config as { sections?: { type: string }[]; description?: string } | null;
  const sectionCount = config?.sections?.length ?? 0;

  return (
    <div className="border rounded-xl overflow-hidden bg-card hover:shadow-md transition-shadow">
      {/* Preview image */}
      <div className="h-36 bg-muted flex items-center justify-center relative overflow-hidden">
        {theme.preview_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={theme.preview_image_url}
            alt={theme.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <Layout className="h-10 w-10 text-muted-foreground/30" />
        )}
        <div className="absolute top-2 right-2 flex gap-1">
          {theme.is_builtin && (
            <Badge variant="secondary" className="text-[10px]">Intégré</Badge>
          )}
          <Badge variant={theme.is_enabled ? "default" : "outline"} className="text-[10px]">
            {theme.is_enabled ? "Actif" : "Inactif"}
          </Badge>
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-semibold text-sm">{theme.name}</h3>
          <code className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
            {theme.slug}
          </code>
        </div>

        {theme.description && (
          <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{theme.description}</p>
        )}

        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
          <Globe className="h-3 w-3" />
          <span>{sectionCount} section{sectionCount !== 1 ? "s" : ""}</span>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1 flex-1"
            onClick={onToggle}
          >
            {theme.is_enabled ? (
              <><ToggleRight className="h-3.5 w-3.5 text-green-500" />Désactiver</>
            ) : (
              <><ToggleLeft className="h-3.5 w-3.5" />Activer</>
            )}
          </Button>

          <Button asChild variant="ghost" size="icon" className="h-7 w-7" title="Bibliothèque de sections">
            <Link href={`/themes/${theme.slug}/sections-library`}>
              <BookOpen className="h-3.5 w-3.5" />
            </Link>
          </Button>

          <Button asChild variant="ghost" size="icon" className="h-7 w-7">
            <Link href="/docs/themes">
              <Eye className="h-3.5 w-3.5" />
            </Link>
          </Button>

          {!theme.is_builtin && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Create Theme Dialog ────────────────────────────────────────────────────

function CreateThemeDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (t: ManagedTheme) => void;
}) {
  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [previewUrl, setPreviewUrl] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const handleCreate = async () => {
    if (!name.trim() || !slug.trim()) return;
    setSaving(true);
    try {
      const res = await authedFetch("/api/themes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim(),
          description: description.trim() || undefined,
          preview_image_url: previewUrl.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      const created = await res.json();
      toast.success("Thème créé !");
      onCreated(created);
      setName(""); setSlug(""); setDescription(""); setPreviewUrl("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouveau thème</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Nom</Label>
            <Input value={name} onChange={(e) => { setName(e.target.value); if (!slug) setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-")); }} placeholder="Mon super thème" />
          </div>
          <div className="space-y-1">
            <Label>Slug (identifiant unique)</Label>
            <Input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder="mon-super-theme" className="font-mono" />
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Thème pour…" />
          </div>
          <div className="space-y-1">
            <Label>Image de preview (URL)</Label>
            <Input value={previewUrl} onChange={(e) => setPreviewUrl(e.target.value)} placeholder="https://…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={handleCreate} disabled={saving || !name.trim() || !slug.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Créer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Generate from URL Dialog ────────────────────────────────────────────────

type GenStep = "idle" | "generating" | "preview" | "saving" | "done" | "error";

function GenerateFromUrlDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (t: ManagedTheme) => void;
}) {
  const [url, setUrl] = React.useState("");
  const [step, setStep] = React.useState<GenStep>("idle");
  const [error, setError] = React.useState("");
  const [generatedTheme, setGeneratedTheme] = React.useState<ReturnType<typeof JSON.parse> | null>(null);

  const handleGenerate = async () => {
    setStep("generating");
    setError("");
    try {
      const res = await authedFetch("/api/themes/generate-from-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setGeneratedTheme(data.theme);
      setStep("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
      setStep("error");
    }
  };

  const handleSave = async () => {
    if (!generatedTheme) return;
    setStep("saving");
    try {
      const res = await authedFetch("/api/themes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: generatedTheme.slug,
          name: generatedTheme.name,
          description: generatedTheme.description,
          preview_image_url: generatedTheme.preview_image_url,
          config: generatedTheme.config,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("Thème créé depuis l'URL !");
      setStep("done");
      onCreated(data);
      // Reset after a moment
      setTimeout(() => {
        setStep("idle");
        setUrl("");
        setGeneratedTheme(null);
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      setStep("error");
    }
  };

  const handleClose = () => {
    setStep("idle");
    setUrl("");
    setGeneratedTheme(null);
    setError("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            Créer un thème depuis une URL
          </DialogTitle>
        </DialogHeader>

        <div className="py-2 space-y-4">
          {(step === "idle" || step === "error") && (
            <>
              <p className="text-sm text-muted-foreground">
                Collez l&apos;URL d&apos;un site que vous aimez. L&apos;IA analysera ses couleurs,
                polices et structure pour générer un thème adapté.
              </p>
              <div className="space-y-1">
                <Label>URL du site source</Label>
                <div className="flex gap-2">
                  <Input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://exemple.com"
                    className="flex-1"
                    onKeyDown={(e) => { if (e.key === "Enter" && url) handleGenerate(); }}
                  />
                  <Button asChild variant="ghost" size="icon">
                    <a href={url} target="_blank" rel="noopener noreferrer" aria-label="Ouvrir URL">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
              </div>
              {step === "error" && (
                <div className="flex items-start gap-2 p-3 bg-destructive/10 rounded-lg text-sm text-destructive">
                  <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </>
          )}

          {step === "generating" && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
              <p className="text-sm text-muted-foreground">Analyse du site et génération du thème…</p>
              <p className="text-xs text-muted-foreground">Cela peut prendre 10-20 secondes</p>
            </div>
          )}

          {(step === "preview" || step === "saving") && generatedTheme && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle className="h-4 w-4" />
                Thème généré avec succès !
              </div>

              <div className="rounded-lg border p-4 space-y-3 bg-muted/30">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{generatedTheme.name}</p>
                    <code className="text-xs text-muted-foreground">{generatedTheme.slug}</code>
                  </div>
                  {generatedTheme.config?.globalVariables?.colors && (
                    <div className="flex gap-1">
                      {Object.values(generatedTheme.config.globalVariables.colors).slice(0, 5).map((c, i) => (
                        <div key={i} className="h-5 w-5 rounded-full border border-border" style={{ background: c as string }} />
                      ))}
                    </div>
                  )}
                </div>

                {generatedTheme.description && (
                  <p className="text-xs text-muted-foreground">{generatedTheme.description}</p>
                )}

                <div className="text-xs text-muted-foreground">
                  {generatedTheme.config?.sections?.length ?? 0} section(s) :&nbsp;
                  {(generatedTheme.config?.sections ?? []).map((s: { type: string }) => s.type).join(", ")}
                </div>

                <div className="text-xs text-muted-foreground">
                  Polices : {generatedTheme.config?.globalVariables?.fonts?.heading} / {generatedTheme.config?.globalVariables?.fonts?.body}
                </div>
              </div>
            </div>
          )}

          {step === "done" && (
            <div className="flex flex-col items-center gap-3 py-8">
              <CheckCircle className="h-8 w-8 text-green-500" />
              <p className="text-sm font-medium">Thème créé !</p>
            </div>
          )}
        </div>

        <DialogFooter>
          {step === "idle" || step === "error" ? (
            <>
              <Button variant="outline" onClick={handleClose}>Annuler</Button>
              <Button onClick={handleGenerate} disabled={!url.trim()} className="gap-2">
                <Sparkles className="h-4 w-4" />
                Analyser et générer
              </Button>
            </>
          ) : step === "preview" ? (
            <>
              <Button variant="outline" onClick={() => { setStep("idle"); setGeneratedTheme(null); }}>
                Recommencer
              </Button>
              <Button onClick={handleSave} className="gap-2">
                Sauvegarder le thème
              </Button>
            </>
          ) : step === "saving" ? (
            <Button disabled className="gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Sauvegarde…
            </Button>
          ) : (
            <Button onClick={handleClose}>Fermer</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
