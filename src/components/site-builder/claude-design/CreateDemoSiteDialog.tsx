"use client";

import React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { authedFetch } from "@/utils/authedFetch";

export interface DemoTemplateRef {
  id: string;
  name: string;
}

interface Company {
  id: number;
  nom: string;
  pret_pour_lm?: boolean;
}

/**
 * Clone un TEMPLATE Claude Design en site démo pour une entreprise.
 *
 * Partagé par le hub (/site-builder/claude) et la liste (/site-builder) : c'est
 * le seul geste qui fait passer un modèle dans l'espace démo, il ne doit pas
 * exister en deux versions qui divergent.
 */
export function CreateDemoSiteDialog({
  template,
  onClose,
  onCreated,
}: {
  /** Template à cloner ; `null` ferme la boîte. */
  template: DemoTemplateRef | null;
  onClose: () => void;
  onCreated: (siteId: string) => void;
}) {
  const [companies, setCompanies] = React.useState<Company[]>([]);
  const [companyId, setCompanyId] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!template) return;
    setCompanyId(null);
    authedFetch("/api/site-builder/entreprises")
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => setCompanies(Array.isArray(list) ? list : []))
      .catch(() => {});
  }, [template]);

  const create = async () => {
    if (!template || !companyId) {
      toast.error("Choisis une entreprise");
      return;
    }
    setBusy(true);
    try {
      const res = await authedFetch(`/api/site-builder/claude/${template.id}/create-demo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body as { error?: string }).error || "Échec");
      toast.success("Site démo créé (À faire)");
      onCreated((body as { siteId?: string }).siteId ?? "");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Création impossible");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!template} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Créer un site à partir de « {template?.name} »</DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <label className="text-sm text-muted-foreground">Entreprise</label>
          <select
            className="mt-1 w-full rounded-md border bg-background px-2 py-2 text-sm"
            value={companyId ?? ""}
            onChange={(e) => setCompanyId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">— Choisir —</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
                {c.pret_pour_lm ? " · LM" : ""}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-muted-foreground">
            Le template reste intact : la démo en est une copie indépendante, rangée dans
            « Sites démo » à l&apos;étape « À faire ».
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={create} disabled={busy || !companyId}>
            {busy ? "Création…" : "Créer le site"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CreateDemoSiteDialog;
