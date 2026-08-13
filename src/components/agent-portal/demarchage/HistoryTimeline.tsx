"use client";

import { useEffect, useState } from "react";
import { Phone, Mail, MessageCircle, Linkedin, Quote, type LucideIcon } from "lucide-react";
import { authedFetch } from "@/utils/authedFetch";
import { fetchCalls, type CallRow } from "@/lib/telephony/client";

type Tone = "ok" | "danger" | "warn" | "info" | "muted";

type TimelineItem = {
  id: string;
  at: string;
  kind: "call" | "email" | "whatsapp" | "linkedin" | "note";
  title: string;
  detail: string;
  tone: Tone;
};

type EmailLogRow = {
  id: string;
  channel?: "email" | "whatsapp" | "linkedin" | "note";
  subject: string;
  body_text?: string;
  to_email?: string;
  to_name?: string;
  status: "sent" | "failed" | "pending";
  sent_at: string;
};

const DISPO_LABEL: Record<string, string> = {
  answered: "Répondu",
  no_answer: "Sans réponse",
  busy: "Occupé",
  failed: "Échec",
  cancelled: "Annulé",
  voicemail: "Messagerie",
};

const DISPO_TONE: Record<string, Tone> = {
  answered: "ok",
  no_answer: "danger",
  busy: "warn",
  failed: "danger",
  cancelled: "muted",
  voicemail: "info",
};

const KIND_ICON: Record<TimelineItem["kind"], LucideIcon> = {
  call: Phone,
  email: Mail,
  whatsapp: MessageCircle,
  linkedin: Linkedin,
  note: Quote,
};

const TONE_DOT: Record<Tone, string> = {
  ok: "var(--ok)",
  danger: "var(--danger)",
  warn: "var(--warn)",
  info: "var(--info)",
  muted: "var(--text-3)",
};

function formatDuration(s: number | null): string {
  if (!s || s <= 0) return "";
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function callToItem(c: CallRow): TimelineItem {
  const name = c.contact ? [c.contact.first_name, c.contact.last_name].filter(Boolean).join(" ") : c.entreprise?.name;
  const label = c.direction === "outbound" ? "Appel sortant" : c.direction === "inbound" ? "Appel entrant" : "Appel interne";
  const dispoLabel = c.disposition ? DISPO_LABEL[c.disposition] ?? c.disposition : null;
  const dur = formatDuration(c.duration_sec);
  return {
    id: `call-${c.id}`,
    at: c.started_at ?? c.created_at,
    kind: "call",
    title: name ? `${label} · ${name}` : label,
    detail: [dispoLabel, dur].filter(Boolean).join(" · ") || "—",
    tone: c.disposition ? DISPO_TONE[c.disposition] ?? "muted" : "muted",
  };
}

function logToItem(l: EmailLogRow): TimelineItem {
  const kind = ((l.channel as TimelineItem["kind"]) || "email") as TimelineItem["kind"];
  const label = kind === "whatsapp" ? "WhatsApp" : kind === "linkedin" ? "LinkedIn" : kind === "note" ? "Note" : "Email";
  return {
    id: `log-${l.id}`,
    at: l.sent_at,
    kind,
    title: kind === "note" ? l.body_text || l.subject : l.subject || label,
    detail: kind === "note" ? label : [label, l.to_name || l.to_email].filter(Boolean).join(" · "),
    tone: kind === "note" ? "muted" : l.status === "sent" ? "ok" : "danger",
  };
}

function formatAt(iso: string): string {
  try {
    return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/**
 * "Le fil de tout ça" : appels + messages + notes de cette entreprise,
 * fusionnés et triés par date — pas deux historiques séparés. Pas de carte :
 * une ligne verticale pointillée et une puce par évènement (repris du
 * motif `.da2-timeline` du tableau de bord, réimplémenté en Tailwind pur).
 */
export function HistoryTimeline({ entrepriseId }: { entrepriseId: number }) {
  const [items, setItems] = useState<TimelineItem[] | null>(null);

  useEffect(() => {
    let active = true;
    setItems(null);
    (async () => {
      try {
        const [calls, logsRes] = await Promise.all([
          fetchCalls({ entreprise_id: entrepriseId }),
          authedFetch(`/api/agent/history?entreprise_id=${entrepriseId}`)
            .then((r) => r.json())
            .catch(() => ({ logs: [] })),
        ]);
        if (!active) return;
        const logs = ((logsRes?.logs ?? []) as EmailLogRow[]).filter((l) => !!l.sent_at);
        const merged = [...calls.map(callToItem), ...logs.map(logToItem)].sort(
          (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
        );
        setItems(merged);
      } catch {
        if (active) setItems([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [entrepriseId]);

  return (
    <div id="messages-history" className="scroll-mt-4">
      <div className="mb-3 text-sm font-medium">Historique</div>
      {items === null && <p className="text-sm text-muted-foreground">Chargement de l&apos;historique…</p>}
      {items?.length === 0 && <p className="text-sm text-muted-foreground">Aucun échange enregistré pour l&apos;instant.</p>}
      {items && items.length > 0 && (
        <div className="space-y-3 border-l border-dashed border-border pl-4">
          {items.map((item) => {
            const Icon = KIND_ICON[item.kind];
            return (
              <div key={item.id} className="relative">
                <span
                  className="absolute -left-[21px] top-0.5 h-2.5 w-2.5 rounded-full border-2 bg-background"
                  style={{ borderColor: TONE_DOT[item.tone] }}
                />
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Icon className="h-3 w-3" />
                  {formatAt(item.at)}
                </div>
                <div className="truncate text-sm font-medium">{item.title}</div>
                <div className="truncate text-xs text-muted-foreground">{item.detail}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
