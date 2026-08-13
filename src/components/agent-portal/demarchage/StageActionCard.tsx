"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Phone, MessageCircle, Linkedin, Send, Eye, CalendarCheck, FileText } from "lucide-react";
import { authedFetch } from "@/utils/authedFetch";
import { ClickToCallButton } from "@/components/telephony/ClickToCallButton";
import { lienWhatsApp } from "@/lib/prospects/canal";
import { SCRIPT_STEPS } from "@/lib/telephony/call-script";
import { STEP_OUTCOMES, stepOutcome as findStepOutcomeDef, type StepOutcomeId } from "@/lib/sales-pipeline/stages";
import type { StageRole } from "@/lib/opportunites/stage-roles";
import { one } from "@/components/agent-portal/format";
import type { CompanyBundle, DemarchagePatchBody, DemarchageTask } from "./types";

const KIND_LABEL: Record<string, string> = { call: "Appel", whatsapp: "WhatsApp", linkedin: "LinkedIn" };
const KIND_ICON: Record<string, typeof Phone> = { call: Phone, whatsapp: MessageCircle, linkedin: Linkedin };

/** Effet métier de chaque issue sur l'étape de l'affaire — le reste (statut) est dérivé plus bas. */
const OUTCOME_ROLE: Partial<Record<StepOutcomeId, StageRole>> = {
  answered: "contacte",
  lukewarm: "interesse",
  not_interested: "perdu",
  blocked: "perdu",
};

const TONE_CLASS: Record<string, string> = {
  ok: "border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300",
  info: "border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-300",
  warn: "border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300",
  danger: "border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300",
  muted: "border-border text-muted-foreground hover:bg-muted",
};

