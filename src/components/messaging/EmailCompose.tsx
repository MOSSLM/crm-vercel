"use client";

import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Mail, Send, RefreshCw, Magnet, Clock, Eye, EyeOff, Sparkles, FileText,
  PenLine, Paperclip, X, ExternalLink, Plus, Save,
} from "lucide-react";
import { TEMPLATES, getTemplateName, interpolate, type EmailTemplate } from "./emailTypes";
import type { SignatureData } from "./SignatureSettings";
import { generateSignatureHtml } from "./SignatureSettings";
import { cn } from "@/lib/utils";
import { authedFetch } from "@/utils/authedFetch";
import { toast } from "sonner";

// ─── Variables disponibles pour email ─────────────────────────────────────────

const EMAIL_VARS = [
  { key: "{{contact_name}}", label: "Prénom contact" },
  { key: "{{company_name}}", label: "Entreprise" },
  { key: "{{lead_magnet_url}}", label: "Lien site" },
];

const CUSTOM_TEMPLATES_KEY = "crm-email-custom-templates";

interface CustomEmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
}

interface Props {
  headerTitle?: string;
  headerSubtitle?: string;
  hasLm?: boolean;
  lmReady?: boolean;

  toEmail: string;
  setToEmail: (v: string) => void;
  toName: string;
  setToName: (v: string) => void;

  subject: string;
  setSubject: (v: string) => void;
  body: string;
  setBody: (v: string) => void;

  templateId: string;
  onApplyTemplate: (id: string) => void;
  dbTemplates?: EmailTemplate[];

  leadMagnetUrl?: string;
  auditUrl?: string;
  attachAudit?: boolean;
  onToggleAttachAudit?: () => void;

  signature?: SignatureData | null;

  sending: boolean;
  onSend: () => void;
}

