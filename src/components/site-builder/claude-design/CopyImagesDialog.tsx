"use client";

import React from "react";
import { toast } from "sonner";
import { Images, ArrowRight, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { authedFetch } from "@/utils/authedFetch";

export interface CopyImagesSource { id: string; name: string; isTemplate: boolean }

interface Props {
  open: boolean;
  /** The template receiving the photos. */
  siteId: string;
  /** Pages of the current template, to label the slug list. */
  pages: Array<{ slug: string; title: string }>;
  onClose: () => void;
  onDone?: () => void;
}

interface CopyResult {
  pages: Array<{ slug: string; applied: number; skipped: number; dropped: number }>;
  commonSlugs: string[];
  /** Pages the source carries photos on that this template does not have yet. */
  missingPages?: Array<{ slug: string; images: number }>;
  totalApplied: number;
  totalSkipped: number;
  totalDropped: number;
}

/**
 * Copies the photos of ANOTHER Claude Design template onto this one.
 *
 * The Claude export ships the same site in several skins (Classique / Brut /
 * Agency): same pages, same photo slots, different styling. Rather than
 * re-placing ~200 images per variant, the operator fills one and pulls it into
 * the others from here. A dry run runs on every change so the summary below the
 * list always describes what the button is about to do.
 */
export function CopyImagesDialog({ open, siteId, pages, onClose, onDone }: Props) {
  const [templates, setTemplates] = React.useState<CopyImagesSource[]>([]);
  const [sourceId, setSourceId] = React.useState("");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [overwrite, setOverwrite] = React.useState(false);
  const [preview, setPreview] = React.useState<CopyResult | null>(null);
  const [probing, setProbing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  // Load the other Claude Designs whenever the dialog opens (templates first —
  // that is where the reference photos normally live).
  React.useEffect(() => {
    if (!open) { setSourceId(""); setPreview(null); setSelected(new Set()); setOverwrite(false); return; }
    let alive = true;
    authedFetch("/api/site-builder/sites")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Array<{ id: string; name: string; is_claude_design?: boolean | null; is_template?: boolean | null }>) => {
        if (!alive) return;
        setTemplates(
          (Array.isArray(rows) ? rows : [])
            .filter((s) => s.is_claude_design && s.id !== siteId)
            .map((s) => ({ id: s.id, name: s.name || "Sans nom", isTemplate: s.is_template === true }))
            .sort((a, b) => Number(b.isTemplate) - Number(a.isTemplate) || a.name.localeCompare(b.name)),
        );
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [open, siteId]);

  // Dry run: which pages the two designs share, and how many photos would land
  // under the current selection. Re-runs on every change so the summary and the
  // per-page counts always describe what the button is about to do.
  const lastProbed = React.useRef<string>("");
  const overwriteRef = React.useRef(overwrite);
  overwriteRef.current = overwrite;
  const probe = React.useCallback(
    (slugs: string[], over: boolean, adoptSelection: boolean) => {
      setProbing(true);
      return authedFetch(`/api/site-builder/designs/${siteId}/copy-images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceSiteId: sourceId, overwrite: over, dryRun: true, slugs }),
      })
        .then(async (r) => {
          const body = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error((body as { error?: string }).error || "Analyse impossible");
          const res = body as CopyResult;
          setPreview(res);
          if (adoptSelection) {
            setSelected(new Set(res.commonSlugs));
            // Mark this exact selection as probed so effect (b) doesn't repeat it.
            lastProbed.current = `${sourceId}::${over}::${[...res.commonSlugs].sort().join("|")}`;
          }
        })
        .catch((e) => { setPreview(null); toast.error(e instanceof Error ? e.message : "Analyse impossible"); })
        .finally(() => setProbing(false));
    },
    [siteId, sourceId],
  );

  // (a) New source → probe every shared page and preselect them all.
  React.useEffect(() => {
    if (!open || !sourceId) { setPreview(null); return; }
    // `overwrite` is read through the ref, not tracked: effect (b) already
    // re-probes when that box changes, and tracking it here would probe twice.
    void probe([], overwriteRef.current, true);
  }, [open, sourceId, probe]);

  // (b) Selection / overwrite changed → refresh the counts for that selection.
  const selectionKey = React.useMemo(() => [...selected].sort().join("|"), [selected]);
  React.useEffect(() => {
    if (!open || !sourceId) return;
    const key = `${sourceId}::${overwrite}::${selectionKey}`;
    if (lastProbed.current === key) return;
    lastProbed.current = key;
    if (selectionKey === "") { setPreview((p) => (p ? { ...p, totalApplied: 0, totalSkipped: 0, totalDropped: 0, pages: [] } : p)); return; }
    void probe(selectionKey.split("|"), overwrite, false);
  }, [open, sourceId, overwrite, selectionKey, probe]);

  const titleOf = (slug: string) => pages.find((p) => p.slug === slug)?.title || slug;
  const commonSlugs = preview?.commonSlugs ?? [];
  // Pages the source has photos on that this template does not have at all —
  // a page added to the export after this template was imported. Without a slot
  // to copy into, it would otherwise just be absent from the list above.
  const missingPages = preview?.missingPages ?? [];

  const toggle = (slug: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug); else next.add(slug);
      return next;
    });
  };

  const handleCopy = async () => {
    if (!sourceId || selected.size === 0) return;
    setBusy(true);
    try {
      const res = await authedFetch(`/api/site-builder/designs/${siteId}/copy-images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceSiteId: sourceId, overwrite, slugs: [...selected] }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body as { error?: string }).error || "Échec de la copie");
      const { totalApplied = 0, totalSkipped = 0, totalDropped = 0 } = body as CopyResult;
      toast.success(
        `${totalApplied} image${totalApplied > 1 ? "s" : ""} importée${totalApplied > 1 ? "s" : ""}` +
        (totalSkipped ? ` · ${totalSkipped} conservée${totalSkipped > 1 ? "s" : ""}` : ""),
      );
      if (totalDropped > 0) {
        toast.warning(`${totalDropped} emplacement${totalDropped > 1 ? "s" : ""} introuvable${totalDropped > 1 ? "s" : ""} sur ce template — le markup diffère à cet endroit.`, { duration: 10000 });
      }
      onDone?.();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la copie");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Importer les images depuis un autre template</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-1">
          <p className="text-sm text-muted-foreground">
            Reprend les photos posées sur un autre template et les replace dans les mêmes zones ici.
            Toutes les pages portant le même chemin sont reprises — y compris celles ajoutées plus tard
            au design. Les textes de ce template ne sont pas touchés.
          </p>

          <div>
            <Label htmlFor="copy-src">Template source</Label>
            <select
              id="copy-src"
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={sourceId}
              onChange={(e) => { setSourceId(e.target.value); setSelected(new Set()); setPreview(null); }}
              disabled={busy}
            >
              <option value="">Choisis un template…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.isTemplate ? t.name : `${t.name} (démo)`}</option>
              ))}
            </select>
            {templates.length === 0 && (
              <p className="mt-1 text-xs text-muted-foreground">Aucun autre design Claude disponible.</p>
            )}
          </div>

          {sourceId && (
            <>
              <div className="max-h-56 overflow-y-auto rounded-lg border">
                {commonSlugs.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-muted-foreground">
                    {probing
                      ? "Analyse…"
                      : missingPages.length > 0
                        ? "Aucune page commune — les deux templates n’ont aucun chemin en commun (voir ci-dessous)."
                        : "Aucune page commune entre les deux templates."}
                  </p>
                ) : commonSlugs.map((slug) => {
                  const row = preview?.pages.find((p) => p.slug === slug);
                  return (
                    <label key={slug}
                      className="flex cursor-pointer items-center gap-3 border-b px-3 py-2 last:border-b-0 hover:bg-muted/40">
                      <Checkbox checked={selected.has(slug)} onCheckedChange={() => toggle(slug)} disabled={busy} />
                      <span className="flex-1 min-w-0">
                        <span className="block truncate text-sm font-medium">{titleOf(slug)}</span>
                        <span className="block truncate text-xs text-muted-foreground">{slug}</span>
                      </span>
                      {row && selected.has(slug) ? (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {row.applied} image{row.applied > 1 ? "s" : ""}
                          {row.skipped ? ` · ${row.skipped} gardée${row.skipped > 1 ? "s" : ""}` : ""}
                        </span>
                      ) : null}
                    </label>
                  );
                })}
              </div>

              {missingPages.length > 0 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <p className="flex items-start gap-1.5 font-medium">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {missingPages.length} page{missingPages.length > 1 ? "s" : ""} du template source
                    {missingPages.length > 1 ? " n’existent" : " n’existe"} pas encore ici
                  </p>
                  <ul className="mt-1 ml-5 list-disc">
                    {missingPages.map((p) => (
                      <li key={p.slug}>
                        <span className="font-mono">{p.slug}</span> — {p.images} image{p.images > 1 ? "s" : ""} en attente
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1.5 ml-5">
                    Ajoute-les d’abord avec « Importer des pages », puis relance cet import : elles seront reprises
                    automatiquement.
                  </p>
                </div>
              )}

              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <Checkbox checked={overwrite} onCheckedChange={(v) => setOverwrite(v === true)} className="mt-0.5" disabled={busy} />
                <span>
                  Écraser les images déjà présentes
                  <span className="block text-xs text-muted-foreground">
                    Décoché : seules les zones encore vides sont remplies.
                  </span>
                </span>
              </label>

              {preview && (
                <p className="text-sm text-muted-foreground">
                  {probing ? "Analyse…" : (
                    <>
                      <strong>{preview.totalApplied}</strong> image{preview.totalApplied > 1 ? "s" : ""} seront posées
                      {preview.totalSkipped > 0 && <> · {preview.totalSkipped} zone{preview.totalSkipped > 1 ? "s" : ""} déjà remplie{preview.totalSkipped > 1 ? "s" : ""} conservée{preview.totalSkipped > 1 ? "s" : ""}</>}
                      {preview.totalDropped > 0 && (
                        <span className="ml-1 inline-flex items-center gap-1 text-amber-600">
                          <AlertTriangle className="h-3 w-3" />{preview.totalDropped} introuvable{preview.totalDropped > 1 ? "s" : ""}
                        </span>
                      )}
                    </>
                  )}
                </p>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Annuler</Button>
          <Button onClick={handleCopy} disabled={busy || probing || !sourceId || selected.size === 0 || (preview?.totalApplied ?? 0) === 0} className="gap-2">
            {busy ? "Import…" : (<><Images className="h-4 w-4" />Importer les images</>)}
            {!busy && <ArrowRight className="h-4 w-4" />}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CopyImagesDialog;
