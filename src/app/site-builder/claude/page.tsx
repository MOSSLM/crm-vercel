"use client";

import React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, FileArchive, Pencil, Plus, LayoutGrid, Layers } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { authedFetch } from "@/utils/authedFetch";
import { SiteKanban } from "@/components/site-builder/claude-design/SiteKanban";
import { MultiPageImportDialog } from "@/components/site-builder/claude-design/MultiPageImportDialog";

interface TemplateRef { id: string; name: string }
interface Company { id: number; nom: string; pret_pour_lm?: boolean }

type Tab = "templates" | "projets";

export default function ClaudeDesignHubPage() {
  const [tab, setTab] = React.useState<Tab>("templates");
  const [templates, setTemplates] = React.useState<TemplateRef[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [importOpen, setImportOpen] = React.useState(false);
  const [createFor, setCreateFor] = React.useState<TemplateRef | null>(null);

  const loadTemplates = React.useCallback(async () => {
    try {
      const res = await authedFetch("/api/site-builder/claude/board");
      if (!res.ok) throw new Error();
      const d = (await res.json()) as { templates: TemplateRef[] };
      setTemplates(d.templates ?? []);
    } catch {
      toast.error("Chargement des templates impossible");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { loadTemplates(); }, [loadTemplates]);

  return (
    <AppLayout>
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Claude Design</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Templates et création des sites démo</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setImportOpen(true)} variant="outline" className="gap-2">
              <FileArchive className="h-4 w-4" /> Importer un template (ZIP)
            </Button>
            <Link href="/site-builder"><Button variant="ghost" className="gap-2"><ArrowLeft className="h-4 w-4" /> Site Builder</Button></Link>
          </div>
        </div>

        <div className="flex gap-1 rounded-md bg-muted p-0.5 w-fit">
          {(["templates", "projets"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm ${tab === t ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
              {t === "templates" ? <Layers className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
              {t === "templates" ? "Templates" : "Projets"}
            </button>
          ))}
        </div>

        {tab === "templates" ? (
          loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => <div key={i} className="h-32 bg-muted animate-pulse rounded-xl" />)}
            </div>
          ) : templates.length === 0 ? (
            <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              Aucun template. Importe un ZIP Claude Design pour commencer.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((t) => (
                <Card key={t.id} className="p-5 flex flex-col gap-3">
                  <h3 className="font-semibold truncate">{t.name}</h3>
                  <div className="flex gap-2 mt-auto">
                    <Link href={`/site-builder/claude/${t.id}`} className="flex-1">
                      <Button variant="outline" size="sm" className="w-full gap-2 text-xs"><Pencil className="h-3 w-3" /> Ouvrir l&apos;éditeur</Button>
                    </Link>
                    <Button size="sm" className="gap-1 text-xs" onClick={() => setCreateFor(t)}><Plus className="h-3 w-3" /> Créer un site</Button>
                  </div>
                </Card>
              ))}
            </div>
          )
        ) : (
          <SiteKanban />
        )}
      </div>

      <MultiPageImportDialog open={importOpen} onOpenChange={setImportOpen} onImported={loadTemplates} />
      <CreateSiteDialog
        template={createFor}
        onClose={() => setCreateFor(null)}
        onCreated={() => { setCreateFor(null); setTab("projets"); }}
      />
    </AppLayout>
  );
}

function CreateSiteDialog({ template, onClose, onCreated }: {
  template: TemplateRef | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [companies, setCompanies] = React.useState<Company[]>([]);
  const [companyId, setCompanyId] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!template) return;
    authedFetch("/api/site-builder/entreprises")
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => setCompanies(Array.isArray(list) ? list : []))
      .catch(() => {});
  }, [template]);

  const create = async () => {
    if (!template || !companyId) { toast.error("Choisis une entreprise"); return; }
    setBusy(true);
    try {
      const res = await authedFetch(`/api/site-builder/claude/${template.id}/create-demo`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Échec");
      toast.success("Site démo créé (À faire)");
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Création impossible");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!template} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Créer un site à partir de « {template?.name} »</DialogTitle></DialogHeader>
        <div className="py-2">
          <label className="text-sm text-muted-foreground">Entreprise</label>
          <select className="mt-1 w-full rounded-md border bg-background px-2 py-2 text-sm"
            value={companyId ?? ""} onChange={(e) => setCompanyId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">— Choisir —</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.nom}{c.pret_pour_lm ? " · LM" : ""}</option>)}
          </select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={create} disabled={busy || !companyId}>{busy ? "Création…" : "Créer le site"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
