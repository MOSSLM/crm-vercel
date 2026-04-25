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
import {
  MessageCircle,
  Search,
  User,
  Building2,
  ChevronRight,
  Magnet,
  Clock,
  Phone,
  Sparkles,
  ExternalLink,
  Copy,
  Check,
  Filter,
} from "lucide-react";
import { toast } from "sonner";
import { listLeadMagnetCards } from "@/utils/leadMagnetV2Api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ContactRow {
  kind: "contact";
  id: string;
  contactId: string;
  firstName: string;
  lastName: string;
  tel: string;
  companyName: string;
  companyId: number;
  pipelineName?: string;
  stageName?: string;
  hasLeadMagnet: boolean;
  leadMagnetReady: boolean;
  leadMagnetUrl?: string;
  opportunityId?: string;
}

interface CompanyRow {
  kind: "company";
  id: string;
  companyId: number;
  companyName: string;
  tel: string;
  pipelineName?: string;
  stageName?: string;
  hasLeadMagnet: boolean;
  leadMagnetReady: boolean;
  leadMagnetUrl?: string;
  opportunityId?: string;
}

type WhatsAppRow = ContactRow | CompanyRow;

// ─── Message templates ────────────────────────────────────────────────────────

const TEMPLATES = [
  {
    id: "lead_magnet",
    label: "Envoi Lead Magnet",
    body: (vars: Record<string, string>) =>
      `Bonjour ${vars.first_name} 👋

Suite à notre échange, j'ai préparé votre audit personnalisé pour *${vars.company_name}* :

👉 ${vars.lead_magnet_url}

Vous y trouverez des recommandations concrètes pour booster votre visibilité en ligne.

Dites-moi ce que vous en pensez ! 😊`,
  },
  {
    id: "suivi",
    label: "Relance douce",
    body: (vars: Record<string, string>) =>
      `Bonjour ${vars.first_name},

Je me permets de revenir vers vous concernant *${vars.company_name}*.

Avez-vous eu l'occasion de consulter ce qu'on avait préparé ?

N'hésitez pas à me faire signe 🙂`,
  },
  {
    id: "premier_contact",
    label: "Premier contact",
    body: (vars: Record<string, string>) =>
      `Bonjour ${vars.first_name} 👋

Je m'appelle [Votre prénom] et j'accompagne des entreprises comme *${vars.company_name}* à développer leur présence en ligne.

J'aurais quelques idées à vous soumettre — auriez-vous 10 min cette semaine ?`,
  },
  {
    id: "rdv",
    label: "Confirmation RDV",
    body: (vars: Record<string, string>) =>
      `Bonjour ${vars.first_name},

Je confirme notre rendez-vous pour *${vars.company_name}*.

Au plaisir d'échanger avec vous 🙂`,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sanitizePhone(raw: string): string {
  // Normalize French numbers to international format
  let phone = raw.replace(/[\s.\-()]/g, "");
  if (phone.startsWith("0")) phone = "+33" + phone.slice(1);
  if (!phone.startsWith("+")) phone = "+" + phone;
  return phone;
}

function isMobilePhone(raw: string): boolean {
  if (!raw) return false;
  const cleaned = raw.replace(/[^0-9+]/g, "");
  if (cleaned.startsWith("+33")) {
    const local = cleaned.slice(3);
    return /^([67])\d{8}$/.test(local);
  }
  if (cleaned.startsWith("33")) {
    const local = cleaned.slice(2);
    return /^([67])\d{8}$/.test(local);
  }
  if (cleaned.startsWith("0")) {
    return /^0[67]\d{8}$/.test(cleaned);
  }
  return false;
}

function buildWhatsAppUrl(phone: string, message: string): string {
  const sanitized = sanitizePhone(phone).replace("+", "");
  const encoded = encodeURIComponent(message);
  return `https://wa.me/${sanitized}?text=${encoded}`;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function WhatsAppTab() {
  const { contacts, opportunities, pipelines, pipelineStages, companies } = useAppData();
  const [mode, setMode] = useState<"contacts" | "entreprises">("contacts");

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPipeline, setFilterPipeline] = useState<string>("all");
  const [filterStage, setFilterStage] = useState<string>("all");
  const [filterLm, setFilterLm] = useState<"all" | "with_lm" | "lm_ready" | "no_lm">("all");
  const [filterHasTel, setFilterHasTel] = useState(true);

  // Selection & compose
  const [selectedRow, setSelectedRow] = useState<WhatsAppRow | null>(null);
  const [templateId, setTemplateId] = useState("lead_magnet");
  const [messageBody, setMessageBody] = useState("");
  const [phone, setPhone] = useState("");
  const [copied, setCopied] = useState(false);

  // Lead magnet data
  const [lmMap, setLmMap] = useState<Map<string, { ready: boolean; url?: string }>>(new Map());

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
    return contacts.map((contact) => {
      const company = companies.find((c) => c.id === contact.entreprise_id);
      const companyName = company?.name ?? `Entreprise #${contact.entreprise_id}`;
      const opp = opportunities.find(
        (o) => o.contact_id === contact.id || o.entreprise_id === contact.entreprise_id
      );
      const pipeline = opp?.pipeline_id ? pipelines.find((p) => p.id === opp.pipeline_id) : undefined;
      const stage = opp?.stage_id ? pipelineStages.find((s) => s.id === opp.stage_id) : undefined;
      const lmInfo = opp ? lmMap.get(opp.id) : undefined;

      return {
        kind: "contact",
        id: `contact:${contact.id}`,
        contactId: contact.id,
        firstName: contact.first_name ?? "",
        lastName: contact.last_name ?? "",
        tel: contact.tel ?? "",
        companyName,
        companyId: contact.entreprise_id,
        pipelineName: pipeline?.nom ?? undefined,
        stageName: stage?.nom ?? undefined,
        hasLeadMagnet: !!lmInfo || (opp?.lead_magnet ?? false),
        leadMagnetReady: lmInfo?.ready ?? false,
        leadMagnetUrl: lmInfo?.url,
        opportunityId: opp?.id,
      };
    });
  }, [contacts, opportunities, companies, pipelines, pipelineStages, lmMap]);

  const companyRows = useMemo<CompanyRow[]>(() => {
    return companies.map((company) => {
      const opp = opportunities.find((o) => o.entreprise_id === company.id);
      const pipeline = opp?.pipeline_id ? pipelines.find((p) => p.id === opp.pipeline_id) : undefined;
      const stage = opp?.stage_id ? pipelineStages.find((s) => s.id === opp.stage_id) : undefined;
      const lmInfo = opp ? lmMap.get(opp.id) : undefined;

      return {
        kind: "company",
        id: `company:${company.id}`,
        companyId: company.id,
        companyName: company.name ?? `Entreprise #${company.id}`,
        tel: company.telephone ?? "",
        pipelineName: pipeline?.nom ?? undefined,
        stageName: stage?.nom ?? undefined,
        hasLeadMagnet: !!lmInfo || (opp?.lead_magnet ?? false),
        leadMagnetReady: lmInfo?.ready ?? false,
        leadMagnetUrl: lmInfo?.url,
        opportunityId: opp?.id,
      };
    });
  }, [companies, opportunities, pipelines, pipelineStages, lmMap]);

  // Filtered
  const rows = mode === "contacts" ? contactRows : companyRows;

  const filteredRows = useMemo<WhatsAppRow[]>(() => {
    return rows.filter((row) => {
      if (filterHasTel && !row.tel) return false;
      if (mode === "entreprises" && row.tel && !isMobilePhone(row.tel)) return false;
      if (filterPipeline !== "all" && !opportunities.some(
        (o) => (row.kind === "contact"
          ? (o.contact_id === row.contactId || o.entreprise_id === row.companyId)
          : o.entreprise_id === row.companyId) && o.pipeline_id === filterPipeline
      )) return false;
      if (filterStage !== "all" && !opportunities.some(
        (o) => (row.kind === "contact"
          ? (o.contact_id === row.contactId || o.entreprise_id === row.companyId)
          : o.entreprise_id === row.companyId) && String(o.stage_id) === filterStage
      )) return false;
      if (filterLm === "with_lm" && !row.hasLeadMagnet) return false;
      if (filterLm === "lm_ready" && !row.leadMagnetReady) return false;
      if (filterLm === "no_lm" && row.hasLeadMagnet) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const name = row.kind === "contact"
          ? `${row.firstName} ${row.lastName}`.toLowerCase()
          : row.companyName.toLowerCase();
        if (!name.includes(q) && !row.companyName.toLowerCase().includes(q) && !row.tel.includes(q)) return false;
      }
      return true;
    });
  }, [rows, mode, filterHasTel, filterPipeline, filterStage, filterLm, searchQuery, opportunities]);

  const availableStages = useMemo(() => {
    if (filterPipeline === "all") return pipelineStages;
    return pipelineStages.filter((s) => s.pipeline_id === filterPipeline);
  }, [filterPipeline, pipelineStages]);

  const buildMessage = useCallback((row: WhatsAppRow, tmplId: string) => {
    const tmpl = TEMPLATES.find((t) => t.id === tmplId) ?? TEMPLATES[0];
    return tmpl.body({
      first_name: row.kind === "contact" ? (row.firstName || row.companyName) : row.companyName,
      company_name: row.companyName,
      lead_magnet_url: row.leadMagnetUrl ?? "(lien lead magnet)",
    });
  }, []);

  const selectRow = useCallback((row: WhatsAppRow) => {
    setSelectedRow(row);
    setPhone(row.tel);
    setMessageBody(buildMessage(row, templateId));
  }, [templateId, buildMessage]);

  const applyTemplate = useCallback((id: string) => {
    setTemplateId(id);
    if (selectedRow) setMessageBody(buildMessage(selectedRow, id));
  }, [selectedRow, buildMessage]);

  const whatsappUrl = useMemo(() => {
    if (!phone || !messageBody) return null;
    return buildWhatsAppUrl(phone, messageBody);
  }, [phone, messageBody]);

  const handleOpenWhatsApp = () => {
    if (!whatsappUrl) return;
    window.open(whatsappUrl, "_blank");
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(messageBody);
    setCopied(true);
    toast.success("Message copié !");
    setTimeout(() => setCopied(false), 2000);
  };

  const charCount = messageBody.length;

  return (
    <div className="flex h-full gap-0 overflow-hidden">
      {/* ── LEFT: Contact list ── */}
      <div className="flex w-80 shrink-0 flex-col border-r">
        <div className="space-y-2 border-b p-3">
          <div className="flex rounded-md border p-0.5">
            <button
              onClick={() => { setMode("contacts"); setSelectedRow(null); }}
              className={`flex flex-1 items-center justify-center gap-1 rounded px-2 py-1 text-xs ${mode === "contacts" ? "bg-accent font-medium" : "text-muted-foreground"}`}
            >
              <User className="h-3 w-3" />
              Contacts
            </button>
            <button
              onClick={() => { setMode("entreprises"); setSelectedRow(null); }}
              className={`flex flex-1 items-center justify-center gap-1 rounded px-2 py-1 text-xs ${mode === "entreprises" ? "bg-accent font-medium" : "text-muted-foreground"}`}
            >
              <Building2 className="h-3 w-3" />
              Entreprises
            </button>
          </div>

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
              {filteredRows.length} {mode === "contacts" ? `contact${filteredRows.length > 1 ? "s" : ""}` : `entreprise${filteredRows.length > 1 ? "s" : ""}`}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-2 text-xs"
              onClick={() => setFilterHasTel(!filterHasTel)}
            >
              <Filter className="h-3 w-3" />
              {filterHasTel ? "Tel. requis" : "Tous"}
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="divide-y">
            {filteredRows.map((row) => (
              <button
                key={row.id}
                onClick={() => selectRow(row)}
                className={`flex w-full items-start gap-2.5 p-3 text-left transition-colors hover:bg-accent ${selectedRow?.id === row.id ? "bg-accent" : ""}`}
              >
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#25D366]/10 text-xs font-semibold text-[#25D366]">
                  {(row.kind === "contact"
                    ? (row.firstName[0] ?? row.companyName[0] ?? "?")
                    : (row.companyName[0] ?? "?")).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-sm font-medium">
                      {row.kind === "contact" ? `${row.firstName} ${row.lastName}`.trim() : row.companyName}
                    </span>
                    {row.leadMagnetReady && (
                      <Magnet className="h-3 w-3 shrink-0 text-emerald-500" />
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Building2 className="h-3 w-3 shrink-0" />
                    <span className="truncate">{row.companyName}</span>
                  </div>
                  {row.tel ? (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3 shrink-0" />
                      <span>{row.tel}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-destructive/70">Pas de numéro</span>
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
                {mode === "contacts" ? "Aucun contact trouvé" : "Aucune entreprise trouvée"}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* ── RIGHT: Compose ── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {selectedRow ? (
          <>
            {/* Header */}
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#25D366]/10">
                  <MessageCircle className="h-5 w-5 text-[#25D366]" />
                </div>
                <div>
                  <p className="text-sm font-semibold">
                    {selectedRow.kind === "contact"
                      ? `${selectedRow.firstName} ${selectedRow.lastName}`.trim()
                      : selectedRow.companyName}
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
                {/* Template buttons */}
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

                {/* Phone */}
                <div className="grid gap-1.5">
                  <Label className="text-xs font-medium">Numéro WhatsApp</Label>
                  <div className="relative">
                    <Phone className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+33 6 12 34 56 78"
                      className="h-8 pl-8 text-sm"
                    />
                  </div>
                  {phone && (
                    <p className="text-xs text-muted-foreground">
                      Format international : {sanitizePhone(phone)}
                    </p>
                  )}
                  {mode === "entreprises" && (
                    <p className="text-xs text-amber-600">
                      Seuls les numéros mobiles (06/07, +33 6/+33 7) sont listés pour les entreprises.
                    </p>
                  )}
                </div>

                {/* Lead magnet link info */}
                {selectedRow.leadMagnetUrl && (
                  <div className="flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
                    <Magnet className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                    <span className="flex-1 truncate text-xs text-emerald-700 dark:text-emerald-400">
                      {selectedRow.leadMagnetUrl}
                    </span>
                  </div>
                )}

                {/* Message composer */}
                <div className="grid gap-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Message</Label>
                    <span className="text-xs text-muted-foreground">{charCount} caractères</span>
                  </div>
                  <Textarea
                    value={messageBody}
                    onChange={(e) => setMessageBody(e.target.value)}
                    placeholder="Rédigez votre message WhatsApp…"
                    rows={10}
                    className="resize-none text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Astuce : utilisez *texte* pour mettre en gras dans WhatsApp
                  </p>
                </div>

                {/* Preview bubble */}
                {messageBody && (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Aperçu WhatsApp</Label>
                    <div className="relative rounded-xl rounded-tl-sm bg-[#dcf8c6] px-4 py-3 text-sm dark:bg-[#005c4b] max-w-sm">
                      <p className="whitespace-pre-wrap text-gray-800 dark:text-gray-100" style={{ fontSize: "0.875rem" }}>
                        {messageBody}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Action bar */}
            <div className="flex items-center gap-2 border-t px-4 py-3">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={handleCopy}
                disabled={!messageBody}
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                Copier
              </Button>

              <div className="flex-1" />

              <Button
                onClick={handleOpenWhatsApp}
                disabled={!whatsappUrl}
                className="gap-2 bg-[#25D366] text-white hover:bg-[#20bc5a]"
              >
                <MessageCircle className="h-4 w-4" />
                Ouvrir WhatsApp
                <ExternalLink className="h-3.5 w-3.5 opacity-70" />
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-muted-foreground">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#25D366]/10">
              <MessageCircle className="h-8 w-8 text-[#25D366]" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">
                {mode === "contacts" ? "Sélectionnez un contact" : "Sélectionnez une entreprise"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Le message sera pré-rempli avec le lead magnet ({mode === "contacts" ? "contact" : "entreprise"})
              </p>
            </div>
            <div className="mt-2 rounded-lg border border-[#25D366]/20 bg-[#25D366]/5 px-4 py-3 text-xs text-muted-foreground max-w-xs text-center">
              Le bouton &quot;Ouvrir WhatsApp&quot; ouvrira l&apos;application WhatsApp (bureau ou mobile) avec le message prêt à envoyer — vous n&apos;avez plus qu&apos;à cliquer sur Envoyer.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
