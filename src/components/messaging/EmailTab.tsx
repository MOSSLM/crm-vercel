"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useAppData } from "@/components/AppDataContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Mail,
  Send,
  Search,
  Filter,
  Building2,
  User,
  RefreshCw,
  ChevronRight,
  CheckCircle2,
  Magnet,
  AlertCircle,
  Clock,
  Inbox,
  Sparkles,
  Eye,
  EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import { Opportunity, Contact, Pipeline, PipelineStage } from "@/types";
import { listLeadMagnetCards } from "@/utils/leadMagnetV2Api";

// ─── Types ───────────────────────────────────────────────────────────────────

interface EmailLog {
  id: string;
  to_email: string;
  to_name?: string;
  subject: string;
  status: "sent" | "failed" | "pending";
  sent_at: string;
  contact_id?: string;
  entreprise_id?: number;
  opportunite_id?: string;
}

interface ContactRow {
  contact: Contact;
  opportunity?: Opportunity;
  companyName: string;
  pipelineName?: string;
  stageName?: string;
  hasLeadMagnet: boolean;
  leadMagnetReady: boolean;
  leadMagnetUrl?: string;
}

// ─── Email templates ──────────────────────────────────────────────────────────

const TEMPLATES = [
  {
    id: "lead_magnet",
    label: "Envoi Lead Magnet",
    subject: "Votre audit gratuit est prêt — {{company_name}}",
    body: `Bonjour {{contact_name}},

J'espère que vous allez bien.

Suite à notre échange, j'ai le plaisir de vous partager votre audit personnalisé pour {{company_name}} :

👉 {{lead_magnet_url}}

Ce document vous donne une vision claire de vos opportunités d'amélioration et des leviers concrets pour développer votre activité.

N'hésitez pas à me faire part de vos questions — je reste disponible pour en discuter.

Bonne lecture,`,
  },
  {
    id: "suivi",
    label: "Relance / Suivi",
    subject: "Suite à notre conversation — {{company_name}}",
    body: `Bonjour {{contact_name}},

Je me permets de revenir vers vous suite à notre dernier échange concernant {{company_name}}.

Avez-vous eu l'occasion de réfléchir à notre proposition ? Je serais ravi(e) d'échanger avec vous pour répondre à vos éventuelles questions.

Dans l'attente de vous lire,`,
  },
  {
    id: "premier_contact",
    label: "Premier contact",
    subject: "Développer la visibilité de {{company_name}} en ligne",
    body: `Bonjour {{contact_name}},

Je me permets de vous contacter car j'ai identifié plusieurs opportunités pour renforcer la présence en ligne de {{company_name}}.

Je serais ravi(e) de vous présenter notre approche en quelques minutes — auriez-vous un créneau cette semaine ?

Cordialement,`,
  },
  {
    id: "blank",
    label: "Message libre",
    subject: "",
    body: "",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function interpolate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Main component ───────────────────────────────────────────────────────────

export function EmailTab() {
  const { contacts, opportunities, pipelines, pipelineStages, companies } = useAppData();

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPipeline, setFilterPipeline] = useState<string>("all");
  const [filterStage, setFilterStage] = useState<string>("all");
  const [filterLm, setFilterLm] = useState<"all" | "with_lm" | "lm_ready" | "no_lm">("all");
  const [filterHasEmail, setFilterHasEmail] = useState(true);

  // Selection
  const [selectedRow, setSelectedRow] = useState<ContactRow | null>(null);

  // Compose
  const [templateId, setTemplateId] = useState("lead_magnet");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [toEmail, setToEmail] = useState("");
  const [toName, setToName] = useState("");
  const [sending, setSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Logs
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Lead magnet data
  const [lmMap, setLmMap] = useState<Map<string, { ready: boolean; url?: string }>>(new Map());

  // Load lead magnet info
  useEffect(() => {
    listLeadMagnetCards().then((items) => {
      const map = new Map<string, { ready: boolean; url?: string }>();
      for (const item of items) {
        if (item.opportunity?.id) {
          const isReady = item.project.statut === "ready" || item.project.pret_pour_lm === true;
          const url =
            (item.project.cta_primary_target as string | null | undefined) ??
            `${window.location.origin}/api/public/lead-magnets/${item.project.id}`;
          map.set(item.opportunity.id, { ready: isReady, url });
        }
      }
      setLmMap(map);
    }).catch(() => {});
  }, []);

  // Build contact rows
  const contactRows = useMemo<ContactRow[]>(() => {
    const rows: ContactRow[] = [];
    for (const contact of contacts) {
      const company = companies.find((c) => c.id === contact.entreprise_id);
      const companyName = company?.name ?? `Entreprise #${contact.entreprise_id}`;

      // Find best opportunity for this contact
      const opp = opportunities.find(
        (o) => o.contact_id === contact.id || o.entreprise_id === contact.entreprise_id
      );

      const pipeline = opp?.pipeline_id
        ? pipelines.find((p) => p.id === opp.pipeline_id)
        : undefined;
      const stage = opp?.stage_id
        ? pipelineStages.find((s) => s.id === opp.stage_id)
        : undefined;

      const lmInfo = opp ? lmMap.get(opp.id) : undefined;
      const hasLeadMagnet = !!lmInfo || (opp?.lead_magnet ?? false);
      const leadMagnetReady = lmInfo?.ready ?? false;
      const leadMagnetUrl = lmInfo?.url;

      rows.push({
        contact,
        opportunity: opp,
        companyName,
        pipelineName: pipeline?.nom ?? undefined,
        stageName: stage?.nom ?? undefined,
        hasLeadMagnet,
        leadMagnetReady,
        leadMagnetUrl,
      });
    }
    return rows;
  }, [contacts, opportunities, companies, pipelines, pipelineStages, lmMap]);

  // Filter rows
  const filteredRows = useMemo<ContactRow[]>(() => {
    return contactRows.filter((row) => {
      if (filterHasEmail && !row.contact.email) return false;

      if (filterPipeline !== "all" && row.opportunity?.pipeline_id !== filterPipeline) return false;

      if (filterStage !== "all" && String(row.opportunity?.stage_id) !== filterStage) return false;

      if (filterLm === "with_lm" && !row.hasLeadMagnet) return false;
      if (filterLm === "lm_ready" && !row.leadMagnetReady) return false;
      if (filterLm === "no_lm" && row.hasLeadMagnet) return false;

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const name = `${row.contact.first_name ?? ""} ${row.contact.last_name ?? ""}`.toLowerCase();
        if (!name.includes(q) && !row.companyName.toLowerCase().includes(q) && !(row.contact.email ?? "").toLowerCase().includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [contactRows, filterHasEmail, filterPipeline, filterStage, filterLm, searchQuery]);

  // Stages for selected pipeline
  const availableStages = useMemo(() => {
    if (filterPipeline === "all") return pipelineStages;
    return pipelineStages.filter((s) => s.pipeline_id === filterPipeline);
  }, [filterPipeline, pipelineStages]);

  // Select contact → populate compose form
  const selectRow = useCallback((row: ContactRow) => {
    setSelectedRow(row);
    setToEmail(row.contact.email ?? "");
    setToName(`${row.contact.first_name ?? ""} ${row.contact.last_name ?? ""}`.trim());

    // Apply template
    const tmpl = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[0];
    const contactName = `${row.contact.first_name ?? ""}`.trim() || row.companyName;
    const vars: Record<string, string> = {
      company_name: row.companyName,
      contact_name: contactName,
      lead_magnet_url: row.leadMagnetUrl ?? "(lien lead magnet)",
    };
    setSubject(interpolate(tmpl.subject, vars));
    setBody(interpolate(tmpl.body, vars));

    // Load logs for this contact
    loadLogs(row.contact.id);
  }, [templateId]);

  const applyTemplate = useCallback((id: string) => {
    setTemplateId(id);
    if (!selectedRow) return;
    const tmpl = TEMPLATES.find((t) => t.id === id);
    if (!tmpl) return;
    const contactName = `${selectedRow.contact.first_name ?? ""}`.trim() || selectedRow.companyName;
    const vars: Record<string, string> = {
      company_name: selectedRow.companyName,
      contact_name: contactName,
      lead_magnet_url: selectedRow.leadMagnetUrl ?? "(lien lead magnet)",
    };
    setSubject(interpolate(tmpl.subject, vars));
    setBody(interpolate(tmpl.body, vars));
  }, [selectedRow]);

  const loadLogs = useCallback(async (contactId?: string) => {
    setLogsLoading(true);
    try {
      const params = new URLSearchParams();
      if (contactId) params.set("contact_id", contactId);
      const res = await fetch(`/api/email/logs?${params}`);
      const json = await res.json();
      setLogs(json.logs ?? []);
    } catch {
      setLogs([]);
    } finally {
      setLogsLoading(false);
    }
  }, []);

  // Initial load of recent logs
  useEffect(() => { loadLogs(); }, [loadLogs]);

  const handleSend = async () => {
    if (!toEmail || !subject || !body) {
      toast.error("Destinataire, objet et corps sont requis");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to_email: toEmail,
          to_name: toName || undefined,
          subject,
          body_html: body.replace(/\n/g, "<br>"),
          body_text: body,
          contact_id: selectedRow?.contact.id,
          entreprise_id: selectedRow?.contact.entreprise_id,
          opportunite_id: selectedRow?.opportunity?.id,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Échec");
      toast.success("Email envoyé avec succès !");
      loadLogs(selectedRow?.contact.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de l'envoi");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-full gap-0 overflow-hidden">
      {/* ── LEFT: Contact list ── */}
      <div className="flex w-80 shrink-0 flex-col border-r">
        {/* Filters */}
        <div className="space-y-2 border-b p-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Rechercher…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 text-sm"
            />
          </div>

          <div className="flex gap-1.5">
            <Select value={filterPipeline} onValueChange={(v) => { setFilterPipeline(v); setFilterStage("all"); }}>
              <SelectTrigger className="h-7 flex-1 text-xs">
                <SelectValue placeholder="Pipeline" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous pipelines</SelectItem>
                {pipelines.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.nom}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterLm} onValueChange={(v) => setFilterLm(v as typeof filterLm)}>
              <SelectTrigger className="h-7 flex-1 text-xs">
                <SelectValue placeholder="Lead Magnet" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="with_lm">Avec LM</SelectItem>
                <SelectItem value="lm_ready">LM prêt</SelectItem>
                <SelectItem value="no_lm">Sans LM</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filterPipeline !== "all" && (
            <Select value={filterStage} onValueChange={setFilterStage}>
              <SelectTrigger className="h-7 w-full text-xs">
                <SelectValue placeholder="Étape" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes étapes</SelectItem>
                {availableStages.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.nom}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {filteredRows.length} contact{filteredRows.length > 1 ? "s" : ""}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-2 text-xs"
              onClick={() => setFilterHasEmail(!filterHasEmail)}
            >
              {filterHasEmail ? <Filter className="h-3 w-3" /> : <Filter className="h-3 w-3 text-muted-foreground" />}
              {filterHasEmail ? "Email requis" : "Tous"}
            </Button>
          </div>
        </div>

        {/* Contact list */}
        <ScrollArea className="flex-1">
          <div className="divide-y">
            {filteredRows.map((row) => (
              <button
                key={row.contact.id}
                onClick={() => selectRow(row)}
                className={`flex w-full items-start gap-2.5 p-3 text-left transition-colors hover:bg-accent ${selectedRow?.contact.id === row.contact.id ? "bg-accent" : ""}`}
              >
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {(row.contact.first_name?.[0] ?? row.companyName[0] ?? "?").toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-sm font-medium">
                      {row.contact.first_name} {row.contact.last_name}
                    </span>
                    {row.leadMagnetReady && (
                      <Magnet className="h-3 w-3 shrink-0 text-emerald-500" />
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Building2 className="h-3 w-3 shrink-0" />
                    <span className="truncate">{row.companyName}</span>
                  </div>
                  {row.contact.email ? (
                    <span className="truncate text-xs text-muted-foreground">{row.contact.email}</span>
                  ) : (
                    <span className="text-xs text-destructive/70">Pas d&apos;email</span>
                  )}
                  <div className="mt-1 flex flex-wrap gap-1">
                    {row.pipelineName && (
                      <Badge variant="secondary" className="h-4 px-1 text-[10px]">{row.pipelineName}</Badge>
                    )}
                    {row.stageName && (
                      <Badge variant="outline" className="h-4 px-1 text-[10px]">{row.stageName}</Badge>
                    )}
                  </div>
                </div>
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
            {filteredRows.length === 0 && (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Aucun contact trouvé
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* ── CENTER: Compose ── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {selectedRow ? (
          <>
            {/* Header */}
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-sm font-semibold">
                    {selectedRow.contact.first_name} {selectedRow.contact.last_name}
                  </p>
                  <p className="text-xs text-muted-foreground">{selectedRow.companyName}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedRow.leadMagnetReady && (
                  <Badge className="gap-1 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20">
                    <Magnet className="h-3 w-3" />
                    LM prêt
                  </Badge>
                )}
                {selectedRow.hasLeadMagnet && !selectedRow.leadMagnetReady && (
                  <Badge variant="secondary" className="gap-1">
                    <Clock className="h-3 w-3" />
                    LM en cours
                  </Badge>
                )}
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="space-y-4 p-4">
                {/* Template selector */}
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-muted-foreground" />
                  <div className="flex flex-wrap gap-1.5">
                    {TEMPLATES.map((t) => (
                      <Button
                        key={t.id}
                        variant={templateId === t.id ? "default" : "outline"}
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => applyTemplate(t.id)}
                      >
                        {t.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <Separator />

                {/* To */}
                <div className="grid gap-1.5">
                  <Label className="text-xs font-medium">À</Label>
                  <div className="flex gap-2">
                    <Input
                      value={toName}
                      onChange={(e) => setToName(e.target.value)}
                      placeholder="Nom"
                      className="h-8 text-sm"
                    />
                    <Input
                      value={toEmail}
                      onChange={(e) => setToEmail(e.target.value)}
                      placeholder="email@exemple.com"
                      type="email"
                      className="h-8 flex-1 text-sm"
                    />
                  </div>
                </div>

                {/* Subject */}
                <div className="grid gap-1.5">
                  <Label className="text-xs font-medium">Objet</Label>
                  <Input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Objet de l'email"
                    className="h-8 text-sm"
                  />
                </div>

                {/* Lead magnet link hint */}
                {selectedRow.leadMagnetUrl && (
                  <div className="flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
                    <Magnet className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="flex-1 truncate text-xs text-emerald-700 dark:text-emerald-400">
                      {selectedRow.leadMagnetUrl}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => {
                        const cursor = `\n\n👉 ${selectedRow.leadMagnetUrl}\n`;
                        setBody((prev) => prev + cursor);
                      }}
                    >
                      Insérer
                    </Button>
                  </div>
                )}

                {/* Body */}
                <div className="grid gap-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Message</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 gap-1 px-2 text-xs"
                      onClick={() => setShowPreview(!showPreview)}
                    >
                      {showPreview ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      {showPreview ? "Éditer" : "Aperçu"}
                    </Button>
                  </div>
                  {showPreview ? (
                    <div
                      className="min-h-48 rounded-md border bg-card p-4 text-sm leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: body.replace(/\n/g, "<br>") }}
                    />
                  ) : (
                    <Textarea
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      placeholder="Rédigez votre message…"
                      rows={12}
                      className="resize-none text-sm"
                    />
                  )}
                </div>
              </div>
            </ScrollArea>

            {/* Send bar */}
            <div className="flex items-center justify-between border-t px-4 py-3">
              <span className="text-xs text-muted-foreground">
                Via Resend · {toEmail || "—"}
              </span>
              <Button
                onClick={handleSend}
                disabled={sending || !toEmail || !subject || !body}
                className="gap-2"
              >
                {sending ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Envoyer
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
            <Mail className="h-10 w-10 opacity-20" />
            <p className="text-sm">Sélectionnez un contact pour composer un email</p>
          </div>
        )}
      </div>

      {/* ── RIGHT: Sent history ── */}
      <div className="flex w-72 shrink-0 flex-col border-l">
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            <Inbox className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Historique</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => loadLogs(selectedRow?.contact.id)}
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>

        <ScrollArea className="flex-1">
          {logsLoading ? (
            <div className="space-y-2 p-3">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              Aucun email envoyé
              {selectedRow && " pour ce contact"}
            </div>
          ) : (
            <div className="divide-y">
              {logs.map((log) => (
                <div key={log.id} className="p-3">
                  <div className="flex items-start justify-between gap-1">
                    <span className="line-clamp-2 text-xs font-medium leading-tight">{log.subject}</span>
                    {log.status === "sent" ? (
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                    ) : (
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{log.to_email}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{formatDate(log.sent_at)}</p>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
