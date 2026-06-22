"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UploadCloud, Wand2, CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authedFetch } from "@/utils/authedFetch";

interface MappingEntry {
  find: string;
  token: string;
  label: string;
  count: number;
}

interface DesignImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful import so the parent can refresh its list. */
  onImported?: () => void;
}

type Phase = "form" | "review";

/**
 * Import a whole-page "Claude design" (.html), then auto-detect the company
 * variables (name, address, logo, …) for review. The design is stored faithful
 * ("tel quel") — editing happens in the existing site editor.
 */
export function DesignImportDialog({ open, onOpenChange, onImported }: DesignImportDialogProps) {
  const router = useRouter();
  const [phase, setPhase] = React.useState<Phase>("form");
  const [file, setFile] = React.useState<File | null>(null);
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [siteId, setSiteId] = React.useState<string | null>(null);
  const [mapping, setMapping] = React.useState<MappingEntry[]>([]);

  const reset = () => {
    setPhase("form");
    setFile(null);
    setName("");
    setBusy(false);
    setSiteId(null);
    setMapping([]);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleImport = async () => {
    if (!file) { toast.error("Choisis un fichier .html"); return; }
    setBusy(true);
    try {
      // 1) Upload + create the faithful raw design site.
      const fd = new FormData();
      fd.append("file", file);
      if (name.trim()) fd.append("name", name.trim());
      const importRes = await authedFetch("/api/site-builder/designs/import", { method: "POST", body: fd });
      if (!importRes.ok) {
        const { error } = await importRes.json().catch(() => ({ error: "" }));
        throw new Error(error || "Échec de l'import");
      }
      const { siteId: newSiteId } = (await importRes.json()) as { siteId: string };
      setSiteId(newSiteId);
      onImported?.();

      // 2) Auto-detect company variables for review.
      const tokRes = await authedFetch(`/api/site-builder/designs/${newSiteId}/tokenize`, { method: "POST" });
      if (tokRes.ok) {
        const { mapping: m } = (await tokRes.json()) as { mapping: MappingEntry[] };
        setMapping(m ?? []);
      } else {
        toast.warning("Design importé, mais la détection des variables a échoué. Tu peux réessayer depuis l'éditeur.");
      }
      setPhase("review");
      toast.success("Design importé");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'import");
    } finally {
      setBusy(false);
    }
  };

  const openEditor = () => {
    if (siteId) router.push(`/site-builder/${siteId}`);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {phase === "form" ? "Importer un design Claude" : "Variables détectées"}
          </DialogTitle>
        </DialogHeader>

        {phase === "form" ? (
          <div className="flex flex-col gap-4 py-2">
            <p className="text-sm text-muted-foreground">
              Importe une page HTML conçue avec Claude. Elle est affichée <strong>telle quelle</strong> (sans
              découpage en sections) ; l&apos;IA repère ensuite les infos de l&apos;entreprise à variabiliser.
            </p>

            <div>
              <Label htmlFor="design-name">Nom (optionnel)</Label>
              <Input
                id="design-name"
                className="mt-1"
                placeholder="Template plombier — moderne"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="design-file">Fichier HTML *</Label>
              <label
                htmlFor="design-file"
                className="mt-1 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 px-4 py-8 text-center hover:bg-muted/50"
              >
                <UploadCloud className="h-6 w-6 text-muted-foreground" />
                <span className="text-sm">
                  {file ? file.name : "Clique pour choisir un fichier .html"}
                </span>
              </label>
              <input
                id="design-file"
                type="file"
                accept=".html,.htm,text/html"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 py-2">
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              Design importé et prêt à l&apos;édition.
            </div>
            {mapping.length > 0 ? (
              <>
                <p className="text-sm text-muted-foreground">
                  {mapping.length} variable{mapping.length > 1 ? "s" : ""} détectée
                  {mapping.length > 1 ? "s" : ""}. Elles seront remplacées par les données de chaque entreprise au
                  déploiement.
                </p>
                <div className="max-h-56 overflow-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <tbody>
                      {mapping.map((m, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="px-3 py-2 font-medium">{m.label}</td>
                          <td className="px-3 py-2 text-muted-foreground truncate max-w-[180px]" title={m.find}>
                            {m.find}
                          </td>
                          <td className="px-3 py-2 text-right text-xs text-muted-foreground">×{m.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Aucune variable détectée automatiquement. Tu pourras éditer les textes et images directement dans
                l&apos;éditeur.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {phase === "form" ? (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={busy}>
                Annuler
              </Button>
              <Button onClick={handleImport} disabled={busy || !file} className="gap-2">
                {busy ? "Import…" : (<><Wand2 className="h-4 w-4" /> Importer</>)}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>Fermer</Button>
              <Button onClick={openEditor} className="gap-2">
                Ouvrir l&apos;éditeur <ArrowRight className="h-4 w-4" />
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DesignImportDialog;
