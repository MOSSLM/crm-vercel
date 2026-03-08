"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useAppData } from "./AppDataContext";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { toast } from "sonner";
import { getCompanyDisplayName } from "@/utils/displayHelpers";
import { supabase } from "@/utils/supabase/client";
import { journalApi } from "@/utils/journalApi";
import {
  Building2,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Link as LinkIcon,
  MapPinned,
  Phone,
  Search,
  Sparkles,
  Target,
} from "lucide-react";
import { PipelineStage } from "@/types";

interface JournalEntry {
  date: string;
  type_evenement: string;
  description?: string;
}

interface AutomatedEnrichmentRecord {
  entreprise_id: number;
  website_url?: string | null;
  google_maps_url?: string | null;
  google_url?: string | null;
  contact_page_url?: string | null;
  site_summary?: string | null;
  services_list?: string[] | null;
  ai_meta?: unknown;
}

interface AiMeta {
  company_profile_long_ai?: string;
  differentiators?: string[];
  proof_points?: Array<{ claim?: string; source_url?: string; evidence_excerpt?: string }>;
  business_facts?: {
    certifications_labels?: string[];
  };
}

const toPercent = (num: number, den: number) => {
  if (!den) return 0;
  return Math.round((num / den) * 100);
};

const extractAiMeta = (value: unknown): AiMeta => {
  if (!value || typeof value !== "object") return {};
  return value as AiMeta;
};

const formatDate = (raw?: string) => {
  if (!raw) return "-";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("fr-FR");
};

interface QualifiedColdCallWorkspaceProps {
  includeOnlyQualified?: boolean;
  scopedCompanyIds?: number[];
}

const parseOpportunityTags = (tags?: string) =>
  tags
    ? tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
    : [];

const parseOpportunityFlags = (flags?: string[]) =>
  Array.isArray(flags) ? flags.filter((flag): flag is string => typeof flag === "string" && flag.length > 0) : [];

const getStageName = (stages: PipelineStage[], stageId?: number) => {
  if (!stageId) return "Sans étape";
  return stages.find((stage) => stage.id === stageId)?.nom || "Sans étape";
};

