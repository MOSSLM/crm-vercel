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
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Building2,
  ExternalLink,
  FileText,
  Link as LinkIcon,
  MapPinned,
  Phone,
  Search,
  Sparkles,
  Target,
} from "lucide-react";

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

export const QualifiedColdCallWorkspace: React.FC = () => {
  const { companies, contacts, opportunities } = useAppData();
  const qualifiedCompanies = useMemo(() => companies.filter((c) => c.qualifie), [companies]);

  const [search, setSearch] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(qualifiedCompanies[0]?.id ?? null);
  const [enrichment, setEnrichment] = useState<AutomatedEnrichmentRecord | null>(null);
  const [history, setHistory] = useState<JournalEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [callOutcome, setCallOutcome] = useState("a_rappeler");
  const [clientFeedback, setClientFeedback] = useState("");
  const [followUpNotes, setFollowUpNotes] = useState("");
  const [recallAt, setRecallAt] = useState("");
  const [newMeetingAt, setNewMeetingAt] = useState("");

  const filteredCompanies = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return qualifiedCompanies;
    return qualifiedCompanies.filter((c) => {
      const name = getCompanyDisplayName(c.name, c.canonical_url).toLowerCase();
      return name.includes(q) || (c.ville || "").toLowerCase().includes(q);
    });
  }, [qualifiedCompanies, search]);

  useEffect(() => {
    if (!selectedCompanyId && filteredCompanies.length > 0) {
      setSelectedCompanyId(filteredCompanies[0].id);
    }
  }, [filteredCompanies, selectedCompanyId]);

  const selectedCompany = useMemo(
    () => qualifiedCompanies.find((c) => c.id === selectedCompanyId) ?? null,
    [qualifiedCompanies, selectedCompanyId]
  );

  const companyContacts = useMemo(
    () => contacts.filter((contact) => contact.entreprise_id === selectedCompanyId),
    [contacts, selectedCompanyId]
  );

  const companyOpportunities = useMemo(
    () => opportunities.filter((opp) => opp.entreprise_id === selectedCompanyId),
    [opportunities, selectedCompanyId]
  );

  const loadCompanyData = async (companyId: number) => {
    setIsLoading(true);
    try {
      const [{ data: enrichmentRow, error: enrichmentError }, historyData] = await Promise.all([
        supabase
          .from("automated_enrichment")
          .select("entreprise_id, website_url, google_maps_url, google_url, contact_page_url, site_summary, services_list, ai_meta")
          .eq("entreprise_id", companyId)
          .maybeSingle(),
        journalApi.getJournalHistory(undefined, companyId, { limit: 50 }),
      ]);

      if (enrichmentError) {
        throw enrichmentError;
      }

      setEnrichment((enrichmentRow as AutomatedEnrichmentRecord | null) ?? null);
      setHistory(historyData as JournalEntry[]);
    } catch {
      toast.error("Impossible de charger les données cold call");
      setEnrichment(null);
      setHistory([]);
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

  const callTrendData = useMemo(() => {
    const points = 8;
    const labels: string[] = [];

    for (let i = points - 1; i >= 0; i -= 1) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      labels.push(date.toISOString().slice(0, 10));
    }

    return labels.map((isoDate) => {
      const calls = history.filter((item) => {
        const type = item.type_evenement.toLowerCase();
        return item.date.slice(0, 10) === isoDate && (type === "cold_call" || type === "appel");
      }).length;

      const meetings = history.filter((item) => item.date.slice(0, 10) === isoDate && item.type_evenement.startsWith("rdv_")).length;

      return {
        label: new Date(isoDate).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
        calls,
        meetings,
      };
    });
  }, [history]);

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
      <div className="grid gap-3 md:grid-cols-4">
        <Card className="bg-gradient-to-br from-background to-muted/30">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Entreprises qualifiées</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-semibold">{qualifiedCompanies.length}</p></CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-background to-muted/30">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Avec téléphone direct</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-semibold text-indigo-600">{qualifiedCompanies.filter((c) => Boolean(c.telephone)).length}</p></CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-background to-muted/30">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Appels (historique)</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-semibold text-orange-600">{metrics.calls}</p></CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-background to-muted/30">
          <CardHeader className="pb-2"><CardTitle className="text-sm">RDV pris</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-semibold text-emerald-600">{metrics.rdvs}</p></CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-md bg-gradient-to-br from-background via-background to-muted/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Pulse prospection téléphone</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={callTrendData} margin={{ top: 10, right: 8, left: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="phoneCallsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity={0.9} />
                    <stop offset="20%" stopColor="#fb923c" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#ea580c" stopOpacity={0.08} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="label" />
                <YAxis allowDecimals={false} />
                <RechartsTooltip />
                <Area type="monotone" dataKey="calls" stroke="#ea580c" strokeWidth={3} fill="url(#phoneCallsGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

    <div className="grid gap-4 lg:grid-cols-[280px_1fr_340px] min-h-[70vh]">
      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4" /> Entreprises qualifiées</CardTitle>
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" placeholder="Filtrer..." />
          </div>
        </CardHeader>
        <CardContent className="space-y-2 max-h-[72vh] overflow-auto">
          {filteredCompanies.map((company) => {
            const isActive = company.id === selectedCompanyId;
            const oppCount = opportunities.filter((o) => o.entreprise_id === company.id).length;
            return (
              <button
                key={company.id}
                onClick={() => setSelectedCompanyId(company.id)}
                className={`w-full text-left rounded-md border p-2 transition ${isActive ? "border-primary bg-primary/5" : "hover:bg-muted/60"}`}
              >
                <div className="font-medium text-sm truncate">{getCompanyDisplayName(company.name, company.canonical_url)}</div>
                <div className="text-xs text-muted-foreground">{company.ville || "Ville inconnue"}</div>
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
