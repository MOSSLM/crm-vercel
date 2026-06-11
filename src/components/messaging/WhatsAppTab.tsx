"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
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
  MessageCircle, Search, User, Building2, ChevronRight, Magnet, Clock, Phone,
  Sparkles, ExternalLink, Copy, Check, Filter, Bold, Save, Plus, Trash2, X,
} from "lucide-react";
import { toast } from "sonner";
import { listLeadMagnetCards } from "@/utils/leadMagnetV2Api";
import { cn } from "@/lib/utils";

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

interface WaTemplate {
  id: string;
  label: string;
  body: string;
  isCustom?: boolean;
}

// ─── Variables disponibles ─────────────────────────────────────────────────────

const AVAILABLE_VARS = [
  { key: "{{prénom}}", label: "Prénom" },
  { key: "{{entreprise}}", label: "Entreprise" },
  { key: "{{lien_site}}", label: "Lien site" },
  { key: "{{lien_audit}}", label: "Lien audit" },
];

const STORAGE_KEY = "crm-wa-templates";

const DEFAULT_TEMPLATES: WaTemplate[] = [
  {
    id: "lead_magnet",
    label: "Envoi Lead Magnet",
    body: `Bonjour {{prénom}},

Comme convenu, voici l'audit préparé pour {{entreprise}} :

{{lien_site}}

Vous y trouverez des recommandations concrètes pour votre visibilité en ligne.

Dites-moi ce que vous en pensez.`,
  },
  {
    id: "suivi",
    label: "Relance douce",
    body: `Bonjour {{prénom}},

Je reviens vers vous concernant {{entreprise}}.

Avez-vous eu le temps de regarder ce que je vous avais envoyé ?`,
  },
  {
    id: "premier_contact",
    label: "Premier contact",
    body: `Bonjour {{prénom}},

Je m'appelle [Votre prénom], j'accompagne des entreprises comme {{entreprise}} sur leur présence en ligne.

J'aurais quelques idées à vous soumettre — auriez-vous 10 min cette semaine ?`,
  },
  {
    id: "envoi_audit",
    label: "Envoi Audit PDF",
    body: `Bonjour {{prénom}},

Voici votre audit pour {{entreprise}} :

{{lien_audit}}

Il détaille les points d'amélioration identifiés sur votre présence en ligne.

N'hésitez pas si vous avez des questions.`,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sanitizePhone(raw: string): string {
  let phone = raw.replace(/[\s.\-()]/g, "");
  if (phone.startsWith("0")) phone = "+33" + phone.slice(1);
  if (!phone.startsWith("+")) phone = "+" + phone;
  return phone;
}

function isMobilePhone(raw: string): boolean {
  if (!raw) return false;
  const cleaned = raw.replace(/[^0-9+]/g, "");
  if (cleaned.startsWith("+33")) return /^([67])\d{8}$/.test(cleaned.slice(3));
  if (cleaned.startsWith("33")) return /^([67])\d{8}$/.test(cleaned.slice(2));
  if (cleaned.startsWith("0")) return /^0[67]\d{8}$/.test(cleaned);
  return false;
}

function buildWhatsAppUrl(phone: string, message: string): string {
  const sanitized = sanitizePhone(phone).replace("+", "");
  return `https://wa.me/${sanitized}?text=${encodeURIComponent(message)}`;
}

function interpolate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{[^}]+\}\}/g, (match) => vars[match] ?? match);
}

