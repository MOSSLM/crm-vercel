"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Mail, User, Building2, PenLine } from "lucide-react";
import { toast } from "sonner";
import { listLeadMagnetCards } from "@/utils/leadMagnetV2Api";
import { fetchAuditByOpportunite } from "@/utils/auditApi";
import { authedFetch } from "@/utils/authedFetch";
import { wrapEmailBodyHtml } from "@/utils/emailTemplate";
import { TEMPLATES, interpolate, type ContactRow, type CompanyRow, type EmailTemplate } from "./emailTypes";
import type { SignatureData } from "./SignatureSettings";
import { ContactList } from "./ContactList";
import { CompanyList } from "./CompanyList";
import { EmailCompose } from "./EmailCompose";
import { EmailHistory } from "./EmailHistory";

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
  const [signature, setSignature]   = useState<SignatureData | null>(null);
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
  const [auditUrl, setAuditUrl] = useState<string | undefined>();
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  // Contextual vars for template re-application
  const [currentVars, setCurrentVars] = useState({ companyName: "", contactName: "", lmUrl: "" });

  // Load signature settings and DB templates on mount
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

  // When DB templates load, switch the default templateId to the DB lead_magnet entry
  useEffect(() => {
    if (dbTemplates.length > 0) {
      const lm = dbTemplates.find((t) => t.type === "lead_magnet" && t.is_default);
      if (lm) setTemplateId(lm.id);
    }
  }, [dbTemplates]);

  const applyTemplate = useCallback((id: string, vars: { companyName: string; contactName: string; lmUrl?: string }) => {
    setTemplateId(id);
    // Search DB templates first, then fall back to static list (covers initial state)
    const tmpl = dbTemplates.find((t) => t.id === id) ?? TEMPLATES.find((t) => t.id === id);
    if (!tmpl) return;
    const v = makeVars(vars.companyName, vars.contactName, vars.lmUrl);
    setSubject(interpolate(tmpl.subject, v));
    setBody(interpolate(tmpl.body, v));
  }, [dbTemplates]);

  const fetchAudit = useCallback(async (opportunityId?: string) => {
    setAuditUrl(undefined);
    if (!opportunityId) return;
    try {
      const audit = await fetchAuditByOpportunite(opportunityId);
      if (audit?.pdf_url && audit.statut === "ready") setAuditUrl(audit.pdf_url);
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
    setAuditUrl(undefined);
    if (m === "manuel") {
      setToEmail("");
      setToName("");
      setSubject("");
      setBody("");
    }
  };

  const handleSend = async () => {
    if (!toEmail || !subject || !body) {
      toast.error("Destinataire, objet et corps sont requis");
      return;
    }
    setSending(true);
    try {
      const bodyHtml = wrapEmailBodyHtml(body, signature);

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
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Échec");
      toast.success("Email envoyé avec succès !");
      setHistoryRefreshKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de l'envoi");
    } finally {
      setSending(false);
    }
  };

  const composeActive =
    mode === "manuel" || !!selectedContact || !!selectedCompany;

  const historyContactId = selectedContact?.contact.id;
  const historyEntrepriseId = selectedContact?.contact.entreprise_id ?? selectedCompany?.company.id;

  const currentLmUrl = selectedContact?.leadMagnetUrl ?? selectedCompany?.leadMagnetUrl;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Mode tabs */}
      <div className="flex shrink-0 border-b">
        {MODE_TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => handleSwitchMode(id)}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              mode === id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* 3-panel layout */}
      <div className="flex flex-1 gap-0 overflow-hidden">
        {/* Left panel */}
        <div className="flex w-80 shrink-0 flex-col border-r">
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
            auditUrl={auditUrl}
            signature={signature}
            sending={sending}
            onSend={handleSend}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
            <Mail className="h-10 w-10 opacity-20" />
            <p className="text-sm">
              {mode === "contacts"
                ? "Sélectionnez un contact pour composer un email"
                : "Sélectionnez une entreprise pour composer un email"}
            </p>
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
