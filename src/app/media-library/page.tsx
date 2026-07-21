"use client";

import React from "react";
import { toast } from "sonner";
import {
  Image as ImageIcon,
  Upload,
  Search,
  Trash2,
  Loader2,
  Copy as CopyIcon,
  X,
  Filter,
  Sparkles,
  FolderInput,
} from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import { useAppData } from "@/components/AppDataContext";
import { ServiceTagPicker } from "@/components/ServiceTagPicker";
import { normalizeServiceTags } from "@/utils/serviceTags";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import type { MediaImageType, MediaLibraryItem } from "@/types";
import { MEDIA_LIBRARY_UNIVERSAL_TAG } from "@/types";
import { authedFetch } from "@/utils/authedFetch";

const IMAGE_TYPE_LABELS: Record<MediaImageType, string> = {
  stock: "Stock",
  ai_generated: "IA",
  personal: "Perso",
  company: "Entreprise",
};

const IMAGE_TYPE_COLORS: Record<MediaImageType, string> = {
  stock: "bg-blue-100 text-blue-800 border-blue-200",
  ai_generated: "bg-purple-100 text-purple-800 border-purple-200",
  personal: "bg-green-100 text-green-800 border-green-200",
  company: "bg-orange-100 text-orange-800 border-orange-200",
};

interface UploadDraft {
  files: File[];
  alt_text: string;
  description: string;
  tags: string[];
  image_type: MediaImageType;
  entreprise_id: number | null;
}

const DEFAULT_DRAFT: UploadDraft = {
  files: [],
  alt_text: "",
  description: "",
  tags: [],
  image_type: "stock",
  entreprise_id: null,
};

