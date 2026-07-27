"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import JSZip from "jszip";
import { UploadCloud, Wand2, ArrowRight, RefreshCw, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { authedFetch } from "@/utils/authedFetch";
import { parseTemplateBundle, type BundleInputFile } from "@/lib/site-builder/claude-design/parse-template-bundle";
import { rewriteAssets } from "@/lib/site-builder/claude-design/rewrite-asset-paths";
import { buildProcessedPages, sharedJsFromBundle } from "@/lib/site-builder/claude-design/build-import-pages";
import { uploadBundleImages } from "@/lib/site-builder/claude-design/upload-bundle-images";
import { buildTweaksSchema } from "@/lib/site-builder/claude-design/parse-tweaks-schema";
import { parseThemeSets } from "@/lib/site-builder/claude-design/parse-theme-sets";
import {
  splitTemplateBundle,
  normalizeTemplateName,
  type DetectedTemplate,
} from "@/lib/site-builder/claude-design/split-template-bundle";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported?: () => void;
}

interface ExistingTemplate { id: string; name: string }

/** Per-detected-template choices made in the list. */
interface RowConfig {
  selected: boolean;
  name: string;
  /** "" = create a new template, otherwise the id of the one to update.
   *  Never pre-filled: overwriting an existing template must be a deliberate
   *  choice, not something a matching folder name decides on its own. */
  targetId: string;
  /** "" = none, otherwise the template whose photos are pulled in after import. */
  imagesFromId: string;
  /** Update only: also replace the shared CSS/JS, fonts and Tweaks schema. */
  updateShared: boolean;
  /** Update only: also reset the colours/typography to the ZIP's defaults. */
  resetTweaks: boolean;
}

/** What `import-pages` reports about the photos it carried over. */
interface ImportReport {
  keptOverrides?: number;
  uncertainOverrides?: number;
  droppedOverrides?: Array<{ slug: string; keys: string[] }>;
  unverifiedPages?: string[];
}

/**
 * Surfaces what an update did to the photos already in place. Silence here is
 * how a template lost every image it had while the dialog reported success.
 */
function reportOverrides(label: string, r: ImportReport): void {
  const kept = r.keptOverrides ?? 0;
  const lost = (r.droppedOverrides ?? []).reduce((n, d) => n + d.keys.length, 0);
  const uncertain = r.uncertainOverrides ?? 0;
  if (kept > 0) toast.success(`${label} : ${kept} réglage${kept > 1 ? "s" : ""} d'image conservé${kept > 1 ? "s" : ""}.`);
  if (uncertain > 0) {
    toast.warning(`${label} : ${uncertain} placement${uncertain > 1 ? "s" : ""} à vérifier — le markup a bougé.`, { duration: 10000 });
  }
  if (lost > 0) {
    const pages = (r.droppedOverrides ?? []).map((d) => d.slug).join(", ");
    toast.error(
      `${label} : ${lost} image${lost > 1 ? "s" : ""} n'a pas pu être replacée (${pages}). Utilise « Restaurer les images » dans l'éditeur.`,
      { duration: 15000 },
    );
  }
  if ((r.unverifiedPages ?? []).length > 0) {
    toast.warning(`${label} : version précédente inconnue sur ${r.unverifiedPages!.length} page(s) — les images ont été conservées telles quelles, à vérifier.`, { duration: 10000 });
  }
}

/**
 * Imports a Claude Design export (.zip) — one template or several.
 *
 * The export now ships the same site in several skins side by side
 * (`template CVC - Classique/`, `… - Brut/`, `… - Agency/`) over a shared
 * `images/` folder, so the ZIP is first split per template
 * (`splitTemplateBundle`) and each one is imported through the existing
 * pipeline with its own coherent file list. Each row chooses whether to create
 * a template or refresh an existing one, and can pull the photos of an
 * already-populated template so the ~200 slots don't have to be filled again.
 *
 * All heavy work runs in the browser — unzip, parse, upload each image to the
 * assets bucket, rewrite paths/links and tokenise [Crochets] — so only a small
 * JSON finalize call hits the server (dodging the serverless body-size limit a
 * 20 MB+ ZIP would blow).
 */