function tomorrowDateValue(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function StageActionCard({
  task,
  company,
  busy,
  siblingCount,
  onPatch,
  onMessageLogged,
}: {
  task: DemarchageTask;
  company: CompanyBundle | null;
  busy: boolean;
  siblingCount: number;
  onPatch: (body: Omit<DemarchagePatchBody, "id">) => void;
  onMessageLogged: () => void;
}) {
  // Réinitialisés à chaque tâche : le parent monte cette carte avec
  // `key={task.id}`, donc ces `useState` repartent naturellement à neuf.
  const [message, setMessage] = useState(task.payload?.message ?? "");
  const [note, setNote] = useState("");
  const [snoozeDate, setSnoozeDate] = useState(tomorrowDateValue());
  const [sending, setSending] = useState(false);
  const [scriptStep, setScriptStep] = useState(0);

  const contact = one(task.contact);
  const entRef = one(task.entreprise);
  const contactName = contact ? `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim() : "";
  const org = entRef?.name || company?.entreprise.name || "votre entreprise";
  const ville = entRef?.ville || company?.entreprise.ville || "votre région";

  const candidatePhones = useMemo(() => {
    const raw = [task.payload?.phone, ...(company?.contacts.map((c) => c.tel) ?? []), company?.entreprise.telephone, entRef?.telephone].filter(
      (v): v is string => !!v && v.trim() !== "",
    );
    return [...new Set(raw)];
  }, [task.payload?.phone, company, entRef]);
  const [selectedPhone, setSelectedPhone] = useState(candidatePhones[0] ?? "");

  const linkedinUrl = task.payload?.linkedin ?? company?.contacts.find((c) => c.linkedin_url)?.linkedin_url ?? null;
  const callPhone = task.payload?.phone || candidatePhones[0] || null;

  const Icon = KIND_ICON[task.kind] ?? Phone;

  const sendWhatsApp = async () => {
    if (!selectedPhone) {
      toast.error("Aucun numéro exploitable pour WhatsApp.");
      return;
    }
    const url = lienWhatsApp(selectedPhone, message);
    if (!url) {
      toast.error("Ce numéro n'est pas exploitable sur WhatsApp.");
      return;
    }
    setSending(true);
    window.open(url, "_blank");
    try {
      const res = await authedFetch("/api/messages/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: "whatsapp",
          contact_id: task.contact_id,
          entreprise_id: task.entreprise_id,
          opportunite_id: task.opportunite_id,
          to_email: selectedPhone,
          to_name: contactName || entRef?.name,
          subject: "Message WhatsApp",
          body_text: message,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Message journalisé dans l'historique.");
      onMessageLogged();
    } catch {
      toast.error("Le message a été ouvert mais pas journalisé.");
    } finally {
      setSending(false);
    }
  };

  const sendLinkedin = async () => {
    if (!linkedinUrl) {
      toast.error("Aucun profil LinkedIn connu.");
      return;
    }
    setSending(true);
    try {
      await navigator.clipboard.writeText(message);
    } catch {
      /* copie best-effort */
    }
    window.open(linkedinUrl, "_blank");
    try {
      const res = await authedFetch("/api/messages/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: "linkedin",
          contact_id: task.contact_id,
          entreprise_id: task.entreprise_id,
          opportunite_id: task.opportunite_id,
          to_email: linkedinUrl,
          to_name: contactName || entRef?.name,
          subject: "Message LinkedIn",
          body_text: message,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Message copié dans le presse-papiers et journalisé.");
      onMessageLogged();
    } catch {
      toast.error("LinkedIn ouvert mais le message n'a pas pu être journalisé.");
    } finally {
      setSending(false);
    }
  };

  const handleOutcome = (id: StepOutcomeId) => {
    const def = findStepOutcomeDef(id);
    if (!def) return;
    if (def.needsNote && !note.trim()) {
      toast.error("Ajoute une note avant d'enregistrer cette issue.");
      return;
    }
    if (def.needsDate && !snoozeDate) {
      toast.error("Choisis une date de relance.");
      return;
    }
    const status = id === "later" || (id === "no_answer" && task.kind === "call") ? "snoozed" : "done";
    onPatch({
      status,
      opportunite_id: task.opportunite_id ?? undefined,
      outcome: OUTCOME_ROLE[id],
      step_outcome: id,
      note: note.trim() || undefined,
      snooze_until: status === "snoozed" && id === "later" ? new Date(`${snoozeDate}T09:00:00`).toISOString() : undefined,
    });
  };

  const handleRdv = () =>
    onPatch({ status: "done", opportunite_id: task.opportunite_id ?? undefined, outcome: "rdv", step_outcome: undefined, note: note.trim() || undefined });

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="flex h-7 w-7 items-center justify-center rounded-md text-primary" style={{ background: "var(--accent-tint)" }}>
              <Icon className="h-4 w-4" />
            </span>
            {KIND_LABEL[task.kind] ?? task.kind}
            {contactName && <span className="text-sm font-normal text-muted-foreground">· {contactName}</span>}
          </CardTitle>
          <Button size="sm" disabled={busy} onClick={handleRdv} className="gap-1">
            <CalendarCheck className="h-4 w-4" /> RDV calé
          </Button>
        </div>
        {siblingCount > 0 && (
          <p className="text-xs text-muted-foreground">
            +{siblingCount} autre{siblingCount > 1 ? "s" : ""} tâche{siblingCount > 1 ? "s" : ""} pour cette entreprise
          </p>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {task.kind === "call" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-3">
              <div className="text-sm">
                <div className="font-medium">{callPhone || "Aucun numéro connu"}</div>
                <div className="text-xs text-muted-foreground">{entRef?.name}</div>
              </div>
              <ClickToCallButton
                to={callPhone}
                contactId={task.contact_id}
                entrepriseId={task.entreprise_id}
                opportuniteId={task.opportunite_id}
                label="Appeler"
              />
            </div>

            <div className="rounded-md border px-3 py-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <FileText className="h-4 w-4 text-muted-foreground" /> Argumentaire
              </div>
              <div className="flex flex-wrap gap-1.5">
                {SCRIPT_STEPS.map((s, i) => (
                  <button
                    key={s.title}
                    type="button"
                    onClick={() => setScriptStep(i)}
                    className={
                      "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors " +
                      (i === scriptStep
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-muted" + (i < scriptStep ? " line-through" : ""))
                    }
                  >
                    <span
                      className={
                        "flex h-4 w-4 items-center justify-center rounded-full text-[10px] " +
                        (i === scriptStep ? "bg-primary text-primary-foreground" : "bg-muted")
                      }
                    >
                      {i + 1}
                    </span>
                    {s.title}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {SCRIPT_STEPS[scriptStep].body.replace("{org}", org).replace("{ville}", ville)}
              </p>
            </div>
          </div>
        )}

        {(task.kind === "whatsapp" || task.kind === "linkedin") && (
          <div className="space-y-2">
            <Textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Message à envoyer…" />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button asChild variant="ghost" size="sm" className="gap-1 text-muted-foreground">
                <a href="#messages-history">
                  <Eye className="h-3.5 w-3.5" /> Voir les messages
                </a>
              </Button>

              {task.kind === "whatsapp" ? (
                <div className="flex items-center gap-2">
                  {candidatePhones.length > 1 && (
                    <Select value={selectedPhone} onValueChange={setSelectedPhone}>
                      <SelectTrigger className="h-9 w-[160px]">
                        <SelectValue placeholder="Numéro" />
                      </SelectTrigger>
                      <SelectContent>
                        {candidatePhones.map((p) => (
                          <SelectItem key={p} value={p}>
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Button size="sm" disabled={sending || busy} onClick={sendWhatsApp} className="gap-1">
                    <Send className="h-4 w-4" /> Envoyer le message
                  </Button>
                </div>
              ) : (
                <Button size="sm" disabled={sending || busy || !linkedinUrl} onClick={sendLinkedin} className="gap-1">
                  <Send className="h-4 w-4" /> Envoyer le message
                </Button>
              )}
            </div>
          </div>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Note (si nécessaire)</label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ce qui s'est dit…" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Date de relance (si « pas le bon moment »)</label>
            <Input type="date" value={snoozeDate} onChange={(e) => setSnoozeDate(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {STEP_OUTCOMES.map((o) => (
            <Button
              key={o.id}
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              className={TONE_CLASS[o.tone]}
              title={o.note}
              onClick={() => handleOutcome(o.id)}
            >
              {o.label}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
