"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpDown, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/utils/supabase/client";

type LeadMagnetStatus = "a_faire" | "en_cours" | "pret";

type LeadMagnetRow = {
  id: string;
  opportunite_id: string;
  template_id: string;
  nom: string | null;
  statut: LeadMagnetStatus;
  lien_livraison: string | null;
  created_at: string;
  opportunites?: { id: string; name: string | null; priorite: string | null; montant: number | null; entreprises?: { name: string | null }[] }[];
  production_templates?: { nom: string | null }[];
};

type OpportunityRow = {
  id: string;
  name: string | null;
  priorite: string | null;
  montant: number | null;
  entreprises?: { name: string | null }[];
};

type TemplateRow = { id: string; nom: string | null };

const statusLabels: Record<LeadMagnetStatus, string> = {
  a_faire: "À faire",
  en_cours: "En cours",
  pret: "Prêt",
};

export function ProductionLeadMagnetsPage() {
  const router = useRouter();
  const [leadMagnets, setLeadMagnets] = useState<LeadMagnetRow[]>([]);
  const [opportunities, setOpportunities] = useState<OpportunityRow[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | LeadMagnetStatus>("all");
  const [sortBy, setSortBy] = useState<"created_at" | "priorite" | "montant">("created_at");
  const [form, setForm] = useState({ opportunite_id: "", template_id: "", nom: "" });

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: lmRows }, { data: oppRows }, { data: templateRows }] = await Promise.all([
      supabase
        .from("production_lead_magnets")
        .select("id,opportunite_id,template_id,nom,statut,lien_livraison,created_at,opportunites(id,name,priorite,montant,entreprises(name)),production_templates(nom)")
        .order("created_at", { ascending: false }),
      supabase
        .from("opportunites")
        .select("id,name,priorite,montant,entreprises(name)")
        .order("created_at", { ascending: false }),
      supabase.from("production_templates").select("id,nom").order("nom"),
    ]);

    setLeadMagnets((lmRows ?? []) as LeadMagnetRow[]);
    setOpportunities((oppRows ?? []) as OpportunityRow[]);
    setTemplates((templateRows ?? []) as TemplateRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const usedOpportunityIds = useMemo(() => new Set(leadMagnets.map((lm) => lm.opportunite_id)), [leadMagnets]);

  const availableOpportunities = useMemo(
    () => opportunities.filter((opp) => !usedOpportunityIds.has(opp.id)),
    [opportunities, usedOpportunityIds]
  );

  const visibleRows = useMemo(() => {
    let rows = leadMagnets;
    if (statusFilter !== "all") {
      rows = rows.filter((row) => row.statut === statusFilter);
    }

    const priorityScore = (p?: string | null) => (p === "haute" ? 0 : p === "moyenne" ? 1 : 2);

    return [...rows].sort((a, b) => {
      if (sortBy === "priorite") {
        return priorityScore(a.opportunites?.[0]?.priorite) - priorityScore(b.opportunites?.[0]?.priorite);
      }
      if (sortBy === "montant") {
        return Number(b.opportunites?.[0]?.montant ?? 0) - Number(a.opportunites?.[0]?.montant ?? 0);
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [leadMagnets, sortBy, statusFilter]);

  const createLeadMagnet = async () => {
    if (!form.opportunite_id || !form.template_id) return;

    await supabase.from("production_lead_magnets").insert({
      opportunite_id: form.opportunite_id,
      template_id: form.template_id,
      nom: form.nom.trim() || null,
      statut: "a_faire",
    });

    setForm({ opportunite_id: "", template_id: "", nom: "" });
    setOpen(false);
    await load();
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Production lead magnets</CardTitle>
            <CardDescription>
              Espace de production relié aux opportunités: à faire, en cours, prêts + lien de livraison client.
            </CardDescription>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> Nouveau lead magnet
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Créer une production lead magnet</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>Nom (optionnel)</Label>
                  <Input value={form.nom} onChange={(e) => setForm((p) => ({ ...p, nom: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Opportunité liée</Label>
                  <Select value={form.opportunite_id} onValueChange={(value) => setForm((p) => ({ ...p, opportunite_id: value }))}>
                    <SelectTrigger><SelectValue placeholder="Choisir une opportunité" /></SelectTrigger>
                    <SelectContent>
                      {availableOpportunities.map((opp) => (
                        <SelectItem value={opp.id} key={opp.id}>
                          {(opp.name || opp.entreprises?.[0]?.name || "Opportunité")} • {opp.priorite || "moyenne"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Template</Label>
                  <Select value={form.template_id} onValueChange={(value) => setForm((p) => ({ ...p, template_id: value }))}>
                    <SelectTrigger><SelectValue placeholder="Choisir un template" /></SelectTrigger>
                    <SelectContent>
                      {templates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>{template.nom || "Template"}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full" onClick={createLeadMagnet}>Créer</Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-2">
            <Select value={statusFilter} onValueChange={(value: "all" | LeadMagnetStatus) => setStatusFilter(value)}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous statuts</SelectItem>
                <SelectItem value="a_faire">À faire</SelectItem>
                <SelectItem value="en_cours">En cours</SelectItem>
                <SelectItem value="pret">Prêts</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sortBy} onValueChange={(value: "created_at" | "priorite" | "montant") => setSortBy(value)}>
              <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="created_at">Trier: plus récent</SelectItem>
                <SelectItem value="priorite">Trier: priorité opportunité</SelectItem>
                <SelectItem value="montant">Trier: montant opportunité</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground flex items-center"><ArrowUpDown className="h-3.5 w-3.5 mr-1" />{visibleRows.length} résultat(s)</p>
        </CardContent>
      </Card>

      {loading ? (
        <Card><CardContent className="py-6 text-sm text-muted-foreground">Chargement…</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibleRows.map((row) => {
            const opp = row.opportunites?.[0];
            const templateName = row.production_templates?.[0]?.nom;
            return (
              <Card key={row.id} className="cursor-pointer hover:border-primary" onClick={() => router.push(`/production/lead-magnets/${row.id}`)}>
                <CardHeader>
                  <CardTitle className="text-base">{row.nom || opp?.name || opp?.entreprises?.[0]?.name || "Lead magnet"}</CardTitle>
                  <CardDescription>{templateName || "Template non défini"}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Badge variant={row.statut === "pret" ? "default" : "secondary"}>{statusLabels[row.statut]}</Badge>
                  <p className="text-sm text-muted-foreground">Opportunité: {opp?.name || opp?.entreprises?.[0]?.name || row.opportunite_id}</p>
                  <p className="text-xs text-muted-foreground">Priorité: {opp?.priorite || "moyenne"} • Montant: {Number(opp?.montant ?? 0).toLocaleString()}€</p>
                  {row.lien_livraison ? (
                    <p className="text-xs text-emerald-700 truncate">Lien: {row.lien_livraison}</p>
                  ) : (
                    <p className="text-xs text-amber-700">Lien client non renseigné</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
