"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import JSZip from "jszip";
import { UploadCloud, Wand2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authedFetch } from "@/utils/authedFetch";
import { parseTemplateBundle, type BundleInputFile } from "@/lib/site-builder/claude-design/parse-template-bundle";
import { rewriteAssets, rewriteCrossLinks, dropLocalAssetRefs } from "@/lib/site-builder/claude-design/rewrite-asset-paths";
import {
  detectBracketTokens,
  defaultMappingFromTokens,
  applyBracketTokens,
} from "@/lib/site-builder/claude-design/bracket-tokens";
import { buildTweaksSchema } from "@/lib/site-builder/claude-design/parse-tweaks-schema";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported?: () => void;
}

/** template-relative ref path used in the HTML (e.g. "images/hero.jpg"). */
function refPath(path: string): string {
  const i = path.indexOf("images/");
  return i >= 0 ? path.slice(i) : path.replace(/^.*\//, "");
}

/**
 * Imports a MULTI-PAGE Claude Design export (.zip). All heavy work runs in the
 * browser — unzip, parse, upload each image to the assets bucket, rewrite
 * paths/links and tokenise [Crochets] — so only a small JSON finalize call hits
 * the server (dodging the serverless body-size limit a 20 MB+ ZIP would blow).
 */
export function MultiPageImportDialog({ open, onOpenChange, onImported }: Props) {
  const router = useRouter();
  const [file, setFile] = React.useState<File | null>(null);
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState("");

  const reset = () => { setFile(null); setName(""); setBusy(false); setProgress(""); };
  const handleOpenChange = (next: boolean) => { if (!next) reset(); onOpenChange(next); };

  const handleImport = async () => {
    if (!file) { toast.error("Choisis un fichier .zip"); return; }
    setBusy(true);
    try {
      setProgress("Décompression…");
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      const files: BundleInputFile[] = [];
      await Promise.all(
        Object.values(zip.files).map(async (entry) => {
          if (entry.dir) return;
          const bytes = await entry.async("uint8array");
          files.push({ path: entry.name, bytes });
        }),
      );

      setProgress("Analyse du template…");
      const bundle = parseTemplateBundle(files);
      if (bundle.pages.length === 0) throw new Error("Aucune page HTML trouvée dans le ZIP.");

      const siteId = crypto.randomUUID();

      // Upload each image to the assets bucket, building original-path → URL.
      const urlByPath = new Map<string, string>();
      let done = 0;
      for (const img of bundle.images) {
        const ref = refPath(img.path);
        setProgress(`Upload images (${++done}/${bundle.images.length})…`);
        const fd = new FormData();
        const blob = new Blob([img.bytes as BlobPart], { type: img.mime });
        fd.append("file", blob, ref.replace(/^.*\//, ""));
        fd.append("original_path", ref);
        const res = await authedFetch(`/api/site-builder/assets?site=${siteId}`, { method: "POST", body: fd });
        if (res.ok) {
          const { public_url } = (await res.json()) as { public_url: string };
          if (public_url) urlByPath.set(ref, public_url);
        }
      }

      setProgress("Préparation des pages…");
      const rw = (js: string) => rewriteAssets(js, urlByPath);
      const sharedCss = rw(bundle.sharedCss);

      // Split the design's runtime JS: a script the index page loads, or that ≥2
      // pages load, is SHARED (site.js); a script only one non-index page loads is
      // that PAGE's (service-clim.js). Contents get the same image-path rewrite.
      const refCount = new Map<string, number>();
      for (const p of bundle.pages) for (const n of p.localScriptRefs) refCount.set(n, (refCount.get(n) ?? 0) + 1);
      const indexRefs = new Set(bundle.pages.find((p) => p.slug === "/")?.localScriptRefs ?? []);
      const isShared = (n: string) => indexRefs.has(n) || (refCount.get(n) ?? 0) >= 2;
      const sharedJs = [...new Set(bundle.pages.flatMap((p) => p.localScriptRefs).filter(isShared))]
        .map((n) => bundle.jsByName[n])
        .filter(Boolean)
        .map(rw)
        .join("\n;\n");
      const scriptLinks = bundle.scriptLinks;

      // Per-page: rewrite assets + cross-links + drop local refs → sourceHtml.
      const sources = bundle.pages.map((p) => ({
        page: p,
        sourceHtml: dropLocalAssetRefs(rewriteCrossLinks(rewriteAssets(p.html, urlByPath))),
      }));

      // Default bracket mapping across all pages, then tokenise each.
      const allTokens = detectBracketTokens(sources.map((s) => s.sourceHtml).join("\n"));
      const mapping = defaultMappingFromTokens(allTokens);
      const pages = sources.map(({ page, sourceHtml }) => {
        // This page's own JS: its non-shared local .js + inline scripts.
        const ownJs = page.localScriptRefs.filter((n) => !isShared(n)).map((n) => bundle.jsByName[n]).filter(Boolean);
        const js = [...ownJs, ...page.inlineScripts].map(rw).join("\n;\n");
        return {
          slug: page.slug,
          title: page.title,
          serviceTag: page.serviceTag,
          sourceHtml,
          html: applyBracketTokens(sourceHtml, mapping).html,
          js,
        };
      });

      // Tweaks schema (preset palettes + per-page extras) from the *-tweaks.jsx.
      const pageTweaksBySlug: Record<string, string> = {};
      for (const p of bundle.pages) {
        if (p.tweaksFile && bundle.tweaksJsx[p.tweaksFile]) {
          pageTweaksBySlug[p.slug] = bundle.tweaksJsx[p.tweaksFile];
        }
      }
      const tweaksSchema = buildTweaksSchema(bundle.tweaksJsx["theme-tweaks.jsx"] ?? "", pageTweaksBySlug);

      setProgress("Création du site…");
      const res = await authedFetch("/api/site-builder/designs/import-bundle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId,
          name: name.trim() || undefined,
          pages,
          sharedCss,
          sharedJs,
          scriptLinks,
          fontLinks: bundle.fontLinks,
          tweaks: bundle.tweaksDefaults,
          tweaksSchema,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Échec de l'import");

      toast.success(`Template importé (${pages.length} pages, ${mapping.length} variables)`);
      onImported?.();
      handleOpenChange(false);
      router.push(`/site-builder/claude/${siteId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'import");
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Importer un template Claude (multi-pages)</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <p className="text-sm text-muted-foreground">
            Importe le <strong>.zip</strong> exporté depuis Claude Design (index + pages services + CSS + images).
            Les variables (<code>[Crochets]</code>) et le thème sont détectés automatiquement.
          </p>
          <div>
            <Label htmlFor="tpl-name">Nom (optionnel)</Label>
            <Input id="tpl-name" className="mt-1" placeholder="Template CVC — éditorial"
              value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="tpl-file">Fichier ZIP *</Label>
            <label htmlFor="tpl-file"
              className="mt-1 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 px-4 py-8 text-center hover:bg-muted/50">
              <UploadCloud className="h-6 w-6 text-muted-foreground" />
              <span className="text-sm">{file ? file.name : "Clique pour choisir un fichier .zip"}</span>
            </label>
            <input id="tpl-file" type="file" accept=".zip,application/zip" className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          {busy && progress && <p className="text-sm text-muted-foreground">{progress}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={busy}>Annuler</Button>
          <Button onClick={handleImport} disabled={busy || !file} className="gap-2">
            {busy ? "Import…" : (<><Wand2 className="h-4 w-4" /> Importer</>)}
            {!busy && <ArrowRight className="h-4 w-4" />}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default MultiPageImportDialog;