export default function MediaLibraryPage() {
  const { companies } = useAppData();

  const allServiceTags = React.useMemo(() => {
    const set = new Set<string>();
    for (const c of companies) {
      for (const tag of normalizeServiceTags(c.service_tags, c.premiers_tags)) set.add(tag);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "fr"));
  }, [companies]);

  // All tags that exist in the library, for filter chips
  const [items, setItems] = React.useState<MediaLibraryItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [total, setTotal] = React.useState(0);

  // Filters
  const [search, setSearch] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState<MediaImageType | "all">("all");
  const [tagFilters, setTagFilters] = React.useState<string[]>([]);
  const [companyFilter, setCompanyFilter] = React.useState<number | null>(null);

  // Selection
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());

  // Modals
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [detailItem, setDetailItem] = React.useState<MediaLibraryItem | null>(null);
  const [deleteConfirmIds, setDeleteConfirmIds] = React.useState<string[] | null>(null);
  const [bulkTagOpen, setBulkTagOpen] = React.useState(false);

  // AI auto-tag
  const [autoTagging, setAutoTagging] = React.useState(false);
  // Import of builder-uploaded images into the library
  const [importingAssets, setImportingAssets] = React.useState(false);

  const fetchItems = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (tagFilters.length > 0) params.set("tags", tagFilters.join(","));
      if (typeFilter !== "all") params.set("image_type", typeFilter);
      if (companyFilter) params.set("entreprise_id", String(companyFilter));
      if (search.trim()) params.set("search", search.trim());
      params.set("limit", "200");

      const res = await authedFetch(`/api/media?${params.toString()}`);
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { items: MediaLibraryItem[]; total: number };
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      console.error("Fetch media failed", err);
      toast.error("Impossible de charger la bibliothèque");
    } finally {
      setLoading(false);
    }
  }, [tagFilters, typeFilter, companyFilter, search]);

  React.useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function resetFilters() {
    setSearch("");
    setTypeFilter("all");
    setTagFilters([]);
    setCompanyFilter(null);
  }

  async function handleDelete(ids: string[]) {
    try {
      if (ids.length === 1) {
        const res = await authedFetch(`/api/media/${ids[0]}`, { method: "DELETE" });
        if (!res.ok) throw new Error(await res.text());
      } else {
        const res = await authedFetch(`/api/media/bulk`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        });
        if (!res.ok) throw new Error(await res.text());
      }
      toast.success(`${ids.length} image(s) supprimée(s)`);
      setSelectedIds(new Set());
      setDetailItem(null);
      await fetchItems();
    } catch (err) {
      console.error(err);
      toast.error("Suppression échouée");
    } finally {
      setDeleteConfirmIds(null);
    }
  }

  // Auto-tag + describe images with the vision AI. With `ids`, analyses those
  // (chunked); without, sweeps the untagged images until none remain.
  const runAutoTag = React.useCallback(
    async (ids?: string[]) => {
      setAutoTagging(true);
      const t = toast.loading("Analyse IA en cours…");
      let updated = 0;
      const post = async (payload: Record<string, unknown>) => {
        const res = await authedFetch("/api/media/auto-tag", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Échec");
        return data as { updated: number; done: boolean; processed: number };
      };
      try {
        if (ids && ids.length > 0) {
          for (let i = 0; i < ids.length; i += 24) {
            const data = await post({ ids: ids.slice(i, i + 24) });
            updated += data.updated ?? 0;
            toast.loading(`Analyse IA… ${Math.min(i + 24, ids.length)}/${ids.length}`, { id: t });
          }
        } else {
          let guard = 0;
          let done = false;
          do {
            const data = await post({ only_untagged: true });
            updated += data.updated ?? 0;
            done = data.done !== false || data.processed === 0;
            toast.loading(`Analyse IA… ${updated} traitée(s)`, { id: t });
          } while (!done && ++guard < 100);
        }
        toast.success(`${updated} image(s) taguée(s) par l'IA`, { id: t });
        setSelectedIds(new Set());
        await fetchItems();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Analyse IA échouée", { id: t });
      } finally {
        setAutoTagging(false);
      }
    },
    [fetchItems],
  );

  // Import images uploaded through the site builder into the library. Each
  // imported item gets an AI alt text + description but NO tags. Loops the
  // endpoint (batched server-side) until every builder asset is imported.
  const runImportSiteAssets = React.useCallback(async () => {
    setImportingAssets(true);
    const t = toast.loading("Import des images du site builder…");
    let inserted = 0;
    try {
      let guard = 0;
      let done = false;
      do {
        const res = await authedFetch("/api/media/import-from-site-assets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Échec");
        inserted += data.inserted ?? 0;
        done = data.done !== false || data.processed === 0;
        toast.loading(`Import en cours… ${inserted} image(s) ajoutée(s)`, { id: t });
      } while (!done && ++guard < 200);
      toast.success(
        inserted > 0
          ? `${inserted} image(s) ajoutée(s) à la bibliothèque`
          : "Aucune nouvelle image à importer",
        { id: t },
      );
      await fetchItems();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import échoué", { id: t });
    } finally {
      setImportingAssets(false);
    }
  }, [fetchItems]);

  return (
    <AppLayout>
      <div className="px-6 py-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <ImageIcon className="h-6 w-6" />
              Bibliothèque d&apos;images
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {total} image{total > 1 ? "s" : ""} · taguez-les avec des services pour qu&apos;elles
              apparaissent automatiquement dans les sites des entreprises concernées.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => runImportSiteAssets()}
              disabled={importingAssets}
              title="Verser dans la bibliothèque les images uploadées via le site builder (alt + description auto, sans tags)"
            >
              {importingAssets ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FolderInput className="h-4 w-4 mr-2" />
              )}
              Importer du site builder
            </Button>
            <Button
              variant="outline"
              onClick={() => runAutoTag()}
              disabled={autoTagging}
              title="Analyser les images sans tag avec l'IA vision"
            >
              {autoTagging ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              Auto-taguer les non-taguées
            </Button>
            <Button onClick={() => setUploadOpen(true)}>
              <Upload className="h-4 w-4 mr-2" /> Ajouter des images
            </Button>
          </div>
        </div>

        {/* Filters bar */}
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher fichier / alt / description..."
                  className="pl-8"
                />
              </div>
              <Select
                value={typeFilter}
                onValueChange={(v) => setTypeFilter(v as MediaImageType | "all")}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les types</SelectItem>
                  <SelectItem value="stock">Stock</SelectItem>
                  <SelectItem value="ai_generated">IA générée</SelectItem>
                  <SelectItem value="personal">Personnelle</SelectItem>
                  <SelectItem value="company">Entreprise</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={companyFilter ? String(companyFilter) : "all"}
                onValueChange={(v) => setCompanyFilter(v === "all" ? null : Number(v))}
              >
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Entreprise" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes entreprises</SelectItem>
                  {companies
                    .filter((c) => c.qualifie)
                    .slice(0, 200)
                    .map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name ?? `Entreprise #${c.id}`}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {(search || typeFilter !== "all" || tagFilters.length > 0 || companyFilter) && (
                <Button variant="ghost" size="sm" onClick={resetFilters}>
                  <X className="h-3 w-3 mr-1" /> Réinitialiser
                </Button>
              )}
            </div>

            <div className="flex items-start gap-2">
              <Filter className="h-4 w-4 text-muted-foreground mt-1.5" />
              <div className="flex-1">
                <ServiceTagPicker
                  value={tagFilters}
                  allOptions={[MEDIA_LIBRARY_UNIVERSAL_TAG, ...allServiceTags]}
                  onChange={setTagFilters}
                  placeholder="Filtrer par tag..."
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Bulk actions bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-md px-3 py-2 text-sm">
            <span className="font-medium">{selectedIds.size} sélectionnée(s)</span>
            <Button variant="outline" size="sm" onClick={() => setBulkTagOpen(true)}>
              Ajouter des tags
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => runAutoTag(Array.from(selectedIds))}
              disabled={autoTagging}
            >
              {autoTagging ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3 mr-1" />
              )}
              Auto-tag IA
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 hover:text-red-700"
              onClick={() => setDeleteConfirmIds(Array.from(selectedIds))}
            >
              <Trash2 className="h-3 w-3 mr-1" /> Supprimer
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
              Désélectionner
            </Button>
          </div>
        )}

        {/* Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Chargement...
          </div>
        ) : items.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <ImageIcon className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>Aucune image dans la bibliothèque.</p>
              <Button className="mt-4" variant="outline" onClick={() => setUploadOpen(true)}>
                <Upload className="h-4 w-4 mr-2" /> Ajouter votre première image
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {items.map((item) => {
              const isSelected = selectedIds.has(item.id);
              const isUniversal = item.service_tags.includes(MEDIA_LIBRARY_UNIVERSAL_TAG);
              return (
                <Card
                  key={item.id}
                  className={`relative overflow-hidden group cursor-pointer transition-all ${
                    isSelected ? "ring-2 ring-blue-500" : "hover:shadow-md"
                  }`}
                  onClick={() => setDetailItem(item)}
                >
                  <div className="absolute top-2 left-2 z-10" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSelected(item.id)}
                      className="bg-white/90"
                    />
                  </div>
                  {isUniversal && (
                    <div className="absolute top-2 right-2 z-10">
                      <Badge className="bg-amber-500 text-white border-0 gap-1">
                        <Sparkles className="h-3 w-3" /> all
                      </Badge>
                    </div>
                  )}
                  <div className="aspect-square bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.public_url}
                      alt={item.alt_text ?? item.file_name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <CardContent className="p-2 space-y-1.5">
                    <p className="text-xs font-medium truncate" title={item.file_name}>
                      {item.file_name}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      <Badge
                        variant="outline"
                        className={`text-[10px] py-0 px-1.5 ${IMAGE_TYPE_COLORS[item.image_type]}`}
                      >
                        {IMAGE_TYPE_LABELS[item.image_type]}
                      </Badge>
                      {item.service_tags
                        .filter((t) => t !== MEDIA_LIBRARY_UNIVERSAL_TAG)
                        .slice(0, 3)
                        .map((tag) => (
                          <Badge
                            key={tag}
                            variant="secondary"
                            className="text-[10px] py-0 px-1.5"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!tagFilters.includes(tag)) setTagFilters([...tagFilters, tag]);
                            }}
                          >
                            {tag}
                          </Badge>
                        ))}
                      {item.service_tags.length > 3 && (
                        <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                          +{item.service_tags.length - 3}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Upload Dialog */}
        <UploadDialog
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          companies={companies}
          allServiceTags={allServiceTags}
          onUploaded={fetchItems}
          onAnalyze={runAutoTag}
        />

        {/* Detail Dialog */}
        {detailItem && (
          <DetailDialog
            item={detailItem}
            companies={companies}
            allServiceTags={allServiceTags}
            onClose={() => setDetailItem(null)}
            onUpdated={(updated) => {
              setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
              setDetailItem(updated);
            }}
            onDelete={() => setDeleteConfirmIds([detailItem.id])}
          />
        )}

        {/* Bulk tag dialog */}
        <BulkTagDialog
          open={bulkTagOpen}
          ids={Array.from(selectedIds)}
          allServiceTags={allServiceTags}
          onClose={() => setBulkTagOpen(false)}
          onDone={() => {
            setBulkTagOpen(false);
            setSelectedIds(new Set());
            void fetchItems();
          }}
        />

        {/* Delete confirmation */}
        <AlertDialog
          open={deleteConfirmIds !== null}
          onOpenChange={(open) => !open && setDeleteConfirmIds(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer définitivement ?</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteConfirmIds?.length === 1
                  ? "Cette image sera supprimée du stockage et de la base."
                  : `${deleteConfirmIds?.length ?? 0} images seront supprimées du stockage et de la base.`}
                <br />
                Cette action est irréversible.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteConfirmIds && handleDelete(deleteConfirmIds)}
                className="bg-red-600 hover:bg-red-700"
              >
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}

