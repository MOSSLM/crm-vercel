"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Mail, User, Building2, PenLine, FileText, Send, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listLeadMagnetCards } from "@/utils/leadMagnetV2Api";
import { fetchAuditByOpportunite } from "@/utils/auditApi";
import { authedFetch } from "@/utils/authedFetch";
import { renderEmailHtml } from "@/utils/emailTemplate";
import { TEMPLATES, interpolate, type ContactRow, type CompanyRow, type EmailTemplate } from "./emailTypes";
import type { SignatureData } from "./SignatureSettings";
import { ContactList } from "./ContactList";
import { CompanyList } from "./CompanyList";
import { EmailCompose } from "./EmailCompose";
import { EmailHistory } from "./EmailHistory";
import { cn } from "@/lib/utils";

type Mode = "contacts" | "entreprises" | "manuel";

const MODE_TABS: { id: Mode; label: string; icon: React.ElementType }[] = [
  { id: "contacts", label: "Contacts", icon: User },
  { id: "entreprises", label: "Entreprises", icon: Building2 },
  { id: "manuel", label: "Manuel", icon: PenLine },
];

function makeVars(companyName: string, contactName: string, lmUrl?: string) {
  return {
    company_name: companyName,
    contact_name: contactName,
    lead_magnet_url: lmUrl ?? "(lien lead magnet)",
  };
}

