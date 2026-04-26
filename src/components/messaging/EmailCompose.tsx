"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Mail, Send, RefreshCw, Magnet, Clock, Eye, EyeOff, Sparkles, FileText,
  PenLine,
} from "lucide-react";
import { TEMPLATES, getTemplateName, type EmailTemplate } from "./emailTypes";
import type { SignatureData } from "./SignatureSettings";
import { generateSignatureHtml } from "./SignatureSettings";

interface Props {
  // Header context
  headerTitle?:    string;
  headerSubtitle?: string;
  hasLm?:          boolean;
  lmReady?:        boolean;

  // Recipient
  toEmail:    string;
  setToEmail: (v: string) => void;
  toName:     string;
  setToName:  (v: string) => void;

  // Content
  subject:    string;
  setSubject: (v: string) => void;
  body:       string;
  setBody:    (v: string) => void;

  // Template (DB templates override static ones when provided)
  templateId:      string;
  onApplyTemplate: (id: string) => void;
  dbTemplates?:    EmailTemplate[];

  // Insertable URLs
  leadMagnetUrl?: string;
  auditUrl?:      string;

  // Signature
  signature?: SignatureData | null;

  // Actions
  sending: boolean;
  onSend:  () => void;
}

export function EmailCompose({
  headerTitle, headerSubtitle, hasLm, lmReady,
  toEmail, setToEmail, toName, setToName,
  subject, setSubject, body, setBody,
  templateId, onApplyTemplate, dbTemplates,
  leadMagnetUrl, auditUrl,
  signature,
  sending, onSend,
}: Props) {
  const [showPreview, setShowPreview]       = useState(false);
  const [showSignature, setShowSignature]   = useState(true);

  const insertText = (snippet: string) =>
    setBody(body + (body.endsWith("\n") ? "" : "\n") + snippet + "\n");

  // Use DB templates if available, fall back to static list
  const templates = (dbTemplates && dbTemplates.length > 0) ? dbTemplates : TEMPLATES;

  const sigHtml   = signature ? generateSignatureHtml(signature) : "";
  const hasSig    = sigHtml.length > 0;

  // Prepare preview HTML with optional signature
  const previewHtml =
    body.replace(/\n/g, "<br>") +
    (hasSig && showSignature ? sigHtml : "");

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-primary" />
          <div>
            <p className="text-sm font-semibold">{headerTitle ?? "Nouveau message"}</p>
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
            <Badge className="gap-1 bg-blue-500/10 text-blue-600 hover:bg-blue-500/20">
              <FileText className="h-3 w-3" /> Audit prêt
            </Badge>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-4 p-4">
          {/* Template selector */}
          <div className="flex items-start gap-2">
            <Sparkles className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="flex flex-wrap gap-1.5">
              {templates.map((t) => (
                <Button
                  key={t.id}
                  variant={templateId === t.id ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => onApplyTemplate(t.id)}
                >
                  {getTemplateName(t)}
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
                placeholder="Nom (optionnel)"
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

          {/* Lead magnet URL hint */}
          {leadMagnetUrl && (
            <div className="flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
              <Magnet className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
              <span className="flex-1 truncate text-xs text-emerald-700 dark:text-emerald-400">
                {leadMagnetUrl}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => insertText(`👉 ${leadMagnetUrl}`)}
              >
                Insérer
              </Button>
            </div>
          )}

          {/* Audit URL hint */}
          {auditUrl && (
            <div className="flex items-center gap-2 rounded-md border border-blue-500/20 bg-blue-500/5 px-3 py-2">
              <FileText className="h-3.5 w-3.5 shrink-0 text-blue-500" />
              <span className="flex-1 truncate text-xs text-blue-700 dark:text-blue-400">
                Audit PDF disponible
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => insertText(`📄 Votre audit : ${auditUrl}`)}
              >
                Insérer
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => window.open(auditUrl, "_blank")}
              >
                Voir
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
                dangerouslySetInnerHTML={{ __html: previewHtml }}
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

          {/* Signature preview */}
          {hasSig && !showPreview && (
            <div className="rounded-md border border-dashed bg-muted/30 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-dashed">
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
                  className="px-3 py-3 text-sm pointer-events-none select-none"
                  dangerouslySetInnerHTML={{ __html: sigHtml }}
                />
              )}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Send bar */}
      <div className="flex items-center justify-between border-t px-4 py-3">
        <span className="text-xs text-muted-foreground">
          Via Resend · {toEmail || "—"}
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
    </div>
  );
}