// ---------------------------------------------------------------------------
// Upload Dialog
// ---------------------------------------------------------------------------

function UploadDialog({
  open,
  onClose,
  companies,
  allServiceTags,
  onUploaded,
  onAnalyze,
}: {
  open: boolean;
  onClose: () => void;
  companies: ReturnType<typeof useAppData>["companies"];
  allServiceTags: string[];
  onUploaded: () => void | Promise<void>;
  onAnalyze?: (ids: string[]) => void | Promise<void>;
}) {
  const [draft, setDraft] = React.useState<UploadDraft>(DEFAULT_DRAFT);
  const [uploading, setUploading] = React.useState(false);
  const [analyze, setAnalyze] = React.useState(true);

  React.useEffect(() => {
    if (open) setDraft(DEFAULT_DRAFT);
  }, [open]);

  function handleFilesPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setDraft((d) => ({ ...d, files }));
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    setDraft((d) => ({ ...d, files }));
  }

  async function handleSubmit() {
    if (draft.files.length === 0) {
      toast.error("Sélectionnez au moins un fichier");
      return;
    }
    if (draft.image_type === "company" && !draft.entreprise_id) {
      toast.error("Sélectionnez une entreprise");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      for (const f of draft.files) form.append("files", f);
      if (draft.alt_text) form.append("alt_text", draft.alt_text);
      if (draft.description) form.append("description", draft.description);
      if (draft.tags.length) form.append("tags", draft.tags.join(","));
      form.append("image_type", draft.image_type);
      if (draft.entreprise_id) form.append("entreprise_id", String(draft.entreprise_id));

      const res = await authedFetch("/api/media", { method: "POST", body: form });
      const json = (await res.json()) as {
        inserted: MediaLibraryItem[];
        failures: { file_name: string; error: string }[];
      };
      if (!res.ok) throw new Error(json.failures?.[0]?.error ?? "Échec");
      toast.success(`${json.inserted.length} image(s) ajoutée(s)`);
      if (json.failures.length > 0) {
        toast.warning(`${json.failures.length} échec(s)`);
      }
      const insertedIds = json.inserted.map((i) => i.id);
      await onUploaded();
      onClose();
      // Kick the vision AI on the freshly-uploaded images (unless unticked).
      if (analyze && onAnalyze && insertedIds.length > 0) void onAnalyze(insertedIds);
    } catch (err) {
      console.error(err);
      toast.error("Upload échoué");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ajouter des images</DialogTitle>
          <DialogDescription>
            Les images taguées apparaîtront en priorité dans les sites des entreprises ayant un
            service correspondant. Utilisez le tag <code className="px-1 bg-muted rounded">all</code> pour
            les rendre disponibles partout.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Drag & drop */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-6 text-center hover:border-primary/50 transition-colors"
          >
            <label className="cursor-pointer block">
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm font-medium">
                Cliquer ou déposer {draft.files.length > 0 ? "pour remplacer" : "des fichiers"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                JPEG, PNG, WebP, GIF, SVG, AVIF — max 15 Mo
              </p>
              <input
                type="file"
                multiple
                accept="image/*"
                className="sr-only"
                onChange={handleFilesPicked}
              />
            </label>
            {draft.files.length > 0 && (
              <div className="mt-3 text-xs text-left bg-muted/50 rounded p-2 space-y-0.5 max-h-32 overflow-y-auto">
                {draft.files.map((f, i) => (
                  <div key={i} className="flex justify-between gap-2">
                    <span className="truncate">{f.name}</span>
                    <span className="text-muted-foreground shrink-0">
                      {(f.size / 1024).toFixed(0)} Ko
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Alt text */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Texte alternatif (alt)</label>
            <Input
              value={draft.alt_text}
              onChange={(e) => setDraft({ ...draft, alt_text: e.target.value })}
              placeholder="Description courte pour l'accessibilité..."
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Description (optionnelle)</label>
            <Textarea
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              placeholder="Notes internes, contexte..."
              rows={2}
            />
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-2">
              Tags de services
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 text-xs"
                onClick={() =>
                  setDraft((d) =>
                    d.tags.includes(MEDIA_LIBRARY_UNIVERSAL_TAG)
                      ? { ...d, tags: d.tags.filter((t) => t !== MEDIA_LIBRARY_UNIVERSAL_TAG) }
                      : { ...d, tags: [...d.tags, MEDIA_LIBRARY_UNIVERSAL_TAG] },
                  )
                }
              >
                <Sparkles className="h-3 w-3 mr-1" />
                {draft.tags.includes(MEDIA_LIBRARY_UNIVERSAL_TAG)
                  ? "Retirer « all »"
                  : "Marquer universelle"}
              </Button>
            </label>
            <ServiceTagPicker
              value={draft.tags}
              allOptions={[MEDIA_LIBRARY_UNIVERSAL_TAG, ...allServiceTags]}
              onChange={(tags) => setDraft({ ...draft, tags })}
            />
          </div>

          {/* Image type */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Type d&apos;image</label>
            <Select
              value={draft.image_type}
              onValueChange={(v) => setDraft({ ...draft, image_type: v as MediaImageType })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stock">Stock (libre de droit)</SelectItem>
                <SelectItem value="ai_generated">Générée par IA</SelectItem>
                <SelectItem value="personal">Personnelle</SelectItem>
                <SelectItem value="company">Liée à une entreprise</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Entreprise (only if company) */}
          {draft.image_type === "company" && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Entreprise</label>
              <Select
                value={draft.entreprise_id ? String(draft.entreprise_id) : ""}
                onValueChange={(v) => setDraft({ ...draft, entreprise_id: Number(v) })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choisir une entreprise..." />
                </SelectTrigger>
                <SelectContent>
                  {companies
                    .filter((c) => c.qualifie)
                    .slice(0, 200)
                    .map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name ?? `Entreprise #${c.id}`}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* AI analysis toggle */}
        <label className="flex items-start gap-2 rounded-lg border border-muted bg-muted/30 p-3 cursor-pointer">
          <Checkbox
            checked={analyze}
            onCheckedChange={(v) => setAnalyze(v === true)}
            className="mt-0.5"
          />
          <span className="text-sm">
            <span className="font-medium flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" /> Analyser avec l&apos;IA après upload
            </span>
            <span className="text-muted-foreground text-xs">
              Devine les service tags et rédige la description automatiquement (modèle configuré dans les Paramètres).
            </span>
          </span>
        </label>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={uploading}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={uploading || draft.files.length === 0}>
            {uploading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Uploader {draft.files.length > 0 && `(${draft.files.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Detail Dialog
// ---------------------------------------------------------------------------

function DetailDialog({
  item,
  companies,
  allServiceTags,
  onClose,
  onUpdated,
  onDelete,
}: {
  item: MediaLibraryItem;
  companies: ReturnType<typeof useAppData>["companies"];
  allServiceTags: string[];
  onClose: () => void;
  onUpdated: (item: MediaLibraryItem) => void;
  onDelete: () => void;
}) {
  const [alt, setAlt] = React.useState(item.alt_text ?? "");
  const [desc, setDesc] = React.useState(item.description ?? "");
  const [tags, setTags] = React.useState<string[]>(item.service_tags);
  const [type, setType] = React.useState<MediaImageType>(item.image_type);
  const [entrepriseId, setEntrepriseId] = React.useState<number | null>(item.entreprise_id);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setAlt(item.alt_text ?? "");
    setDesc(item.description ?? "");
    setTags(item.service_tags);
    setType(item.image_type);
    setEntrepriseId(item.entreprise_id);
  }, [item]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await authedFetch(`/api/media/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alt_text: alt || null,
          description: desc || null,
          service_tags: tags,
          image_type: type,
          entreprise_id: type === "company" ? entrepriseId : null,
        }),
      });
      const updated = await res.json();
      if (!res.ok) throw new Error(updated.error ?? "Échec");
      toast.success("Modifications enregistrées");
      onUpdated(updated as MediaLibraryItem);
    } catch (err) {
      console.error(err);
      toast.error("Sauvegarde échouée");
    } finally {
      setSaving(false);
    }
  }

  async function handleCopyUrl() {
    await navigator.clipboard.writeText(item.public_url);
    toast.success("URL copiée");
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="truncate">{item.file_name}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-2">
            <div className="bg-muted rounded-lg overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.public_url} alt={item.alt_text ?? ""} className="w-full h-auto" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleCopyUrl} className="flex-1">
                <CopyIcon className="h-3 w-3 mr-1" /> Copier l&apos;URL
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-red-600 hover:text-red-700"
                onClick={onDelete}
              >
                <Trash2 className="h-3 w-3 mr-1" /> Supprimer
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {item.mime_type} · {item.size_bytes ? `${(item.size_bytes / 1024).toFixed(0)} Ko` : "—"}
            </p>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Texte alternatif</label>
              <Input value={alt} onChange={(e) => setAlt(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Description</label>
              <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Tags de services</label>
              <ServiceTagPicker
                value={tags}
                allOptions={[MEDIA_LIBRARY_UNIVERSAL_TAG, ...allServiceTags]}
                onChange={setTags}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Type</label>
              <Select value={type} onValueChange={(v) => setType(v as MediaImageType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stock">Stock</SelectItem>
                  <SelectItem value="ai_generated">IA générée</SelectItem>
                  <SelectItem value="personal">Personnelle</SelectItem>
                  <SelectItem value="company">Entreprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {type === "company" && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Entreprise</label>
                <Select
                  value={entrepriseId ? String(entrepriseId) : ""}
                  onValueChange={(v) => setEntrepriseId(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir..." />
                  </SelectTrigger>
                  <SelectContent>
                    {companies
                      .filter((c) => c.qualifie)
                      .slice(0, 200)
                      .map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.name ?? `Entreprise #${c.id}`}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fermer
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Bulk Tag Dialog
// ---------------------------------------------------------------------------

function BulkTagDialog({
  open,
  ids,
  allServiceTags,
  onClose,
  onDone,
}: {
  open: boolean;
  ids: string[];
  allServiceTags: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [tagsToAdd, setTagsToAdd] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) setTagsToAdd([]);
  }, [open]);

  async function handleApply() {
    if (tagsToAdd.length === 0) {
      toast.error("Aucun tag à ajouter");
      return;
    }
    setSaving(true);
    try {
      const res = await authedFetch("/api/media/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, add_tags: tagsToAdd }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(`${ids.length} image(s) mises à jour`);
      onDone();
    } catch (err) {
      console.error(err);
      toast.error("Échec");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajouter des tags</DialogTitle>
          <DialogDescription>
            Les tags suivants seront ajoutés aux {ids.length} image(s) sélectionnée(s).
          </DialogDescription>
        </DialogHeader>
        <ServiceTagPicker
          value={tagsToAdd}
          allOptions={[MEDIA_LIBRARY_UNIVERSAL_TAG, ...allServiceTags]}
          onChange={setTagsToAdd}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={handleApply} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Ajouter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
