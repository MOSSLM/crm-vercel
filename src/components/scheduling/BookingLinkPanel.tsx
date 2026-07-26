"use client";

/**
 * Panneau « Proposer un RDV » — pensé pour la page d'appel d'un agent.
 * Deux modes, comme Cal/Calendly :
 *   « Réserver » : mini-calendrier avec les vrais créneaux dispo — l'agent
 *     cale le RDV pendant l'appel (confirmation email + .ics automatiques) ;
 *   « Lien » : copie du lien prérempli ou envoi par email au prospect.
 */

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, CalendarPlus, Copy, Link2, Loader2, Mail, Send } from "lucide-react";
import { authedFetch } from "@/utils/authedFetch";
import { fetchEventTypes, fetchSchedulingPage } from "@/lib/scheduling/client";
import type { EventType } from "@/lib/scheduling/types";
import MiniBookingCalendar from "./MiniBookingCalendar";
import { getAppUrlClient } from "./host/shared";

export interface BookingLinkPanelProps {
  prospectName?: string | null;
  prospectEmail?: string | null;
  prospectPhone?: string | null;
  entrepriseId?: number | null;
  opportuniteId?: string | null;
  contactId?: string | null;
  callId?: string | null;
}

export default function BookingLinkPanel({
  prospectName,
  prospectEmail,
  prospectPhone,
  entrepriseId,
  opportuniteId,
  contactId,
  callId,
}: BookingLinkPanelProps) {
  const [mode, setMode] = useState<"book" | "link">("book");
  const [username, setUsername] = useState<string | null>(null);
  const [hostName, setHostName] = useState<string>("");
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string>("");
  const [email, setEmail] = useState(prospectEmail ?? "");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [pageData, typesData] = await Promise.all([
          fetchSchedulingPage(),
          fetchEventTypes(),
        ]);
        if (cancelled) return;
        setUsername(pageData.page.username);
        setHostName(pageData.page.display_name);
        const active = typesData.event_types.filter((et) => et.is_active);
        setEventTypes(active);
        setSelectedSlug(active[0]?.slug ?? "");
      } catch {
        // panneau non bloquant
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setEmail(prospectEmail ?? "");
  }, [prospectEmail]);

  const link = useMemo(() => {
    if (!username || !selectedSlug) return null;
    const url = new URL(`${getAppUrlClient()}/rdv/${username}/${selectedSlug}`);
    if (prospectName) url.searchParams.set("name", prospectName);
    if (email.trim()) url.searchParams.set("email", email.trim());
    return url.toString();
  }, [username, selectedSlug, prospectName, email]);

  const copyLink = () => {
    if (!link) return;
    void navigator.clipboard.writeText(link);
    toast.success("Lien de réservation copié");
  };

  const sendByEmail = async () => {
    if (!link || !email.trim() || sending) return;
    setSending(true);
    try {
      const et = eventTypes.find((e) => e.slug === selectedSlug);
      const firstName = (prospectName ?? "").trim().split(/\s+/)[0] || null;
      const bodyHtml =
        `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111111;line-height:1.6;">` +
        `<p style="margin:0 0 16px 0;">Bonjour${firstName ? ` ${firstName}` : ""},</p>` +
        `<p style="margin:0 0 16px 0;">Comme convenu, voici le lien pour réserver directement un créneau` +
        (et ? ` pour « ${et.title} »` : "") +
        ` :</p>` +
        `<p style="margin:0 0 16px 0;"><a href="${link}" style="display:inline-block;padding:10px 18px;background:#E2552B;color:#ffffff;border-radius:8px;text-decoration:none;">Choisir mon créneau</a></p>` +
        `<p style="margin:0 0 16px 0;">Vous recevrez immédiatement une confirmation avec l'invitation agenda.</p>` +
        `<p style="margin:0;">À très vite,<br>${hostName}</p>` +
        `</div>`;

      const res = await authedFetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to_email: email.trim(),
          to_name: prospectName ?? undefined,
          subject: `Réservez votre créneau${et ? ` — ${et.title}` : ""}`,
          body_html: bodyHtml,
          body_text:
            `Bonjour${firstName ? ` ${firstName}` : ""},\n\n` +
            `Voici le lien pour réserver un créneau : ${link}\n\nÀ très vite,\n${hostName}`,
          type: "scheduling_link",
          entreprise_id: entrepriseId ?? undefined,
          opportunite_id: opportuniteId ?? undefined,
          contact_id: contactId ?? undefined,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success(`Lien de RDV envoyé à ${email.trim()}`);
    } catch {
      toast.error("Envoi impossible (Resend configuré ?)");
    } finally {
      setSending(false);
    }
  };

  const linkContent = loading ? (
    <div className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Chargement du module RDV…
    </div>
  ) : !username || eventTypes.length === 0 ? (
    <div className="rounded-lg border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
      <CalendarClock className="mb-1 h-3.5 w-3.5" />
      Configurez vos types d&apos;évènements dans Cal.SAMA pour proposer un lien de réservation
      pendant l&apos;appel.
    </div>
  ) : (
    <div className="space-y-2">
      <select
        value={selectedSlug}
        onChange={(e) => setSelectedSlug(e.target.value)}
        className="h-8 w-full rounded-md border border-input bg-input-background px-2 text-sm"
        aria-label="Type de rendez-vous"
      >
        {eventTypes.map((et) => (
          <option key={et.id} value={et.slug}>
            {et.title} ({et.duration_minutes} min)
          </option>
        ))}
      </select>

      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <Mail className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email du prospect"
            className="h-8 w-full rounded-md border border-input bg-input-background py-1.5 pl-7 pr-2 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={() => void sendByEmail()}
          disabled={sending || !/.+@.+\..+/.test(email)}
          title="Envoyer le lien par email"
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md bg-primary px-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {sending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          Envoyer
        </button>
      </div>

      <button
        type="button"
        onClick={copyLink}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-sm font-medium transition-colors hover:bg-[var(--hover)]"
      >
        <Copy className="h-3.5 w-3.5" /> Copier le lien prérempli
      </button>
    </div>
  );

  return (
    <div className="space-y-2.5">
      {/* Onglets Réserver / Lien */}
      <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
        <button
          type="button"
          onClick={() => setMode("book")}
          className={`inline-flex items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium transition-colors ${
            mode === "book"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <CalendarPlus className="h-3.5 w-3.5" /> Réserver
        </button>
        <button
          type="button"
          onClick={() => setMode("link")}
          className={`inline-flex items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium transition-colors ${
            mode === "link"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Link2 className="h-3.5 w-3.5" /> Lien
        </button>
      </div>

      {mode === "book" ? (
        <MiniBookingCalendar
          prospectName={prospectName}
          prospectEmail={prospectEmail}
          prospectPhone={prospectPhone}
          callId={callId}
          opportuniteId={opportuniteId}
        />
      ) : (
        linkContent
      )}
    </div>
  );
}