export function EmailCompose({
  headerTitle, headerSubtitle, hasLm, lmReady,
  toEmail, setToEmail, toName, setToName,
  subject, setSubject, body, setBody,
  templateId, onApplyTemplate, dbTemplates,
  leadMagnetUrl, auditUrl, attachAudit, onToggleAttachAudit,
  signature,
  sending, onSend,
}: Props) {
  const [showPreview, setShowPreview] = useState(false);
  const [showSignature, setShowSignature] = useState(true);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [newTplName, setNewTplName] = useState("");
  const [customTemplates, setCustomTemplates] = useState<CustomEmailTemplate[]>(() => {
    try {
      const stored = localStorage.getItem(CUSTOM_TEMPLATES_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);

  const insertTextAtCursor = (snippet: string) => {
    const ta = bodyRef.current;
    if (!ta) {
      setBody(body + snippet);
      return;
    }
    const start = ta.selectionStart ?? body.length;
    const end = ta.selectionEnd ?? body.length;
    const next = body.slice(0, start) + snippet + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + snippet.length, start + snippet.length);
    });
  };

  const insertVar = (varKey: string) => insertTextAtCursor(varKey);

  const templates = (dbTemplates && dbTemplates.length > 0) ? dbTemplates : TEMPLATES;
  const allTemplates = [...templates, ...customTemplates.map(t => ({ ...t, type: "autre" as const, user_id: null, is_default: false, created_at: "" }))];

  const sigHtml = signature ? generateSignatureHtml(signature) : "";
  const hasSig = sigHtml.length > 0;
  const previewHtml = body.replace(/\n/g, "<br>") + (hasSig && showSignature ? sigHtml : "");

  const saveCustomTemplate = () => {
    if (!newTplName.trim()) return;
    const tpl: CustomEmailTemplate = {
      id: `custom-email-${Date.now()}`,
      name: newTplName.trim(),
      subject,
      body,
    };
    const updated = [...customTemplates, tpl];
    setCustomTemplates(updated);
    localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(updated));
    setShowSaveTemplate(false);
    setNewTplName("");
    toast.success("Template email enregistré !");
  };

  const deleteCustomTemplate = (id: string) => {
    const updated = customTemplates.filter((t) => t.id !== id);
    setCustomTemplates(updated);
    localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(updated));
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-5 py-3">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-blue-500" />
          <div>
            <p className="font-semibold">{headerTitle ?? "Nouveau message"}</p>
            {headerSubtitle && <p className="text-xs text-muted-foreground">{headerSubtitle}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lmReady && (
            <Badge className="gap-1 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20">
              <Magnet className="h-3 w-3" /> LM prêt
            </Badge>
          )}
          {hasLm && !lmReady && (
            <Badge variant="secondary" className="gap-1">
              <Clock className="h-3 w-3" /> LM en cours
            </Badge>
          )}
          {auditUrl && (
            <Badge className="gap-1 bg-blue-500/10 text-blue-600">
              <FileText className="h-3 w-3" /> Audit disponible
            </Badge>
          )}
        </div>
      </div>

      {/* Template selector */}
      <div className="border-b bg-muted/20 px-5 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          {allTemplates.map((t) => {
            const name = getTemplateName(t);
            const isCustomLocal = customTemplates.some(c => c.id === t.id);
            return (
              <div key={t.id} className="flex items-center gap-0.5">
                <button
                  onClick={() => onApplyTemplate(t.id)}
                  className={cn(
                    "rounded px-2 py-1 text-xs font-medium transition-all",
                    templateId === t.id
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "border bg-background text-muted-foreground hover:text-foreground hover:border-primary/50"
                  )}
                >
                  {name}
                </button>
                {isCustomLocal && (
                  <button
                    onClick={() => deleteCustomTemplate(t.id)}
                    className="rounded p-0.5 text-muted-foreground/60 hover:text-destructive"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                )}
              </div>
            );
          })}
          <button
            onClick={() => setShowSaveTemplate(true)}
            className="flex items-center gap-0.5 rounded border border-dashed px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
            title="Sauvegarder comme nouveau template"
          >
            <Plus className="h-3 w-3" />
            Sauver
          </button>
        </div>
      </div>

      {/* Variables toolbar */}
      <div className="flex items-center gap-1.5 border-b bg-muted/10 px-5 py-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Variables :</span>
        {EMAIL_VARS.map((v) => (
          <button
            key={v.key}
            onClick={() => insertVar(v.key)}
            className="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-300"
          >
            {v.label}
          </button>
        ))}
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-4 p-5">
          {/* To */}
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">À</Label>
            <div className="flex gap-2">
              <Input
                value={toName}
                onChange={(e) => setToName(e.target.value)}
                placeholder="Nom (optionnel)"
                className="h-9 text-sm"
              />
              <Input
                value={toEmail}
                onChange={(e) => setToEmail(e.target.value)}
                placeholder="email@exemple.com"
                type="email"
                className="h-9 flex-1 text-sm"
              />
            </div>
          </div>

          {/* Subject */}
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Objet</Label>
            <Input
              ref={subjectRef}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Objet de l'email"
              className="h-9 text-sm"
            />
          </div>

          {/* Lead magnet URL */}
          {leadMagnetUrl && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-800 dark:bg-emerald-950/30">
              <Magnet className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
              <span className="flex-1 truncate text-xs text-emerald-700 dark:text-emerald-400">
                {leadMagnetUrl}
              </span>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-emerald-700" onClick={() => insertTextAtCursor(`👉 ${leadMagnetUrl}`)}>
                Insérer
              </Button>
            </div>
          )}

          {/* Audit PDF */}
          {auditUrl && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950/30">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-blue-500" />
                <div className="flex-1">
                  <p className="text-xs font-medium text-blue-700 dark:text-blue-400">Audit PDF prêt</p>
                  <p className="mt-0.5 truncate text-xs text-blue-600/70 dark:text-blue-500">
                    {auditUrl}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-blue-700"
                    onClick={() => insertTextAtCursor(`📄 Votre audit : ${auditUrl}`)}
                  >
                    Insérer lien
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-blue-700"
                    onClick={() => window.open(auditUrl, "_blank")}
                  >
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              {/* Attach toggle */}
              <button
                onClick={onToggleAttachAudit}
                className={cn(
                  "mt-2 flex w-full items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-all",
                  attachAudit
                    ? "bg-blue-600 text-white"
                    : "border border-blue-300 text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/30"
                )}
              >
                <Paperclip className="h-3.5 w-3.5" />
                {attachAudit ? "PDF joint à l'email ✓" : "Joindre le PDF à l'email"}
              </button>
            </div>
          )}

          {/* Body */}
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Message</Label>
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
                className="min-h-56 rounded-lg border bg-card p-4 text-sm leading-relaxed"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            ) : (
              <Textarea
                ref={bodyRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Rédigez votre message…"
                rows={14}
                className="resize-none text-sm"
              />
            )}
          </div>

          {/* Signature preview */}
          {hasSig && !showPreview && (
            <div className="overflow-hidden rounded-lg border border-dashed bg-muted/30">
              <div className="flex items-center justify-between border-b border-dashed px-3 py-1.5">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <PenLine className="h-3 w-3" />
                  Signature
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-2 text-[10px]"
                  onClick={() => setShowSignature((p) => !p)}
                >
                  {showSignature ? "Masquer" : "Afficher"}
                </Button>
              </div>
              {showSignature && (
                <div
                  className="pointer-events-none select-none px-3 py-3 text-sm"
                  dangerouslySetInnerHTML={{ __html: sigHtml }}
                />
              )}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Send bar */}
      <div className="flex items-center justify-between border-t px-5 py-3">
        <span className="text-xs text-muted-foreground">
          Via Resend · {toEmail || "—"}
          {attachAudit && <span className="ml-2 text-blue-500">· PDF joint</span>}
        </span>
        <Button
          onClick={onSend}
          disabled={sending || !toEmail || !subject || !body}
          className="gap-2"
        >
          {sending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Envoyer
        </Button>
      </div>

      {/* Save template modal */}
      {showSaveTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border bg-background p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold">Sauvegarder comme template</h3>
              <button onClick={() => setShowSaveTemplate(false)}>
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Le sujet et le corps actuels seront sauvegardés avec les variables.</p>
              <div>
                <Label className="text-xs">Nom du template</Label>
                <Input
                  value={newTplName}
                  onChange={(e) => setNewTplName(e.target.value)}
                  placeholder="Ex: Relance semaine 2"
                  className="mt-1"
                  autoFocus
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowSaveTemplate(false)}>Annuler</Button>
              <Button
                size="sm"
                className="gap-1.5"
                onClick={saveCustomTemplate}
                disabled={!newTplName.trim()}
              >
                <Save className="h-3.5 w-3.5" />
                Sauvegarder
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
