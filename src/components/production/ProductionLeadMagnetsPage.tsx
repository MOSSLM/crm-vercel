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
import { toast } from "sonner";

type LeadMagnetStatus = "a_faire" | "en_cours" | "pret";
type Relation<T> = T | T[] | null | undefined;

type LeadMagnetRow = {
  id: string;
  opportunite_id: string;
  template_id: string;
  nom: string | null;
  statut: LeadMagnetStatus;
  lien_livraison: string | null;
  created_at: string;
  opportunites?: {
    id: string;
    name: string | null;
    priorite: string | null;
    montant: number | null;
    flags: string[] | null;
    pipeline_id: string;
    lead_magnet: boolean;
    entreprises?: Relation<{ name: string | null }>;
    pipelines?: Relation<{ nom: string | null }>;
  }[];
  production_templates?: { nom: string | null }[];
};

type OpportunityRow = {
  id: string;
  name: string | null;
  priorite: string | null;
  montant: number | null;
  flags: string[] | null;
  pipeline_id: string;
  lead_magnet: boolean;
  entreprises?: { name: string | null }[];
  pipelines?: { nom: string | null }[];
};

type TemplateRow = { id: string; nom: string | null };
type PipelineRow = { id: string; nom: string | null };
type LeadMagnetProjectLinkRow = { id: string; opportunite_id: string | null; opportunity_id: string | null };
type PageMode = "production" | "tinder";
type SupabaseProjectLinkRow = { id: string; opportunite_id?: string | null; opportunity_id?: string | null };

const OPPORTUNITY_FLAGS = [
  { value: "site_merdique", label: "Site merdique / inutilisable" },
  { value: "site_tres_ancien", label: "Site très ancien" },
  { value: "a_revoir_plus_tard", label: "À revoir plus tard" },
] as const;

const normalizeFlagValue = (flag: string) => flag.trim().toLowerCase().replace(/\s+/g, "_");
const opportunityFlagByValue = new Map<string, (typeof OPPORTUNITY_FLAGS)[number]>(
  OPPORTUNITY_FLAGS.map((flag) => [flag.value, flag] as const)
);
const opportunityFlagAliasToValue = new Map<string, string>(
  OPPORTUNITY_FLAGS.flatMap((flag) => [
    [normalizeFlagValue(flag.value), flag.value],
    [normalizeFlagValue(flag.label), flag.value],
  ])
);

const statusLabels: Record<LeadMagnetStatus, string> = {
  a_faire: "À faire",
  en_cours: "En cours",
  pret: "Prêt",
};

const parseFlags = (flags?: string[] | null) =>
  Array.isArray(flags)
    ? flags.filter((flag): flag is string => typeof flag === "string" && flag.trim().length > 0)
    : [];

const canonicalizeOpportunityFlag = (flag: string) => {
  const normalized = normalizeFlagValue(flag);
  return opportunityFlagAliasToValue.get(normalized) || normalized;
};

const getFlagLabel = (flag: string) => opportunityFlagByValue.get(flag)?.label || flag;
const firstRelation = <T,>(value: Relation<T>): T | undefined => (Array.isArray(value) ? value[0] : value ?? undefined);
const loadingSkeletonKeys = Array.from({ length: 6 }, (_, index) => `lead-magnet-skeleton-${index}`);