export const QualifiedColdCallWorkspace: React.FC<QualifiedColdCallWorkspaceProps> = ({
  includeOnlyQualified = true,
  scopedCompanyIds,
}) => {
  const { companies, contacts, opportunities, pipelineStages } = useAppData();
  const companyScope = useMemo(() => {
    const scopedSet = scopedCompanyIds ? new Set(scopedCompanyIds) : null;
    return companies.filter((company) => {
      if (includeOnlyQualified && !company.qualifie) return false;
      if (scopedSet && !scopedSet.has(company.id)) return false;
      return true;
    });
  }, [companies, includeOnlyQualified, scopedCompanyIds]);

  const scopedOpportunities = useMemo(() => {
    const companyIdSet = new Set(companyScope.map((company) => company.id));
    return opportunities.filter((opportunity) => opportunity.entreprise_id && companyIdSet.has(opportunity.entreprise_id));
  }, [companyScope, opportunities]);

  const [search, setSearch] = useState("");
  const [hiddenCompanyIds, setHiddenCompanyIds] = useState<Set<number>>(new Set());
  const [showHiddenCompanies, setShowHiddenCompanies] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(companyScope[0]?.id ?? null);
  const [enrichment, setEnrichment] = useState<AutomatedEnrichmentRecord | null>(null);
  const [history, setHistory] = useState<JournalEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [stageFilter, setStageFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [flagFilter, setFlagFilter] = useState("all");

  const availableTags = useMemo(() => {
    const tags = scopedOpportunities.flatMap((opportunity) => parseOpportunityTags(opportunity.tags));
    return Array.from(new Set(tags)).sort((a, b) => a.localeCompare(b, "fr"));
  }, [scopedOpportunities]);

  const availableFlags = useMemo(() => {
    const flags = scopedOpportunities.flatMap((opportunity) => parseOpportunityFlags(opportunity.flags));
    return Array.from(new Set(flags)).sort((a, b) => a.localeCompare(b, "fr"));
  }, [scopedOpportunities]);

  const filteredOpportunityCompanyIds = useMemo(() => {
    const matchedCompanyIds = new Set<number>();

    scopedOpportunities.forEach((opportunity) => {
      if (!opportunity.entreprise_id) return;
      const tags = parseOpportunityTags(opportunity.tags);
      const flags = parseOpportunityFlags(opportunity.flags);
      const matchesStage = stageFilter === "all" || opportunity.stage_id?.toString() === stageFilter;
      const matchesTag = tagFilter === "all" || tags.includes(tagFilter);
      const matchesFlag = flagFilter === "all" || flags.includes(flagFilter);

      if (matchesStage && matchesTag && matchesFlag) {
        matchedCompanyIds.add(opportunity.entreprise_id);
      }
    });

    return matchedCompanyIds;
  }, [flagFilter, scopedOpportunities, stageFilter, tagFilter]);

  const [callOutcome, setCallOutcome] = useState("a_rappeler");
  const [clientFeedback, setClientFeedback] = useState("");
  const [followUpNotes, setFollowUpNotes] = useState("");
  const [recallAt, setRecallAt] = useState("");
  const [newMeetingAt, setNewMeetingAt] = useState("");

  const filteredCompanies = useMemo(() => {
    const q = search.trim().toLowerCase();
    return companyScope.filter((c) => {
      if (scopedOpportunities.length > 0 && !filteredOpportunityCompanyIds.has(c.id)) return false;
      if (!showHiddenCompanies && hiddenCompanyIds.has(c.id)) return false;
      if (!q) return true;
      const name = getCompanyDisplayName(c.name, c.canonical_url).toLowerCase();
      return name.includes(q) || (c.ville || "").toLowerCase().includes(q);
    });
  }, [companyScope, filteredOpportunityCompanyIds, hiddenCompanyIds, scopedOpportunities.length, search, showHiddenCompanies]);

  useEffect(() => {
    if (!selectedCompanyId && filteredCompanies.length > 0) {
      setSelectedCompanyId(filteredCompanies[0].id);
    }
  }, [filteredCompanies, selectedCompanyId]);

  const selectedCompany = useMemo(
    () => companyScope.find((c) => c.id === selectedCompanyId) ?? null,
    [companyScope, selectedCompanyId]
  );

  const companyContacts = useMemo(
    () => contacts.filter((contact) => contact.entreprise_id === selectedCompanyId),
    [contacts, selectedCompanyId]
  );

  const companyOpportunities = useMemo(
    () => scopedOpportunities.filter((opp) => opp.entreprise_id === selectedCompanyId),
    [scopedOpportunities, selectedCompanyId]
  );

  const toggleCompanyVisibility = (companyId: number) => {
    setHiddenCompanyIds((prev) => {
      const next = new Set(prev);
      if (next.has(companyId)) next.delete(companyId);
      else next.add(companyId);
      return next;
    });

    if (selectedCompanyId === companyId) {
      setSelectedCompanyId(null);
    }
  };

  const loadCompanyData = async (companyId: number) => {
    setIsLoading(true);
    try {
      const [enrichmentResult, historyResult] = await Promise.allSettled([
        supabase
          .from("automated_enrichment")
          .select("entreprise_id, website_url, google_maps_url, google_url, contact_page_url, site_summary, services_list, ai_meta")
          .eq("entreprise_id", companyId)
          .maybeSingle(),
        journalApi.getJournalHistory(undefined, companyId, { limit: 50 }),
      ]);

      if (enrichmentResult.status === "fulfilled") {
        const { data, error } = enrichmentResult.value;
        if (error) {
          toast.error("Données enrichies indisponibles pour cette entreprise");
          setEnrichment(null);
        } else {
          setEnrichment((data as AutomatedEnrichmentRecord | null) ?? null);
        }
      } else {
        toast.error("Données enrichies indisponibles pour cette entreprise");
        setEnrichment(null);
      }

      if (historyResult.status === "fulfilled") {
        setHistory(historyResult.value as JournalEntry[]);
      } else {
        toast.error("Historique cold call indisponible");
        setHistory([]);
      }
    } catch {
      toast.error("Impossible de charger les données cold call");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedCompanyId) {
      void loadCompanyData(selectedCompanyId);
    }
  }, [selectedCompanyId]);

  const metrics = useMemo(() => {
    const calls = history.filter((h) => h.type_evenement === "cold_call" || h.type_evenement === "appel");
    const rdvs = history.filter((h) => h.type_evenement.startsWith("rdv_"));
    const devis = history.filter((h) => h.type_evenement === "devis");
    const signatures = history.filter((h) => h.type_evenement === "signature");

    const decideurConversations = calls.filter((h) =>
      (h.description || "").toLowerCase().includes("décideur") || (h.description || "").toLowerCase().includes("decideur")
    );

    const showUp = rdvs.filter((h) => {
      const desc = (h.description || "").toLowerCase();
      return desc.includes("show") || desc.includes("présent") || desc.includes("honor");
    });

    const devis48h = devis.filter((dv) => {
      const devisDate = new Date(dv.date).getTime();
      if (Number.isNaN(devisDate)) return false;
      const nearestPrevRdv = [...rdvs]
        .map((r) => new Date(r.date).getTime())
        .filter((t) => !Number.isNaN(t) && t <= devisDate)
        .sort((a, b) => b - a)[0];
      if (!nearestPrevRdv) return false;
      return devisDate - nearestPrevRdv <= 48 * 3600 * 1000;
    });

    return {
      calls: calls.length,
      rdvs: rdvs.length,
      devis: devis.length,
      signatures: signatures.length,
      decideurPct: toPercent(decideurConversations.length, calls.length),
      rdvPct: toPercent(rdvs.length, calls.length),
      showUpPct: toPercent(showUp.length, rdvs.length),
      devis48hPct: toPercent(devis48h.length, devis.length),
      signedPct: toPercent(signatures.length, devis.length),
    };
  }, [history]);

  const aiMeta = extractAiMeta(enrichment?.ai_meta);


  const quickLinks: Array<{ label: string; url: string }> = [
    { label: "Site web", url: enrichment?.website_url || selectedCompany?.site_web_canonique || "" },
    { label: "Google Maps", url: enrichment?.google_maps_url || "" },
    { label: "Google", url: enrichment?.google_url || "" },
    { label: "Page contact", url: enrichment?.contact_page_url || "" },
    { label: "LinkedIn", url: selectedCompany?.linkedin_url || "" },
  ].filter((link): link is { label: string; url: string } => Boolean(link.url));

  const handleSaveCallNote = async () => {
    if (!selectedCompanyId) return;

    const description = [
      `Issue appel: ${callOutcome}`,
      `Client a dit: ${clientFeedback || "-"}`,
      `A retenir: ${followUpNotes || "-"}`,
      `Rappeler le: ${recallAt ? formatDate(recallAt) : "non"}`,
      `Nouveau RDV: ${newMeetingAt ? formatDate(newMeetingAt) : "non"}`,
    ].join("\n");

    try {
      await journalApi.logCall(undefined, selectedCompanyId, description);

      if (newMeetingAt) {
        await journalApi.logRdv(undefined, selectedCompanyId, `RDV planifié pour ${formatDate(newMeetingAt)}`);
      }

      toast.success("Note d'appel enregistrée");
      setClientFeedback("");
      setFollowUpNotes("");
      setRecallAt("");
      setNewMeetingAt("");
      await loadCompanyData(selectedCompanyId);
    } catch {
      toast.error("Impossible d'enregistrer la note");
    }
  };

  return (
    <div className="space-y-4">

    <div className="grid gap-4 lg:grid-cols-[280px_1fr_340px] min-h-[70vh]">
      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4" /> Entreprises qualifiées</CardTitle>
          {scopedOpportunities.length > 0 && (
            <div className="grid gap-2">
              <Select value={stageFilter} onValueChange={setStageFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Filtrer par étape" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les étapes</SelectItem>
                  {pipelineStages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id.toString()}>{stage.nom}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="grid gap-2 grid-cols-2">
                <Select value={tagFilter} onValueChange={setTagFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tag" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les tags</SelectItem>
                    {availableTags.map((tag) => (
                      <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={flagFilter} onValueChange={setFlagFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Flag" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les flags</SelectItem>
                    {availableFlags.map((flag) => (
                      <SelectItem key={flag} value={flag}>{flag}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowHiddenCompanies((prev) => !prev)}
            className="w-fit"
          >
            {showHiddenCompanies ? <Eye className="h-4 w-4 mr-1" /> : <EyeOff className="h-4 w-4 mr-1" />}
            {showHiddenCompanies ? "Masquer les entreprises cachées" : "Afficher les entreprises cachées"}
          </Button>
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" placeholder="Filtrer..." />
          </div>
        </CardHeader>
        <CardContent className="space-y-2 max-h-[72vh] overflow-auto">
          {filteredCompanies.map((company) => {
            const isActive = company.id === selectedCompanyId;
            const companyOpps = scopedOpportunities.filter((o) => o.entreprise_id === company.id);
            const oppCount = companyOpps.length;
            return (
              <button
                key={company.id}
                onClick={() => setSelectedCompanyId(company.id)}
                className={`w-full text-left rounded-md border p-2 transition ${isActive ? "border-primary bg-primary/5" : "hover:bg-muted/60"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{getCompanyDisplayName(company.name, company.canonical_url)}</div>
                    <div className="text-xs text-muted-foreground">
                      {company.ville || "Ville inconnue"}
                      {companyOpps.length > 0 && ` · ${getStageName(pipelineStages, companyOpps[0]?.stage_id)}`}
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleCompanyVisibility(company.id);
                    }}
                    title="Masquer cette entreprise"
                  >
                    <EyeOff className="h-4 w-4" />
                  </Button>
                </div>
                <div className="mt-2"><Badge variant="secondary">{oppCount} opportunité(s)</Badge></div>
              </button>
            );
          })}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Phone className="h-4 w-4" /> Mode Cold Call</CardTitle>
          {selectedCompany && (
            <p className="text-sm text-muted-foreground">
              {getCompanyDisplayName(selectedCompany.name, selectedCompany.canonical_url)} · {companyContacts.length} contact(s) · {companyOpportunities.length} opportunité(s)
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-4 max-h-[72vh] overflow-auto">
          <div className="rounded-md border p-3 bg-muted/30">
            <p className="text-sm leading-relaxed">
              {aiMeta.company_profile_long_ai || enrichment?.site_summary || "Aucun résumé enrichi disponible pour cette entreprise."}
            </p>
          </div>

          <Separator />

          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Note d'appel structurée</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Résultat appel</Label>
                <Select value={callOutcome} onValueChange={setCallOutcome}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="interesse">Intéressé</SelectItem>
                    <SelectItem value="a_rappeler">À rappeler</SelectItem>
                    <SelectItem value="pas_interesse">Pas intéressé</SelectItem>
                    <SelectItem value="no_answer">Pas de réponse</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Rappel prévu</Label>
                <Input type="datetime-local" value={recallAt} onChange={(e) => setRecallAt(e.target.value)} />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Ce qu'a dit le client</Label>
                <Textarea value={clientFeedback} onChange={(e) => setClientFeedback(e.target.value)} rows={3} />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Points à retenir / objections / next step</Label>
                <Textarea value={followUpNotes} onChange={(e) => setFollowUpNotes(e.target.value)} rows={4} />
              </div>
              <div className="space-y-1.5">
                <Label>Nouveau RDV</Label>
                <Input type="datetime-local" value={newMeetingAt} onChange={(e) => setNewMeetingAt(e.target.value)} />
              </div>
            </div>
            <Button onClick={handleSaveCallNote} disabled={!selectedCompanyId || isLoading}>Enregistrer la note d'appel</Button>
          </div>

          <Separator />

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Historique récent</h3>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun événement journal.</p>
            ) : (
              <div className="space-y-2">
                {history.map((entry, idx) => (
                  <div key={`${entry.date}-${idx}`} className="rounded-md border p-2">
                    <div className="text-xs text-muted-foreground">{formatDate(entry.date)} · {entry.type_evenement}</div>
                    <p className="text-sm whitespace-pre-line">{entry.description || "-"}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Target className="h-4 w-4" /> Vue CRM</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 max-h-[72vh] overflow-auto">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">KPIs conversion (%)</h3>
            <div className="grid grid-cols-1 gap-2 text-sm">
              <div className="rounded-md border p-2 flex justify-between"><span>% conversations décideur</span><strong>{metrics.decideurPct}%</strong></div>
              <div className="rounded-md border p-2 flex justify-between"><span>% RDV / conversations</span><strong>{metrics.rdvPct}%</strong></div>
              <div className="rounded-md border p-2 flex justify-between"><span>% show-up RDV</span><strong>{metrics.showUpPct}%</strong></div>
              <div className="rounded-md border p-2 flex justify-between"><span>% devis envoyés &lt;48h</span><strong>{metrics.devis48hPct}%</strong></div>
              <div className="rounded-md border p-2 flex justify-between"><span>% signés</span><strong>{metrics.signedPct}%</strong></div>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Accès rapide</h3>
            {quickLinks.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun lien enrichi disponible.</p>
            ) : (
              quickLinks.map((link) => (
                <a key={link.label} href={link.url} target="_blank" rel="noreferrer" className="rounded-md border p-2 flex items-center justify-between text-sm hover:bg-muted/60">
                  <span className="flex items-center gap-2"><LinkIcon className="h-3.5 w-3.5" /> {link.label}</span>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                </a>
              ))
            )}

            {(selectedCompany?.note_moyenne || selectedCompany?.nombre_avis) && (
              <div className="rounded-md border p-2 text-sm">
                ⭐ Note Google: <strong>{selectedCompany.note_moyenne ?? "-"}</strong> ({selectedCompany.nombre_avis ?? 0} avis)
              </div>
            )}
          </div>

          <Separator />

          <div className="space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-2"><Sparkles className="h-4 w-4" /> AI Meta</h3>
            {!!aiMeta.business_facts?.certifications_labels?.length && (
              <div className="flex flex-wrap gap-1">
                {aiMeta.business_facts.certifications_labels.map((label) => (
                  <Badge key={label} variant="outline">{label}</Badge>
                ))}
              </div>
            )}
            {!!aiMeta.differentiators?.length && (
              <ul className="text-sm list-disc pl-5 space-y-1">
                {aiMeta.differentiators.slice(0, 5).map((item, idx) => <li key={idx}>{item}</li>)}
              </ul>
            )}
            {!!aiMeta.proof_points?.length && (
              <div className="space-y-2">
                {aiMeta.proof_points.slice(0, 3).map((point, idx) => (
                  <div className="rounded-md border p-2" key={idx}>
                    <p className="text-sm font-medium">{point.claim || "Preuve"}</p>
                    <p className="text-xs text-muted-foreground">{point.evidence_excerpt || ""}</p>
                    {point.source_url && (
                      <a href={point.source_url} target="_blank" rel="noreferrer" className="text-xs underline inline-flex items-center gap-1 mt-1">
                        Source <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
            {!aiMeta.company_profile_long_ai && !aiMeta.differentiators?.length && !aiMeta.proof_points?.length && (
              <p className="text-sm text-muted-foreground">Aucune donnée AI meta disponible.</p>
            )}
          </div>

          {!!enrichment?.services_list?.length && (
            <>
              <Separator />
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-2"><FileText className="h-4 w-4" /> Services</h3>
                <div className="flex flex-wrap gap-1 mt-2">
                  {enrichment.services_list.slice(0, 12).map((service) => <Badge key={service} variant="secondary">{service}</Badge>)}
                </div>
              </div>
            </>
          )}

          {isLoading && (
            <p className="text-xs text-muted-foreground">Chargement des données…</p>
          )}

          <div className="text-xs text-muted-foreground flex items-center gap-2"><MapPinned className="h-3.5 w-3.5" /> Heuristiques KPI basées sur le journal descriptif actuel.</div>
        </CardContent>
      </Card>
    </div>
    </div>
  );
};