function highlightVars(text: string): React.ReactNode[] {
  const parts = text.split(/({{[^}]+}})/g);
  return parts.map((part, i) =>
    /^{{[^}]+}}$/.test(part)
      ? <span key={i} className="rounded bg-emerald-100 px-1 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">{part}</span>
      : <span key={i}>{part}</span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function WhatsAppTab() {
  const { contacts, opportunities, pipelines, pipelineStages, companies } = useAppData();
  const [mode, setMode] = useState<"contacts" | "entreprises">("contacts");

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPipeline, setFilterPipeline] = useState<string>("all");
  const [filterLm, setFilterLm] = useState<"all" | "with_lm" | "lm_ready" | "no_lm">("all");
  const [filterHasTel, setFilterHasTel] = useState(true);

  // Selection & compose
  const [selectedRow, setSelectedRow] = useState<WhatsAppRow | null>(null);
  const [activeTemplateId, setActiveTemplateId] = useState("lead_magnet");
  const [messageBody, setMessageBody] = useState("");
  const [phone, setPhone] = useState("");
  const [copied, setCopied] = useState(false);

  // Lead magnet data
  const [lmMap, setLmMap] = useState<Map<string, { ready: boolean; url?: string }>>(new Map());

  // Custom templates
  const [templates, setTemplates] = useState<WaTemplate[]>(DEFAULT_TEMPLATES);
  const [editingTemplate, setEditingTemplate] = useState<WaTemplate | null>(null);
  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [newTplLabel, setNewTplLabel] = useState("");
  const [newTplBody, setNewTplBody] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Raw template body (before variable interpolation) for split view
  const [rawTemplateBody, setRawTemplateBody] = useState("");

  // Load custom templates from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const custom: WaTemplate[] = JSON.parse(stored);
        setTemplates([...DEFAULT_TEMPLATES, ...custom]);
      }
    } catch {}
  }, []);

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

  // Build rows
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
        pipelineName: pipeline?.nom,
        stageName: stage?.nom,
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
        pipelineName: pipeline?.nom,
        stageName: stage?.nom,
        hasLeadMagnet: !!lmInfo || (opp?.lead_magnet ?? false),
        leadMagnetReady: lmInfo?.ready ?? false,
        leadMagnetUrl: lmInfo?.url,
        opportunityId: opp?.id,
      };
    });
  }, [companies, opportunities, pipelines, pipelineStages, lmMap]);

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
  }, [rows, mode, filterHasTel, filterPipeline, filterLm, searchQuery, opportunities]);

  const buildVars = useCallback((row: WhatsAppRow) => ({
    "{{prénom}}": row.kind === "contact" ? (row.firstName || row.companyName) : row.companyName,
    "{{entreprise}}": row.companyName,
    "{{lien_site}}": row.leadMagnetUrl ?? "(lien site)",
    "{{lien_audit}}": row.leadMagnetUrl ?? "(lien audit)",
  }), []);

  const buildMessage = useCallback((row: WhatsAppRow, tmplId: string) => {
    const tmpl = templates.find((t) => t.id === tmplId) ?? templates[0];
    return interpolate(tmpl.body, buildVars(row));
  }, [templates, buildVars]);

  const selectRow = useCallback((row: WhatsAppRow) => {
    setSelectedRow(row);
    setPhone(row.tel);
    setMessageBody(buildMessage(row, activeTemplateId));
    const tmpl = templates.find((t) => t.id === activeTemplateId) ?? templates[0];
    setRawTemplateBody(tmpl?.body ?? "");
  }, [activeTemplateId, buildMessage, templates]);

  const applyTemplate = useCallback((id: string) => {
    setActiveTemplateId(id);
    const tmpl = templates.find((t) => t.id === id) ?? templates[0];
    setRawTemplateBody(tmpl?.body ?? "");
    if (selectedRow) setMessageBody(buildMessage(selectedRow, id));
  }, [selectedRow, buildMessage, templates]);

  // Insert variable at cursor
  const insertVar = (varKey: string) => {
    const ta = textareaRef.current;
    if (!ta) {
      setMessageBody((b) => b + varKey);
      return;
    }
    const start = ta.selectionStart ?? messageBody.length;
    const end = ta.selectionEnd ?? messageBody.length;
    const next = messageBody.slice(0, start) + varKey + messageBody.slice(end);
    setMessageBody(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + varKey.length, start + varKey.length);
    });
  };

  // Save custom template
  const saveNewTemplate = () => {
    if (!newTplLabel.trim() || !newTplBody.trim()) return;
    const tpl: WaTemplate = {
      id: `custom-${Date.now()}`,
      label: newTplLabel.trim(),
      body: newTplBody.trim(),
      isCustom: true,
    };
    const existingCustom = templates.filter((t) => t.isCustom);
    const updated = [...existingCustom, tpl];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setTemplates([...DEFAULT_TEMPLATES, ...updated]);
    setShowNewTemplate(false);
    setNewTplLabel("");
    setNewTplBody("");
    toast.success("Template enregistré !");
  };

  const deleteCustomTemplate = (id: string) => {
    const updated = templates.filter((t) => t.id !== id);
    const custom = updated.filter((t) => t.isCustom);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
    setTemplates(updated);
    if (activeTemplateId === id) setActiveTemplateId("lead_magnet");
  };

  const whatsappUrl = useMemo(() => {
    if (!phone || !messageBody) return null;
    return buildWhatsAppUrl(phone, messageBody);
  }, [phone, messageBody]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(messageBody);
    setCopied(true);
    toast.success("Message copié !");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── LEFT: contact list ── */}
      <div className="flex w-72 shrink-0 flex-col border-r bg-muted/20">
        {/* Mode toggle */}
        <div className="space-y-2 border-b p-3">
          <div className="flex overflow-hidden rounded-lg border bg-background p-0.5">
            {(["contacts", "entreprises"] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setSelectedRow(null); }}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-all",
                  mode === m ? "bg-[#25D366] text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {m === "contacts" ? <User className="h-3 w-3" /> : <Building2 className="h-3 w-3" />}
                {m === "contacts" ? "Contacts" : "Entreprises"}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Rechercher…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 bg-background pl-8 text-sm"
            />
          </div>

          <div className="flex gap-1.5">
            <Select value={filterPipeline} onValueChange={setFilterPipeline}>
              <SelectTrigger className="h-7 flex-1 bg-background text-xs">
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
              <SelectTrigger className="h-7 flex-1 bg-background text-xs">
                <SelectValue placeholder="Lead Magnet" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="lm_ready">LM prêt</SelectItem>
                <SelectItem value="with_lm">Avec LM</SelectItem>
                <SelectItem value="no_lm">Sans LM</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {filteredRows.length} {mode === "contacts" ? "contact" : "entreprise"}{filteredRows.length > 1 ? "s" : ""}
            </span>
            <button
              className={cn(
                "flex items-center gap-1 text-xs transition-colors",
                filterHasTel ? "text-[#25D366]" : "text-muted-foreground"
              )}
              onClick={() => setFilterHasTel(!filterHasTel)}
            >
              <Filter className="h-3 w-3" />
              {filterHasTel ? "Tél. requis" : "Tous"}
            </button>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="divide-y">
            {filteredRows.map((row) => {
              const name = row.kind === "contact"
                ? `${row.firstName} ${row.lastName}`.trim() || row.companyName
                : row.companyName;
              const initial = (name[0] ?? "?").toUpperCase();
              const isSelected = selectedRow?.id === row.id;
              return (
                <button
                  key={row.id}
                  onClick={() => selectRow(row)}
                  className={cn(
                    "flex w-full items-start gap-2.5 p-3 text-left transition-colors",
                    isSelected
                      ? "bg-[#25D366]/10 border-l-2 border-l-[#25D366]"
                      : "hover:bg-accent border-l-2 border-l-transparent"
                  )}
                >
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#25D366]/15 text-[10px] font-bold text-[#25D366]">
                    {initial}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate text-sm font-medium">{name}</span>
                      {row.leadMagnetReady && <Magnet className="h-3 w-3 shrink-0 text-emerald-500" />}
                    </div>
                    {row.kind === "contact" && (
                      <p className="truncate text-xs text-muted-foreground">{row.companyName}</p>
                    )}
                    {row.tel ? (
                      <p className="text-xs text-muted-foreground">{row.tel}</p>
                    ) : (
                      <p className="text-xs text-destructive/60">Pas de numéro</p>
                    )}
                    {(row.pipelineName || row.stageName) && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {row.pipelineName && (
                          <Badge variant="secondary" className="h-3.5 px-1 text-[9px]">{row.pipelineName}</Badge>
                        )}
                        {row.stageName && (
                          <Badge variant="outline" className="h-3.5 px-1 text-[9px]">{row.stageName}</Badge>
                        )}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
            {filteredRows.length === 0 && (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Aucun {mode === "contacts" ? "contact" : "entreprise"} trouvé
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* ── RIGHT: Compose zone ── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {selectedRow ? (
          <>
            {/* Contact header */}
            <div className="flex items-center justify-between border-b px-5 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#25D366]/15">
                  <MessageCircle className="h-5 w-5 text-[#25D366]" />
                </div>
                <div>
                  <p className="font-semibold">
                    {selectedRow.kind === "contact"
                      ? `${selectedRow.firstName} ${selectedRow.lastName}`.trim() || selectedRow.companyName
                      : selectedRow.companyName}
                  </p>
                  {selectedRow.kind === "contact" && (
                    <p className="text-xs text-muted-foreground">{selectedRow.companyName}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedRow.leadMagnetReady && (
                  <Badge className="gap-1 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20">
                    <Magnet className="h-3 w-3" /> LM prêt
                  </Badge>
                )}
                {selectedRow.hasLeadMagnet && !selectedRow.leadMagnetReady && (
                  <Badge variant="secondary" className="gap-1">
                    <Clock className="h-3 w-3" /> LM en cours
                  </Badge>
                )}
              </div>
            </div>

            {/* Main area: templates + compose */}
            <div className="flex flex-1 gap-0 overflow-hidden">
              {/* Center: message compose (takes most space) */}
              <div className="flex flex-1 flex-col overflow-hidden">
                {/* Template selector */}
                <div className="border-b bg-muted/20 px-5 py-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    {templates.map((t) => (
                      <div key={t.id} className="flex items-center">
                        <button
                          onClick={() => applyTemplate(t.id)}
                          className={cn(
                            "rounded px-2 py-1 text-xs font-medium transition-all",
                            activeTemplateId === t.id
                              ? "bg-[#25D366] text-white shadow-sm"
                              : "bg-background text-muted-foreground hover:text-foreground border hover:border-[#25D366]/50"
                          )}
                        >
                          {t.label}
                        </button>
                        {t.isCustom && (
                          <button
                            onClick={() => deleteCustomTemplate(t.id)}
                            className="ml-0.5 rounded p-0.5 text-muted-foreground/60 hover:text-destructive"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      onClick={() => setShowNewTemplate(true)}
                      className="flex items-center gap-0.5 rounded border border-dashed px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Plus className="h-3 w-3" />
                      Nouveau
                    </button>
                  </div>
                </div>

                {/* Variables toolbar */}
                <div className="flex items-center gap-1.5 border-b bg-muted/10 px-5 py-1.5">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Variables :</span>
                  {AVAILABLE_VARS.map((v) => (
                    <button
                      key={v.key}
                      onClick={() => insertVar(v.key)}
                      className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300"
                    >
                      {v.label}
                    </button>
                  ))}
                </div>

                {/* Phone field */}
                <div className="border-b px-5 py-2.5">
                  <div className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+33 6 12 34 56 78"
                      className="h-7 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
                    />
                    {phone && (
                      <span className="shrink-0 text-xs text-muted-foreground">{sanitizePhone(phone)}</span>
                    )}
                  </div>
                </div>

                {/* Message textarea — takes all remaining space */}
                <div className="flex flex-1 flex-col overflow-hidden">
                  <Textarea
                    ref={textareaRef}
                    value={messageBody}
                    onChange={(e) => setMessageBody(e.target.value)}
                    placeholder="Rédigez votre message WhatsApp…"
                    className="flex-1 resize-none rounded-none border-0 bg-transparent p-5 text-sm shadow-none focus-visible:ring-0"
                    style={{ height: "100%" }}
                  />
                  <div className="border-t px-5 py-1">
                    <p className="text-xs text-muted-foreground">
                      {messageBody.length} car. · *texte* pour mettre en gras dans WhatsApp
                    </p>
                  </div>
                </div>

                {/* Action bar */}
                <div className="flex items-center gap-2 border-t px-5 py-3">
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
                    onClick={() => whatsappUrl && window.open(whatsappUrl, "_blank")}
                    disabled={!whatsappUrl}
                    className="gap-2 bg-[#25D366] text-white hover:bg-[#20bc5a]"
                  >
                    <MessageCircle className="h-4 w-4" />
                    Ouvrir WhatsApp
                    <ExternalLink className="h-3.5 w-3.5 opacity-70" />
                  </Button>
                </div>
              </div>

              {/* Right aside: split view — template brut (haut) / message rendu (bas) */}
              <div className="flex w-72 shrink-0 flex-col border-l bg-muted/10">
                {/* Top: raw template with highlighted variables */}
                <div className="flex flex-col border-b" style={{ flex: "1 1 0", minHeight: 0 }}>
                  <div className="border-b bg-muted/20 px-4 py-2">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Template brut</p>
                  </div>
                  <ScrollArea className="flex-1 p-3">
                    <p className="whitespace-pre-wrap break-words text-xs leading-relaxed font-mono">
                      {highlightVars(rawTemplateBody || (templates.find((t) => t.id === activeTemplateId)?.body ?? ""))}
                    </p>
                  </ScrollArea>
                </div>
                {/* Bottom: rendered message as WhatsApp bubble */}
                <div className="flex flex-col" style={{ flex: "1 1 0", minHeight: 0 }}>
                  <div className="border-b bg-muted/20 px-4 py-2">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Message rendu</p>
                  </div>
                  <ScrollArea className="flex-1 p-3">
                    {messageBody ? (
                      <>
                        <div className="flex justify-end">
                          <div className="relative max-w-[200px] rounded-2xl rounded-tr-sm bg-[#dcf8c6] px-3 py-2 text-xs shadow-sm dark:bg-[#005c4b]">
                            <p className="whitespace-pre-wrap break-words text-gray-800 dark:text-gray-100">
                              {messageBody}
                            </p>
                            <p className="mt-1 text-right text-[10px] text-gray-500">Maintenant ✓✓</p>
                          </div>
                        </div>
                        {selectedRow.leadMagnetUrl && (
                          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2 dark:border-emerald-800 dark:bg-emerald-950/30">
                            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Lead Magnet</p>
                            <p className="mt-0.5 truncate text-xs text-emerald-600 dark:text-emerald-500">
                              {selectedRow.leadMagnetUrl}
                            </p>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground text-center pt-4">Sélectionnez un template</p>
                    )}
                  </ScrollArea>
                </div>
              </div>
            </div>
          </>
        ) : (
          /* Empty state */
          <div className="flex flex-1 flex-col items-center justify-center gap-6">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#25D366]/10">
              <MessageCircle className="h-10 w-10 text-[#25D366]" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-lg">Messagerie WhatsApp</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Sélectionnez un {mode === "contacts" ? "contact" : "une entreprise"} pour composer un message
              </p>
            </div>
            <div className="max-w-sm rounded-xl border border-[#25D366]/20 bg-[#25D366]/5 px-5 py-4 text-center text-sm text-muted-foreground">
              Le bouton <strong>Ouvrir WhatsApp</strong> ouvrira WhatsApp Bureau ou Mobile avec le message pré-rempli — il ne reste plus qu'à envoyer.
            </div>
          </div>
        )}
      </div>

      {/* New template modal */}
      {showNewTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl border bg-background p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold">Nouveau template WhatsApp</h3>
              <button onClick={() => setShowNewTemplate(false)}>
                <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Nom du template</Label>
                <Input
                  value={newTplLabel}
                  onChange={(e) => setNewTplLabel(e.target.value)}
                  placeholder="Ex: Suivi semaine 2"
                  className="mt-1"
                />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <Label className="text-xs">Message</Label>
                  <div className="flex gap-1">
                    {AVAILABLE_VARS.map((v) => (
                      <button
                        key={v.key}
                        onClick={() => setNewTplBody((b) => b + v.key)}
                        className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300"
                      >
                        {v.label}
                      </button>
                    ))}
                  </div>
                </div>
                <Textarea
                  value={newTplBody}
                  onChange={(e) => setNewTplBody(e.target.value)}
                  placeholder="Bonjour {{prénom}} …"
                  rows={6}
                  className="resize-none text-sm"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowNewTemplate(false)}>Annuler</Button>
              <Button
                size="sm"
                className="gap-1.5"
                onClick={saveNewTemplate}
                disabled={!newTplLabel.trim() || !newTplBody.trim()}
              >
                <Save className="h-3.5 w-3.5" />
                Enregistrer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