export function MultiPageImportDialog({ open, onOpenChange, onImported }: Props) {
  const router = useRouter();
  const [file, setFile] = React.useState<File | null>(null);
  const [detected, setDetected] = React.useState<DetectedTemplate[]>([]);
  const [rows, setRows] = React.useState<Record<string, RowConfig>>({});
  const [existing, setExisting] = React.useState<ExistingTemplate[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState("");

  const reset = () => {
    setFile(null); setDetected([]); setRows({}); setBusy(false); setProgress("");
  };
  const handleOpenChange = (next: boolean) => { if (!next) reset(); onOpenChange(next); };

  // The Claude Design templates already in the CRM: update targets, and photo
  // sources for a freshly imported skin.
  React.useEffect(() => {
    if (!open) return;
    let alive = true;
    authedFetch("/api/site-builder/sites")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: Array<{ id: string; name: string; is_claude_design?: boolean | null; is_template?: boolean | null }>) => {
        if (!alive) return;
        setExisting(
          (Array.isArray(list) ? list : [])
            .filter((s) => s.is_claude_design)
            .map((s) => ({ id: s.id, name: s.name || "Sans nom" })),
        );
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [open]);

  const handleFile = async (f: File | null) => {
    setFile(f); setDetected([]); setRows({});
    if (!f) return;
    setBusy(true); setProgress("Décompression…");
    try {
      const zip = await JSZip.loadAsync(await f.arrayBuffer());
      const files: BundleInputFile[] = [];
      await Promise.all(
        Object.values(zip.files).map(async (entry) => {
          if (entry.dir) return;
          files.push({ path: entry.name, bytes: await entry.async("uint8array") });
        }),
      );

      const templates = splitTemplateBundle(files);
      if (templates.length === 0) throw new Error("Aucune page HTML trouvée dans le ZIP.");

      // A flat ZIP has no folder to name itself after: fall back to the file name.
      const fallback = f.name.replace(/\.zip$/i, "");
      const named = templates.map((t) => (t.key ? t : { ...t, name: fallback }));
      setDetected(named);
      setRows(Object.fromEntries(named.map((t) => [
        t.key,
        { selected: true, name: t.name, targetId: "", imagesFromId: "", updateShared: true, resetTweaks: false },
      ])));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ZIP illisible");
      setFile(null);
    } finally {
      setBusy(false); setProgress("");
    }
  };

  /** The existing template a ZIP folder looks like — a SUGGESTION only. Selecting
   *  it (and so overwriting that template) stays a deliberate click. */
  const suggestionFor = React.useCallback(
    (name: string) => existing.find((e) => normalizeTemplateName(e.name) === normalizeTemplateName(name)) ?? null,
    [existing],
  );

  const setRow = (key: string, patch: Partial<RowConfig>) =>
    setRows((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  /** Imports one detected template; returns the site it created or updated. */
  const importOne = async (tpl: DetectedTemplate, row: RowConfig): Promise<string> => {
    const label = row.name.trim() || tpl.name;
    const step = (s: string) => setProgress(`${label} · ${s}`);

    step("Analyse du template…");
    const bundle = parseTemplateBundle(tpl.files);
    if (bundle.pages.length === 0) throw new Error(`« ${label} » : aucune page HTML.`);

    const isUpdate = !!row.targetId;
    const siteId = isUpdate ? row.targetId : crypto.randomUUID();

    const { urlByPath, failed } = await uploadBundleImages(
      bundle.images,
      siteId,
      authedFetch,
      (done, total) => step(`Upload images (${done}/${total})…`),
    );
    if (failed.length > 0) {
      toast.warning(`${label} : ${failed.length} image(s) n’ont pas pu être envoyées — elles resteront vides.`);
    }

    step("Préparation des pages…");
    const sharedCss = rewriteAssets(bundle.sharedCss, urlByPath);
    const sharedJs = sharedJsFromBundle(bundle, urlByPath);
    const pages = buildProcessedPages(bundle, urlByPath);

    // Tweaks schema (the panel's controls) + theme sets (what a tweak VALUE
    // means in CSS). Both belong to THIS skin — "Chantier" only exists in Brut's
    // tables — so both travel with every import, update included.
    const pageTweaksBySlug: Record<string, string> = {};
    for (const p of bundle.pages) {
      if (p.tweaksFile && bundle.tweaksJsx[p.tweaksFile]) pageTweaksBySlug[p.slug] = bundle.tweaksJsx[p.tweaksFile];
    }
    const tweaksSchema = buildTweaksSchema(bundle.tweaksJsx["theme-tweaks.jsx"] ?? "", pageTweaksBySlug);
    const themeSets = parseThemeSets(bundle.themeApplyJs);

    if (isUpdate) {
      step("Mise à jour du template…");
      const res = await authedFetch(`/api/site-builder/designs/${siteId}/import-pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pages,
          updateShared: row.updateShared,
          sharedCss,
          sharedJs,
          scriptLinks: bundle.scriptLinks,
          fontLinks: bundle.fontLinks,
          tweaksSchema,
          themeSets,
          tweaks: bundle.tweaksDefaults,
          resetTweaks: row.resetTweaks,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body as { error?: string }).error || `Échec de la mise à jour de « ${label} »`);
      reportOverrides(label, body as ImportReport);
    } else {
      step("Création du site…");
      const res = await authedFetch("/api/site-builder/designs/import-bundle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId,
          name: label,
          pages,
          sharedCss,
          sharedJs,
          scriptLinks: bundle.scriptLinks,
          fontLinks: bundle.fontLinks,
          tweaks: bundle.tweaksDefaults,
          tweaksSchema,
          themeSets,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Échec de l'import de « ${label} »`);
    }

    // Optional: adopt the photos already placed on another template.
    if (row.imagesFromId && row.imagesFromId !== siteId) {
      step("Reprise des images…");
      const res = await authedFetch(`/api/site-builder/designs/${siteId}/copy-images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceSiteId: row.imagesFromId, overwrite: false }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) toast.warning(`${label} : reprise des images impossible (${(body as { error?: string }).error ?? "erreur"}).`);
      else {
        const { totalApplied = 0 } = body as { totalApplied?: number };
        toast.success(`${label} : ${totalApplied} image${totalApplied > 1 ? "s" : ""} reprise${totalApplied > 1 ? "s" : ""}.`);
      }
    }

    return siteId;
  };

  const chosen = detected.filter((t) => rows[t.key]?.selected);

  /** Asks `import-pages` what an update would cost, without writing anything. */
  const previewUpdate = async (tpl: DetectedTemplate, row: RowConfig): Promise<ImportReport | null> => {
    const bundle = parseTemplateBundle(tpl.files);
    if (bundle.pages.length === 0) return null;
    // No image URLs needed: only the markup drives the re-keying.
    const pages = buildProcessedPages(bundle, new Map());
    const res = await authedFetch(`/api/site-builder/designs/${row.targetId}/import-pages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pages, dryRun: true }),
    });
    return res.ok ? ((await res.json()) as ImportReport) : null;
  };

  const handleImport = async () => {
    if (chosen.length === 0) { toast.error("Coche au moins un template."); return; }

    // Two rows overwriting the same template would replace its markup twice,
    // each pass re-keying against what the previous one just wrote.
    const targets = chosen.map((t) => rows[t.key].targetId).filter(Boolean);
    if (new Set(targets).size !== targets.length) {
      toast.error("Deux variantes visent le même template. Choisis une cible différente pour chacune.");
      return;
    }

    // Anything that overwrites an existing template gets a dry run first, and
    // the operator confirms the cost before a single row is written.
    setBusy(true);
    try {
      const losses: string[] = [];
      for (const tpl of chosen) {
        const row = rows[tpl.key];
        if (!row.targetId) continue;
        setProgress(`${row.name || tpl.name} · Analyse de l'impact…`);
        const report = await previewUpdate(tpl, row);
        const lost = (report?.droppedOverrides ?? []).reduce((n, d) => n + d.keys.length, 0);
        if (lost > 0) {
          const name = existing.find((e) => e.id === row.targetId)?.name ?? row.targetId;
          losses.push(`« ${name} » : ${lost} image(s) ne pourront pas être replacées`);
        }
      }
      if (losses.length > 0) {
        const ok = window.confirm(
          `Cette mise à jour ne pourra pas replacer certaines images :\n\n${losses.join("\n")}\n\n` +
          "Elles seront sauvegardées et restaurables depuis l'éditeur (« Restaurer les images »).\n\nContinuer ?",
        );
        if (!ok) { setBusy(false); setProgress(""); return; }
      }
    } catch {
      // A failed preview must not block the import; the backup still protects it.
    }

    const doneIds: string[] = [];
    try {
      for (const tpl of chosen) {
        doneIds.push(await importOne(tpl, rows[tpl.key]));
      }
      toast.success(
        doneIds.length === 1
          ? `Template importé (${rows[chosen[0].key].name.trim() || chosen[0].name})`
          : `${doneIds.length} templates importés`,
      );
      onImported?.();
      handleOpenChange(false);
      if (doneIds.length === 1) router.push(`/site-builder/claude/${doneIds[0]}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'import");
      // Whatever went through is real: refresh the list rather than pretend nothing happened.
      if (doneIds.length > 0) onImported?.();
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importer un template Claude (multi-pages)</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <p className="text-sm text-muted-foreground">
            Importe le <strong>.zip</strong> exporté depuis Claude Design. Un ZIP peut contenir
            plusieurs variantes (Classique, Brut, Agence…) : coche celles à importer.
            Les variables (<code>[Crochets]</code>) et le thème sont détectés automatiquement.
          </p>

          {detected.length === 0 ? (
            <div>
              <Label htmlFor="tpl-file">Fichier ZIP *</Label>
              <label htmlFor="tpl-file"
                className="mt-1 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 px-4 py-8 text-center hover:bg-muted/50">
                <UploadCloud className="h-6 w-6 text-muted-foreground" />
                <span className="text-sm">{busy ? (progress || "Analyse…") : (file ? file.name : "Clique pour choisir un fichier .zip")}</span>
              </label>
              <input id="tpl-file" type="file" accept=".zip,application/zip" className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
            </div>
          ) : (
            <div className="flex flex-col divide-y rounded-lg border">
              {detected.map((t) => {
                const row = rows[t.key];
                if (!row) return null;
                const isUpdate = !!row.targetId;
                const suggestion = suggestionFor(row.name);
                return (
                  <div key={t.key} className="flex flex-col gap-2 p-3">
                    <div className="flex items-center gap-3">
                      <Checkbox checked={row.selected} disabled={busy}
                        onCheckedChange={(v) => setRow(t.key, { selected: v === true })} />
                      <Input className="h-8 flex-1" value={row.name} disabled={busy}
                        onChange={(e) => setRow(t.key, { name: e.target.value })} />
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {t.pageCount} page{t.pageCount > 1 ? "s" : ""} · {t.imageCount} image{t.imageCount > 1 ? "s" : ""}
                      </span>
                      <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${isUpdate ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
                        {isUpdate ? <><RefreshCw className="h-3 w-3" />Met à jour</> : <><Plus className="h-3 w-3" />Nouveau</>}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pl-7">
                      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                        Cible
                        <select
                          className="rounded-md border bg-background px-2 py-1.5 text-sm text-foreground"
                          value={row.targetId} disabled={busy || !row.selected}
                          onChange={(e) => setRow(t.key, { targetId: e.target.value })}
                        >
                          <option value="">Créer un nouveau template</option>
                          {existing.map((s) => <option key={s.id} value={s.id}>Mettre à jour « {s.name} »</option>)}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                        Reprendre les images de
                        <select
                          className="rounded-md border bg-background px-2 py-1.5 text-sm text-foreground"
                          value={row.imagesFromId} disabled={busy || !row.selected}
                          onChange={(e) => setRow(t.key, { imagesFromId: e.target.value })}
                        >
                          <option value="">Aucun</option>
                          {existing.filter((s) => s.id !== row.targetId).map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </label>
                    </div>

                    {!isUpdate && suggestion && (
                      <p className="pl-7 text-xs text-muted-foreground">
                        Ressemble à « {suggestion.name} ».{" "}
                        <button type="button" className="underline underline-offset-2" disabled={busy}
                          onClick={() => setRow(t.key, { targetId: suggestion.id })}>
                          Mettre à jour ce template
                        </button>{" "}
                        au lieu d’en créer un nouveau.
                      </p>
                    )}

                    {isUpdate && (
                      <div className="flex flex-col gap-1 pl-7">
                        <label className="flex cursor-pointer items-start gap-2 text-xs">
                          <Checkbox checked={row.updateShared} disabled={busy || !row.selected} className="mt-0.5"
                            onCheckedChange={(v) => setRow(t.key, { updateShared: v === true })} />
                          <span>
                            Mettre aussi à jour le style partagé
                            <span className="block text-muted-foreground">CSS/JS, polices et options des Tweaks de cette variante.</span>
                          </span>
                        </label>
                        <label className="flex cursor-pointer items-start gap-2 text-xs">
                          <Checkbox checked={row.resetTweaks} disabled={busy || !row.selected || !row.updateShared} className="mt-0.5"
                            onCheckedChange={(v) => setRow(t.key, { resetTweaks: v === true })} />
                          <span>
                            Réinitialiser le thème
                            <span className="block text-muted-foreground">Remet les couleurs et la typo par défaut du ZIP — tes réglages actuels sont perdus.</span>
                          </span>
                        </label>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {detected.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Une mise à jour remplace les pages et <strong>reporte</strong> les photos déjà posées sur le nouveau
              markup. Ce qui ne peut pas être reporté est sauvegardé et restaurable depuis l’éditeur.
            </p>
          )}
          {busy && progress && <p className="text-sm text-muted-foreground">{progress}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={busy}>Annuler</Button>
          <Button onClick={handleImport} disabled={busy || chosen.length === 0} className="gap-2">
            {busy ? "Import…" : (<><Wand2 className="h-4 w-4" />Importer {chosen.length > 1 ? `(${chosen.length})` : ""}</>)}
            {!busy && <ArrowRight className="h-4 w-4" />}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default MultiPageImportDialog;
