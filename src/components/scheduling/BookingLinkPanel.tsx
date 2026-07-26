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
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        border: "1px dashed var(--border-2)",
        borderRadius: 8,
        padding: "10px 12px",
        fontSize: 11.5,
        color: "var(--text-3)",
      }}
    >
      <Loader2 size={13} className="spin" /> Chargement du module RDV…
    </div>
  ) : !username || eventTypes.length === 0 ? (
    <div
      style={{
        border: "1px dashed var(--border-2)",
        borderRadius: 8,
        padding: "10px 12px",
        fontSize: 11.5,
        color: "var(--text-3)",
      }}
    >
      <CalendarClock size={14} style={{ marginBottom: 4 }} />
      <br />
      Configurez vos types d&apos;évènements dans Cal.SAMA pour proposer un lien de réservation
      pendant l&apos;appel.
    </div>
  ) : (
    <div className="space-y-2">
      <select
        value={selectedSlug}
        onChange={(e) => setSelectedSlug(e.target.value)}
        className="inp"
        aria-label="Type de rendez-vous"
      >
        {eventTypes.map((et) => (
          <option key={et.id} value={et.slug}>
            {et.title} ({et.duration_minutes} min)
          </option>
        ))}
      </select>

      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ position: "relative", flex: 1 }}>
          <Mail
            size={13}
            style={{
              position: "absolute",
              left: 8,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--text-3)",
              pointerEvents: "none",
            }}
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email du prospect"
            className="inp"
            style={{ paddingLeft: 26 }}
          />
        </div>
        <button
          type="button"
          onClick={() => void sendByEmail()}
          disabled={sending || !/.+@.+\..+/.test(email)}
          className="btn accent sm"
          title="Envoyer le lien par email"
        >
          {sending ? <Loader2 size={13} className="spin" /> : <Send size={13} />}
          Envoyer
        </button>
      </div>

      <button type="button" onClick={copyLink} className="btn outline sm" style={{ width: "100%" }}>
        <Copy size={13} /> Copier le lien prérempli
      </button>
    </div>
  );

  return (
    <div className="cal-skin space-y-2.5" style={{ background: "transparent" }}>
      {/* Onglets Réserver / Lien */}
      <div className="seg" style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
        <button
          type="button"
          className="seg-btn"
          aria-selected={mode === "book"}
          onClick={() => setMode("book")}
          style={{ justifyContent: "center" }}
        >
          <CalendarPlus size={13} /> Réserver
        </button>
        <button
          type="button"
          className="seg-btn"
          aria-selected={mode === "link"}
          onClick={() => setMode("link")}
          style={{ justifyContent: "center" }}
        >
          <Link2 size={13} /> Lien
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