export function EmailTab() {
  const [mode, setMode] = useState<Mode>("contacts");

  // Signature + DB templates
  const [signature, setSignature] = useState<SignatureData | null>(null);
  const [dbTemplates, setDbTemplates] = useState<EmailTemplate[]>([]);

  // LM map: opportunite_id → { ready, url }
  const [lmMap, setLmMap] = useState<Map<string, { ready: boolean; url?: string }>>(new Map());

  // Selection
  const [selectedContact, setSelectedContact] = useState<ContactRow | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<CompanyRow | null>(null);

  // Compose state
  const [templateId, setTemplateId] = useState("lead_magnet");
  const [toEmail, setToEmail] = useState("");
  const [toName, setToName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [auditPdfUrl, setAuditPdfUrl] = useState<string | undefined>();
  const [attachAudit, setAttachAudit] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  const [currentVars, setCurrentVars] = useState({ companyName: "", contactName: "", lmUrl: "" });
  const [rawTemplateBody, setRawTemplateBody] = useState("");

  useEffect(() => {
    authedFetch("/api/email/signature")
      .then((r) => r.json())
      .then((data) => { if (data) setSignature(data); })
      .catch(() => {});

    authedFetch("/api/email/templates")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setDbTemplates(data); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    listLeadMagnetCards().then((items) => {
      const map = new Map<string, { ready: boolean; url?: string }>();
      for (const item of items) {
        if (item.opportunity?.id) {
          const isReady = item.project.statut === "ready" || item.project.pret_pour_lm === true;
          const url =
            (item.project.cta_primary_target as string | undefined) ??
            `${window.location.origin}/api/public/lead-magnets/${item.project.id}`;
          map.set(item.opportunity.id, { ready: isReady, url });
        }
      }
      setLmMap(map);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (dbTemplates.length > 0) {
      const lm = dbTemplates.find((t) => t.type === "lead_magnet" && t.is_default);
      if (lm) setTemplateId(lm.id);
    }
  }, [dbTemplates]);

  const applyTemplate = useCallback((id: string, vars: { companyName: string; contactName: string; lmUrl?: string }) => {
    setTemplateId(id);
    const tmpl = dbTemplates.find((t) => t.id === id) ?? TEMPLATES.find((t) => t.id === id);
    if (!tmpl) return;
    const v = makeVars(vars.companyName, vars.contactName, vars.lmUrl);
    setSubject(interpolate(tmpl.subject, v));
    setBody(interpolate(tmpl.body, v));
    setRawTemplateBody(tmpl.body);
  }, [dbTemplates]);

  const fetchAudit = useCallback(async (opportunityId?: string) => {
    setAuditPdfUrl(undefined);
    setAttachAudit(false);
    if (!opportunityId) return;
    try {
      const audit = await fetchAuditByOpportunite(opportunityId);
      if (audit?.pdf_url && audit.statut === "ready") setAuditPdfUrl(audit.pdf_url);
    } catch {}
  }, []);

  const handleSelectContact = useCallback((row: ContactRow) => {
    setSelectedContact(row);
    setSelectedCompany(null);
    const contactName = row.contact.first_name?.trim() || row.companyName;
    const vars = { companyName: row.companyName, contactName, lmUrl: row.leadMagnetUrl ?? "" };
    setCurrentVars(vars);
    setToEmail(row.contact.email ?? "");
    setToName(`${row.contact.first_name ?? ""} ${row.contact.last_name ?? ""}`.trim());
    applyTemplate(templateId, vars);
    fetchAudit(row.opportunity?.id);
  }, [templateId, applyTemplate, fetchAudit]);

  const handleSelectCompany = useCallback((row: CompanyRow) => {
    setSelectedCompany(row);
    setSelectedContact(null);
    const vars = { companyName: row.company.name ?? "", contactName: row.company.name ?? "", lmUrl: row.leadMagnetUrl ?? "" };
    setCurrentVars(vars);
    setToEmail(row.company.email ?? "");
    setToName(row.company.name ?? "");
    applyTemplate(templateId, vars);
    fetchAudit(row.opportunity?.id);
  }, [templateId, applyTemplate, fetchAudit]);

  const handleApplyTemplate = useCallback((id: string) => {
    applyTemplate(id, currentVars);
  }, [applyTemplate, currentVars]);

  const handleSwitchMode = (m: Mode) => {
    setMode(m);
    setSelectedContact(null);
    setSelectedCompany(null);
    setAuditPdfUrl(undefined);
    setAttachAudit(false);
    setRawTemplateBody("");
    if (m === "manuel") {
      setToEmail("");
      setToName("");
      setSubject("");
      setBody("");
    }
  };

  // "Envoyer l'audit" — applique un template audit et coche l'attachement
  const handleSendAuditQuickAction = useCallback(() => {
    const auditTemplate = dbTemplates.find((t) => t.type === "suivi") ?? TEMPLATES.find((t) => t.id === "suivi");
    const vars = {
      company_name: currentVars.companyName,
      contact_name: currentVars.contactName,
      lead_magnet_url: auditPdfUrl ?? currentVars.lmUrl ?? "(lien audit)",
    };
    if (auditTemplate) {
      setSubject(interpolate(auditTemplate.subject, vars));
      setBody(
        interpolate(auditTemplate.body, vars) +
        (auditPdfUrl ? `\n\n📄 Votre audit : ${auditPdfUrl}` : "")
      );
      setTemplateId(auditTemplate.id);
    }
    setAttachAudit(true);
    toast.success("Template audit appliqué — vérifiez le message puis envoyez !");
  }, [dbTemplates, currentVars, auditPdfUrl]);

  const handleSend = async () => {
    if (!toEmail || !subject || !body) {
      toast.error("Destinataire, objet et corps sont requis");
      return;
    }
    setSending(true);
    try {
      const bodyHtml = await renderEmailHtml(body, signature);
      const res = await authedFetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to_email: toEmail,
          to_name: toName || undefined,
          subject,
          body_html: bodyHtml,
          body_text: body,
          contact_id: selectedContact?.contact.id,
          entreprise_id: selectedContact?.contact.entreprise_id ?? selectedCompany?.company.id,
          opportunite_id: selectedContact?.opportunity?.id ?? selectedCompany?.opportunity?.id,
          audit_pdf_url: attachAudit && auditPdfUrl ? auditPdfUrl : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Échec");
      toast.success("Email envoyé avec succès !");
      setHistoryRefreshKey((k) => k + 1);
      setAttachAudit(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de l'envoi");
    } finally {
      setSending(false);
    }
  };

  const composeActive = mode === "manuel" || !!selectedContact || !!selectedCompany;
  const historyContactId = selectedContact?.contact.id;
  const historyEntrepriseId = selectedContact?.contact.entreprise_id ?? selectedCompany?.company.id;
  const currentLmUrl = selectedContact?.leadMagnetUrl ?? selectedCompany?.leadMagnetUrl;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Mode tabs */}
      <div className="flex shrink-0 border-b bg-muted/20">
        {MODE_TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => handleSwitchMode(id)}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              mode === id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}

        {/* Audit quick action — visible when audit is available */}
        {auditPdfUrl && (
          <div className="ml-auto flex items-center px-3">
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-950/30 dark:text-blue-400"
              onClick={handleSendAuditQuickAction}
            >
              <Paperclip className="h-3.5 w-3.5" />
              Envoyer l'audit PDF
            </Button>
          </div>
        )}
      </div>

      {/* 3-panel layout */}
      <div className="flex flex-1 gap-0 overflow-hidden">
        {/* Left panel: contact/company list */}
        <div className="flex w-72 shrink-0 flex-col border-r bg-muted/20">
          {mode === "contacts" && (
            <ContactList lmMap={lmMap} selected={selectedContact} onSelect={handleSelectContact} />
          )}
          {mode === "entreprises" && (
            <CompanyList lmMap={lmMap} selected={selectedCompany} onSelect={handleSelectCompany} />
          )}
          {mode === "manuel" && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
              <PenLine className="h-8 w-8 opacity-20" />
              <p className="text-sm">Saisissez le destinataire manuellement dans le panneau de rédaction.</p>
            </div>
          )}
        </div>

        {/* Center: Compose */}
        {composeActive ? (
          <EmailCompose
            headerTitle={
              selectedContact
                ? `${selectedContact.contact.first_name ?? ""} ${selectedContact.contact.last_name ?? ""}`.trim()
                : selectedCompany?.company.name ?? "Nouveau message"
            }
            headerSubtitle={
              selectedContact ? selectedContact.companyName : selectedCompany?.company.ville
            }
            hasLm={selectedContact?.hasLeadMagnet ?? selectedCompany?.hasLeadMagnet}
            lmReady={selectedContact?.leadMagnetReady ?? selectedCompany?.leadMagnetReady}
            toEmail={toEmail}
            setToEmail={setToEmail}
            toName={toName}
            setToName={setToName}
            subject={subject}
            setSubject={setSubject}
            body={body}
            setBody={setBody}
            templateId={templateId}
            onApplyTemplate={handleApplyTemplate}
            dbTemplates={dbTemplates}
            leadMagnetUrl={currentLmUrl}
            auditUrl={auditPdfUrl}
            attachAudit={attachAudit}
            onToggleAttachAudit={() => setAttachAudit((v) => !v)}
            signature={signature}
            sending={sending}
            onSend={handleSend}
            rawTemplateBody={rawTemplateBody}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
            <Mail className="h-12 w-12 opacity-15" />
            <div className="text-center">
              <p className="font-medium">
                {mode === "contacts" ? "Sélectionnez un contact" : "Sélectionnez une entreprise"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Le message sera pré-rempli avec le template actif
              </p>
            </div>
          </div>
        )}

        {/* Right: History */}
        <EmailHistory
          contactId={historyContactId}
          entrepriseId={historyEntrepriseId}
          refreshKey={historyRefreshKey}
        />
      </div>
    </div>
  );
}
