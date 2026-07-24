"use client";

import React from "react";
import { toast } from "sonner";
import JSZip from "jszip";
import { UploadCloud, Wand2, ArrowRight, RefreshCw, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { authedFetch } from "@/utils/authedFetch";
import { parseTemplateBundle, type BundleInputFile, type ParsedBundle } from "@/lib/site-builder/claude-design/parse-template-bundle";
import { rewriteAssets } from "@/lib/site-builder/claude-design/rewrite-asset-paths";
import {
  buildProcessedPages,
  imagesForPages,
  sharedJsFromBundle,
  refPath,
} from "@/lib/site-builder/claude-design/build-import-pages";

export interface TemplateRef { id: string; name: string }

interface Props {
  /** The template to update; null closes the dialog. */
  template: TemplateRef | null;
  onClose: () => void;
  onDone?: () => void;
}

/**
 * Partial import: replaces ONLY the chosen pages of an EXISTING Claude Design
 * template from a full `.zip` export, leaving the other pages (and the photos
 * already assigned to them) untouched. All heavy work runs in the browser — the
 * exact same unzip → upload images → rewrite/tokenise pipeline as the full
 * importer (shared via build-import-pages) — then a small JSON call finalises
 * just the selected pages server-side.
 */
export function UpdateTemplatePagesDialog({ template, onClose, onDone }: Props) {
  const [file, setFile] = React.useState<File | null>(null);
  const [bundle, setBundle] = React.useState<ParsedBundle | null>(null);
  const [existingSlugs, setExistingSlugs] = React.useState<Set<string>>(new Set());
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [updateShared, setUpdateShared] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState("");

  // Reset everything whenever the target template changes (open / close / swap).
  React.useEffect(() => {
    setFile(null); setBundle(null); setSelected(new Set());
    setExistingSlugs(new Set()); setUpdateShared(false); setBusy(false); setProgress("");
    if (!template) return;
    let alive = true;
    authedFetch(`/api/site-builder/claude/${template.id}/pages`)
      .then((r) => (r.ok ? r.json() : { pages: [] }))
      .then((d: { pages?: Array<{ slug: string }> }) => {
        if (alive) setExistingSlugs(new Set((d.pages ?? []).map((p) => p.slug)));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [template]);

  const handleFile = async (f: File | null) => {
    setFile(f); setBundle(null); setSelected(new Set());
    if (!f) return;
    setBusy(true); setProgress("Analyse du template…");
    try {
      const zip = await JSZip.loadAsync(await f.arrayBuffer());
      const files: BundleInputFile[] = [];
      await Promise.all(
        Object.values(zip.files).map(async (entry) => {
          if (entry.dir) return;
          files.push({ path: entry.name, bytes: await entry.async("uint8array") });
        }),
      );
      const parsed = parseTemplateBundle(files);
      if (parsed.pages.length === 0) throw new Error("Aucune page HTML trouvée dans le ZIP.");
      setBundle(parsed);
      // Pre-select nothing: the operator explicitly picks which pages to replace.
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ZIP illisible");
      setFile(null);
    } finally {
      setBusy(false); setProgress("");
    }
  };

  const toggle = (slug: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug); else next.add(slug);
      return next;
    });
  };

  const handleImport = async () => {
    if (!template || !bundle) return;
    const slugs = [...selected];
    if (slugs.length === 0) { toast.error("Choisis au moins une page à importer."); return; }

    setBusy(true);
    try {
      // A shared-asset refresh needs every image (CSS backgrounds reference many);
      // a pages-only import uploads just the images the selected pages use.
      const imgs = updateShared ? bundle.images : imagesForPages(bundle, slugs);
      const urlByPath = new Map<string, string>();
      let done = 0;
      for (const img of imgs) {
        const ref = refPath(img.path);
        setProgress(`Upload images (${++done}/${imgs.length})…`);
        const fd = new FormData();
        fd.append("file", new Blob([img.bytes as BlobPart], { type: img.mime }), ref.replace(/^.*\//, ""));
        fd.append("original_path", ref);
        const res = await authedFetch(`/api/site-builder/assets?site=${template.id}`, { method: "POST", body: fd });
        if (res.ok) {
          const { public_url } = (await res.json()) as { public_url: string };
          if (public_url) urlByPath.set(ref, public_url);
        }
      }

      setProgress("Préparation des pages…");
      const pages = buildProcessedPages(bundle, urlByPath, slugs);

      const payload: Record<string, unknown> = { pages };
      if (updateShared) {
        payload.updateShared = true;
        payload.sharedCss = rewriteAssets(bundle.sharedCss, urlByPath);
        payload.sharedJs = sharedJsFromBundle(bundle, urlByPath);
        payload.scriptLinks = bundle.scriptLinks;
        payload.fontLinks = bundle.fontLinks;
      }

      setProgress("Mise à jour du template…");
      const res = await authedFetch(`/api/site-builder/designs/${template.id}/import-pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Échec de la mise à jour");
      const { updated = 0, created = 0 } = (await res.json()) as { updated?: number; created?: number };

      const parts = [updated && `${updated} remplacée${updated > 1 ? "s" : ""}`, created && `${created} ajoutée${created > 1 ? "s" : ""}`]
        .filter(Boolean).join(", ");
      toast.success(`Template mis à jour (${parts || `${pages.length} pages`})`);
      onDone?.();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la mise à jour");
    } finally {
      setBusy(false); setProgress("");
    }
  };

  return (
    <Dialog open={!!template} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Importer des pages dans « {template?.name} »</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-1">
          <p className="text-sm text-muted-foreground">
            Importe un <strong>.zip</strong> Claude Design puis choisis les pages à remplacer. Seules les pages
            cochées sont mises à jour — les autres pages du template (et leurs photos) restent intactes.
          </p>

          {!bundle ? (
            <div>
              <label htmlFor="upd-file"
                className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 px-4 py-8 text-center hover:bg-muted/50">
                <UploadCloud className="h-6 w-6 text-muted-foreground" />
                <span className="text-sm">{busy ? (progress || "Analyse…") : (file ? file.name : "Clique pour choisir un fichier .zip")}</span>
              </label>
              <input id="upd-file" type="file" accept=".zip,application/zip" className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
            </div>
          ) : (
            <>
              <div className="max-h-64 overflow-y-auto rounded-lg border">
                {bundle.pages.map((p) => {
                  const isExisting = existingSlugs.has(p.slug);
                  return (
                    <label key={p.slug}
                      className="flex cursor-pointer items-center gap-3 border-b px-3 py-2 last:border-b-0 hover:bg-muted/40">
                      <Checkbox checked={selected.has(p.slug)} onCheckedChange={() => toggle(p.slug)} />
                      <span className="flex-1 min-w-0">
                        <span className="block truncate text-sm font-medium">{p.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">{p.slug}</span>
                      </span>
                      <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${isExisting ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
                        {isExisting ? <><RefreshCw className="h-3 w-3" />Remplace</> : <><Plus className="h-3 w-3" />Nouvelle</>}
                      </span>
                    </label>
                  );
                })}
              </div>

              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <Checkbox checked={updateShared} onCheckedChange={(v) => setUpdateShared(v === true)} className="mt-0.5" />
                <span>
                  Mettre aussi à jour le <strong>CSS/JS partagés</strong>
                  <span className="block text-xs text-muted-foreground">À cocher seulement si le style a changé — s’applique à toutes les pages.</span>
                </span>
              </label>

              {busy && progress && <p className="text-sm text-muted-foreground">{progress}</p>}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Annuler</Button>
          {bundle && (
            <Button onClick={handleImport} disabled={busy || selected.size === 0} className="gap-2">
              {busy ? "Import…" : (<><Wand2 className="h-4 w-4" />Importer {selected.size > 0 ? `(${selected.size})` : ""}</>)}
              {!busy && <ArrowRight className="h-4 w-4" />}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default UpdateTemplatePagesDialog;