export function ProductionLeadMagnetsPage({ mode = "production" }: { mode?: PageMode }) {
  const router = useRouter();
  const [leadMagnets, setLeadMagnets] = useState<LeadMagnetRow[]>([]);
  const [opportunities, setOpportunities] = useState<OpportunityRow[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [pipelines, setPipelines] = useState<PipelineRow[]>([]);
  const [projectIdByOpportunityId, setProjectIdByOpportunityId] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | LeadMagnetStatus>("all");
  const [pipelineFilter, setPipelineFilter] = useState<string>("all");
  const [flagFilter, setFlagFilter] = useState<string>("all");
  const [readyFilter, setReadyFilter] = useState<"all" | "ready" | "not_ready">("all");
  const [sortBy, setSortBy] = useState<"created_at" | "priorite" | "montant" | "pipeline">("created_at");
  const [form, setForm] = useState({ opportunite_id: "", template_id: "", nom: "" });

  const ensureLeadMagnetsForEveryOpportunity = useCallback(async (oppRows: OpportunityRow[], templateRows: TemplateRow[]) => {
    if (oppRows.length === 0 || templateRows.length === 0) return;

    const oppIds = oppRows.map((opp) => opp.id);
    const { data: linkedRows } = await supabase
      .from("production_lead_magnets")
      .select("opportunite_id")
      .in("opportunite_id", oppIds);

    const linkedIds = new Set((linkedRows ?? []).map((row) => row.opportunite_id as string));
    const defaultTemplateId = templateRows[0]?.id;
    if (!defaultTemplateId) return;

    const missing = oppRows.filter((opp) => !linkedIds.has(opp.id));
    if (missing.length === 0) return;

    await supabase.from("production_lead_magnets").insert(
      missing.map((opp) => ({
        opportunite_id: opp.id,
        template_id: defaultTemplateId,
        nom: opp.name || opp.entreprises?.[0]?.name || null,
        statut: opp.lead_magnet ? "pret" : "a_faire",
      }))
    );
  }, []);

  const fetchLeadMagnetProjectLinks = useCallback(async () => {
    const legacyColumnsAttempt = await supabase.from("lead_magnet_projects").select("id,opportunite_id,opportunity_id");
    if (!legacyColumnsAttempt.error) {
      return {
        data: (legacyColumnsAttempt.data ?? []) as LeadMagnetProjectLinkRow[],
        error: null,
      };
    }

    const canonicalColumnsAttempt = await supabase.from("lead_magnet_projects").select("id,opportunite_id");
    if (canonicalColumnsAttempt.error) {
      return { data: [] as LeadMagnetProjectLinkRow[], error: canonicalColumnsAttempt.error };
    }

    const normalizedRows = ((canonicalColumnsAttempt.data ?? []) as SupabaseProjectLinkRow[]).map((row) => ({
      id: row.id,
      opportunite_id: row.opportunite_id ?? null,
      opportunity_id: null,
    }));
    return { data: normalizedRows, error: null };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: templateRows }, { data: oppRows }, { data: pipelineRows }, projectLinksRes] = await Promise.all([
        supabase.from("production_templates").select("id,nom").order("nom"),
        supabase
          .from("opportunites")
          .select("id,name,priorite,montant,flags,pipeline_id,lead_magnet,entreprises(name),pipelines(nom)")
          .order("created_at", { ascending: false }),
        supabase.from("pipelines").select("id,nom").order("ordre", { ascending: true }),
        mode === "tinder" ? fetchLeadMagnetProjectLinks() : Promise.resolve({ data: [] as LeadMagnetProjectLinkRow[], error: null }),
      ]);

      const typedTemplates = (templateRows ?? []) as TemplateRow[];
      const typedOpportunities = (oppRows ?? []) as OpportunityRow[];

      await ensureLeadMagnetsForEveryOpportunity(typedOpportunities, typedTemplates);

      const { data: lmRows } = await supabase
        .from("production_lead_magnets")
        .select(
          "id,opportunite_id,template_id,nom,statut,lien_livraison,created_at,opportunites(id,name,priorite,montant,flags,pipeline_id,lead_magnet,entreprises(name),pipelines(nom)),production_templates(nom)"
        )
        .order("created_at", { ascending: false });

      setLeadMagnets((lmRows ?? []) as LeadMagnetRow[]);
      setOpportunities(typedOpportunities);
      setTemplates(typedTemplates);
      setPipelines((pipelineRows ?? []) as PipelineRow[]);
      if (mode === "tinder") {
        if (projectLinksRes.error) {
          toast.error("Impossible de charger les liens Lead Magnet V2.");
          setProjectIdByOpportunityId(new Map());
        } else {
          const links = (projectLinksRes.data ?? []) as LeadMagnetProjectLinkRow[];
          const mapping = new Map<string, string>();
          for (const link of links) {
            const opportunityId = link.opportunite_id ?? link.opportunity_id;
            if (!opportunityId) continue;
            mapping.set(opportunityId, link.id);
          }
          setProjectIdByOpportunityId(mapping);
        }
      }
    } catch (error) {
      console.error("Erreur de chargement des lead magnets:", error);
      toast.error("Erreur lors du chargement des lead magnets.");
    } finally {
      setLoading(false);
    }
  }, [ensureLeadMagnetsForEveryOpportunity, fetchLeadMagnetProjectLinks, mode]);

  useEffect(() => {
    void load();
  }, [load]);

  const usedOpportunityIds = useMemo(() => new Set(leadMagnets.map((lm) => lm.opportunite_id)), [leadMagnets]);

  const availableOpportunities = useMemo(
    () => opportunities.filter((opp) => !usedOpportunityIds.has(opp.id)),
    [opportunities, usedOpportunityIds]
  );

  const knownFlags = useMemo(() => {
    const discoveredFlags = leadMagnets.flatMap((row) =>
      parseFlags(firstRelation(row.opportunites)?.flags).map(canonicalizeOpportunityFlag)
    );
    const allFlags = Array.from(
      new Set([...OPPORTUNITY_FLAGS.map((flag) => flag.value), ...discoveredFlags])
    );
    return allFlags.sort((a, b) => getFlagLabel(a).localeCompare(getFlagLabel(b), "fr"));
  }, [leadMagnets]);

  const visibleRows = useMemo(() => {
    let rows = leadMagnets;
    if (statusFilter !== "all") {
      rows = rows.filter((row) => row.statut === statusFilter);
    }
    if (pipelineFilter !== "all") {
      rows = rows.filter((row) => firstRelation(row.opportunites)?.pipeline_id === pipelineFilter);
    }
    if (flagFilter !== "all") {
      rows = rows.filter((row) =>
        parseFlags(firstRelation(row.opportunites)?.flags).some(
          (flag) => canonicalizeOpportunityFlag(flag) === flagFilter
        )
      );
    }
    if (readyFilter !== "all") {
      rows = rows.filter((row) => {
        const isReady = row.statut === "pret" || Boolean(firstRelation(row.opportunites)?.lead_magnet);
        return readyFilter === "ready" ? isReady : !isReady;
      });
    }

    const priorityScore = (p?: string | null) => (p === "haute" ? 0 : p === "moyenne" ? 1 : 2);

    return [...rows].sort((a, b) => {
      const aOpportunity = firstRelation(a.opportunites);
      const bOpportunity = firstRelation(b.opportunites);
      if (sortBy === "priorite") {
        return priorityScore(aOpportunity?.priorite) - priorityScore(bOpportunity?.priorite);
      }
      if (sortBy === "montant") {
        return Number(bOpportunity?.montant ?? 0) - Number(aOpportunity?.montant ?? 0);
      }
      if (sortBy === "pipeline") {
        const pipelineA = firstRelation(aOpportunity?.pipelines)?.nom || "";
        const pipelineB = firstRelation(bOpportunity?.pipelines)?.nom || "";
        return pipelineA.localeCompare(pipelineB, "fr");
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [flagFilter, leadMagnets, pipelineFilter, readyFilter, sortBy, statusFilter]);

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

  const openCard = useCallback((row: LeadMagnetRow) => {
    if (mode === "production") {
      router.push(`/production/lead-magnets/${row.id}`);
      return;
    }

    const projectId = projectIdByOpportunityId.get(row.opportunite_id);
    if (!projectId) {
      toast.error("Projet Lead Magnet V2 introuvable pour cette opportunité.");
      return;
    }
    router.push(`/production/lead-magnet/${projectId}`);
  }, [mode, projectIdByOpportunityId, router]);

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
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Select value={statusFilter} onValueChange={(value: "all" | LeadMagnetStatus) => setStatusFilter(value)}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous statuts</SelectItem>
                <SelectItem value="a_faire">À faire</SelectItem>
                <SelectItem value="en_cours">En cours</SelectItem>
                <SelectItem value="pret">Prêts</SelectItem>
              </SelectContent>
            </Select>

            <Select value={pipelineFilter} onValueChange={setPipelineFilter}>
              <SelectTrigger className="w-[220px]"><SelectValue placeholder="Pipeline" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous pipelines</SelectItem>
                {pipelines.map((pipeline) => (
                  <SelectItem key={pipeline.id} value={pipeline.id}>{pipeline.nom || "Pipeline"}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={flagFilter} onValueChange={setFlagFilter}>
              <SelectTrigger className="w-[220px]"><SelectValue placeholder="Flag opportunité" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous flags</SelectItem>
                {knownFlags.map((flag) => (
                  <SelectItem key={flag} value={flag}>{getFlagLabel(flag)}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={readyFilter} onValueChange={(value: "all" | "ready" | "not_ready") => setReadyFilter(value)}>
              <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">LM prêts + non prêts</SelectItem>
                <SelectItem value="ready">Lead magnet prêt</SelectItem>
                <SelectItem value="not_ready">Lead magnet non prêt</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sortBy} onValueChange={(value: "created_at" | "priorite" | "montant" | "pipeline") => setSortBy(value)}>
              <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="created_at">Trier: plus récent</SelectItem>
                <SelectItem value="priorite">Trier: priorité opportunité</SelectItem>
                <SelectItem value="montant">Trier: montant opportunité</SelectItem>
                <SelectItem value="pipeline">Trier: pipeline</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground flex items-center"><ArrowUpDown className="h-3.5 w-3.5 mr-1" />{visibleRows.length} résultat(s)</p>
        </CardContent>
      </Card>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {loadingSkeletonKeys.map((skeletonKey) => (
            <Card key={skeletonKey}>
              <CardHeader className="space-y-2">
                <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
                <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="h-5 w-20 animate-pulse rounded bg-muted" />
                <div className="h-4 w-full animate-pulse rounded bg-muted" />
                <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
                <div className="flex gap-1">
                  <div className="h-5 w-16 animate-pulse rounded bg-muted" />
                  <div className="h-5 w-20 animate-pulse rounded bg-muted" />
                  <div className="h-5 w-14 animate-pulse rounded bg-muted" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibleRows.map((row) => {
            const opp = firstRelation(row.opportunites);
            const templateName = row.production_templates?.[0]?.nom;
            const pipelineName = firstRelation(opp?.pipelines)?.nom;
            const flags = parseFlags(opp?.flags);
            return (
              <Card key={row.id} className="cursor-pointer hover:border-primary" onClick={() => openCard(row)}>
                <CardHeader>
                  <CardTitle className="text-base">{row.nom || opp?.name || firstRelation(opp?.entreprises)?.name || "Lead magnet"}</CardTitle>
                  <CardDescription>{templateName || "Template non défini"}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Badge variant={row.statut === "pret" ? "default" : "secondary"}>{statusLabels[row.statut]}</Badge>
                  <p className="text-sm text-muted-foreground">Opportunité: {opp?.name || firstRelation(opp?.entreprises)?.name || row.opportunite_id}</p>
                  <p className="text-xs text-muted-foreground">Pipeline: {pipelineName || "N/A"}</p>
                  <p className="text-xs text-muted-foreground">Priorité: {opp?.priorite || "moyenne"} • Montant: {Number(opp?.montant ?? 0).toLocaleString()}€</p>
                  <div className="flex flex-wrap gap-1">
                    {flags.length > 0 ? flags.map((flag) => (
                      <Badge key={flag} variant="outline" className="text-[10px]">
                        {getFlagLabel(canonicalizeOpportunityFlag(flag))}
                      </Badge>
                    )) : <span className="text-xs text-muted-foreground">Aucun flag</span>}
                  </div>
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
