"use client";

import React from "react";
import { toast } from "sonner";
import { History, ArrowRight, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { authedFetch } from "@/utils/authedFetch";

interface Generation {
  id: string;
  at: string;
  reason: string;
  pages: string[];
  images: number;
}

interface RestoreResult {
  pages: Array<{ slug: string; restored: number; uncertain: number; dropped: number }>;
  totalRestored: number;
  totalUncertain: number;
  totalDropped: number;
}

interface Props {
  open: boolean;
  siteId: string;
  onClose: () => void;
  onDone?: () => void;
}

const REASON_LABEL: Record<string, string> = {
  "import-pages": "Import de pages",
  "copy-images": "Import d'images depuis un autre template",
  "restore-overrides": "Restauration précédente",
};

function formatAt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

/**
 * Puts back the photos a previous import replaced.
 *
 * Every overwrite snapshots the page's image settings first, so an import whose
 * automatic re-placement came up short is no longer final. Snapshots are grouped
 * by the moment they were taken — one import backs up every page it touches, and
 * that whole generation is what an operator wants to roll back to.
 */
export function RestoreImagesDialog({ open, siteId, onClose, onDone }: Props) {
  const [generations, setGenerations] = React.useState<Generation[]>([]);
  const [selected, setSelected] = React.useState("");
  const [preview, setPreview] = React.useState<RestoreResult | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) { setGenerations([]); setSelected(""); setPreview(null); return; }
    let alive = true;
    setLoading(true);
    authedFetch(`/api/site-builder/designs/${siteId}/restore-overrides`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error((body as { error?: string }).error || "Lecture impossible");
        return body as { generations: Generation[] };
      })
      .then((d) => { if (alive) { setGenerations(d.generations ?? []); setSelected(d.generations?.[0]?.id ?? ""); } })
      .catch((e) => { if (alive) toast.error(e instanceof Error ? e.message : "Lecture impossible"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open, siteId]);

  // Dry run so the button never promises more than it delivers.
  React.useEffect(() => {
    if (!open || !selected) { setPreview(null); return; }
    let alive = true;
    authedFetch(`/api/site-builder/designs/${siteId}/restore-overrides`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ generationId: selected, dryRun: true }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setPreview(d as RestoreResult | null); })
      .catch(() => { if (alive) setPreview(null); });
    return () => { alive = false; };
  }, [open, siteId, selected]);

  const handleRestore = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await authedFetch(`/api/site-builder/designs/${siteId}/restore-overrides`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generationId: selected }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body as { error?: string }).error || "Échec de la restauration");
      const { totalRestored = 0, totalUncertain = 0, totalDropped = 0 } = body as RestoreResult;
      toast.success(`${totalRestored} image${totalRestored > 1 ? "s" : ""} restaurée${totalRestored > 1 ? "s" : ""}`);
      if (totalUncertain > 0) {
        toast.warning(`${totalUncertain} placement${totalUncertain > 1 ? "s" : ""} à vérifier — le markup a bougé depuis la sauvegarde.`, { duration: 10000 });
      }
      if (totalDropped > 0) {
        toast.warning(`${totalDropped} emplacement${totalDropped > 1 ? "s" : ""} n'existe plus dans cette version des pages.`, { duration: 10000 });
      }
      onDone?.();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la restauration");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Restaurer les images</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-1">
          <p className="text-sm text-muted-foreground">
            Chaque import sauvegarde les images en place avant de les remplacer. Choisis la sauvegarde
            à remettre — la restauration est elle-même sauvegardée, donc annulable.
          </p>

          {loading ? (
            <p className="text-sm text-muted-foreground">Lecture des sauvegardes…</p>
          ) : generations.length === 0 ? (
            <p className="rounded-lg border px-3 py-4 text-sm text-muted-foreground">
              Aucune sauvegarde pour ce template. Les sauvegardes sont créées à partir du prochain import.
            </p>
          ) : (
            <div className="max-h-64 overflow-y-auto rounded-lg border">
              {generations.map((g) => (
                <label key={g.id}
                  className="flex cursor-pointer items-center gap-3 border-b px-3 py-2 last:border-b-0 hover:bg-muted/40">
                  <input type="radio" name="generation" checked={selected === g.id} disabled={busy}
                    onChange={() => setSelected(g.id)} />
                  <span className="flex-1 min-w-0">
                    <span className="block truncate text-sm font-medium">{formatAt(g.at)}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {REASON_LABEL[g.reason] ?? g.reason} · {g.pages.length} page{g.pages.length > 1 ? "s" : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{g.images} image{g.images > 1 ? "s" : ""}</span>
                </label>
              ))}
            </div>
          )}

          {preview && (
            <p className="text-sm text-muted-foreground">
              <strong>{preview.totalRestored}</strong> image{preview.totalRestored > 1 ? "s" : ""} seront remises
              {preview.totalUncertain > 0 && (
                <span className="ml-1 inline-flex items-center gap-1 text-amber-600">
                  <AlertTriangle className="h-3 w-3" />{preview.totalUncertain} à vérifier
                </span>
              )}
              {preview.totalDropped > 0 && <> · {preview.totalDropped} emplacement{preview.totalDropped > 1 ? "s" : ""} disparu{preview.totalDropped > 1 ? "s" : ""}</>}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Annuler</Button>
          <Button onClick={handleRestore} disabled={busy || !selected || (preview?.totalRestored ?? 0) === 0} className="gap-2">
            {busy ? "Restauration…" : (<><History className="h-4 w-4" />Restaurer</>)}
            {!busy && <ArrowRight className="h-4 w-4" />}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default RestoreImagesDialog;
