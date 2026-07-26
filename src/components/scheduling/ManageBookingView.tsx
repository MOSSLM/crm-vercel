"use client";

/**
 * Page publique « gérer mon rendez-vous » (lien reçu par email) — habillée
 * comme la maquette : carte claire, en-tête sombre, récapitulatif, actions
 * de reprogrammation (réutilise BookingWidget) et d'annulation.
 */

import { useCallback, useEffect, useState } from "react";
import { Btn, Pill, Row, Stack, fmtDur, rvInit } from "./rdv/atoms";
import { Icon } from "./rdv/Icon";
import BookingWidget from "./BookingWidget";
import { googleCalendarUrl, outlookCalendarUrl } from "./calendar-links";
import "./rdv-skin.css";
import "./rdv-embed.css";

type ManagePayload = {
  booking: {
    id: string;
    event_title: string;
    location_type: string;
    location_text: string | null;
    meeting_url: string | null;
    start_at: string;
    end_at: string;
    status: string;
    invitee_name: string;
    invitee_email: string;
    invitee_timezone: string;
    manage_token: string;
    cancellation_reason: string | null;
  };
  successor_token: string | null;
  username: string | null;
  event_slug: string | null;
  host_display_name: string | null;
  brand_color: string;
};

type EventTypePayload = {
  page: {
    username: string;
    display_name: string;
    bio: string | null;
    avatar_url: string | null;
    brand_color: string;
    timezone: string;
  };
  event_type: {
    slug: string;
    title: string;
    description: string | null;
    duration_minutes: number;
    location_type: string;
    requires_confirmation: boolean;
    custom_questions: {
      id: string;
      label: string;
      type: "text" | "textarea" | "select" | "checkbox" | "phone";
      required: boolean;
      options?: string[];
    }[];
    color: string | null;
    price_cents: number | null;
    currency: string;
    success_redirect_url: string | null;
  };
};

const STATUS: Record<string, [string, string]> = {
  pending: ["En attente de validation", "warn"],
  confirmed: ["Confirmé", "ok"],
  cancelled: ["Annulé", "danger"],
  declined: ["Refusé", "danger"],
};

const fmtWhen = (iso: string, tz: string) => {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("fr-FR", {
    timeZone: tz,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
  const time = new Intl.DateTimeFormat("fr-FR", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  return `${date.charAt(0).toUpperCase()}${date.slice(1)} · ${time}`;
};

export default function ManageBookingView({ token }: { token: string }) {
  const [data, setData] = useState<ManagePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"view" | "cancel" | "reschedule">("view");
  const [reason, setReason] = useState("");
  const [working, setWorking] = useState(false);
  const [eventTypeData, setEventTypeData] = useState<EventTypePayload | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/scheduling/manage/${encodeURIComponent(token)}`);
      if (!res.ok) throw new Error(String(res.status));
      setData((await res.json()) as ManagePayload);
    } catch {
      setError("Rendez-vous introuvable ou lien expiré.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const startReschedule = async () => {
    if (!data?.username || !data.event_slug) return;
    setWorking(true);
    try {
      const res = await fetch(
        `/api/public/scheduling/${encodeURIComponent(data.username)}/${encodeURIComponent(
          data.event_slug,
        )}`,
      );
      if (!res.ok) throw new Error(String(res.status));
      setEventTypeData((await res.json()) as EventTypePayload);
      setMode("reschedule");
    } catch {
      setError("Impossible de charger les disponibilités.");
    } finally {
      setWorking(false);
    }
  };

  const cancel = async () => {
    setWorking(true);
    try {
      const res = await fetch(`/api/public/scheduling/manage/${encodeURIComponent(token)}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() || null }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setMode("view");
      await load();
    } catch {
      setError("L'annulation a échoué. Réessayez.");
    } finally {
      setWorking(false);
    }
  };

  if (loading) {
    return (
      <div className="rv-scope rv-public-stage">
        <div className="rv-empty">Chargement…</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rv-scope rv-public-stage">
        <div
          style={{
            width: "100%",
            maxWidth: 420,
            background: "var(--surface)",
            border: "1px solid var(--border-2)",
            borderRadius: 16,
            padding: 30,
            textAlign: "center",
            boxShadow: "var(--shadow-pop)",
          }}
        >
          <Icon name="warning" className="ico-xl" style={{ color: "var(--warn)" }} />
          <p style={{ marginTop: 12, fontSize: 13 }}>{error ?? "Lien invalide."}</p>
        </div>
      </div>
    );
  }

  // Reprogrammé : on redirige vers le lien du nouveau créneau.
  if (data.booking.status === "cancelled" && data.successor_token) {
    if (typeof window !== "undefined") {
      window.location.replace(`/rdv/gerer/${data.successor_token}`);
    }
    return null;
  }

  if (mode === "reschedule" && eventTypeData) {
    return (
      <div className="rv-scope rv-public-stage">
        <div style={{ width: "100%", maxWidth: 900 }}>
          <button type="button" className="btn ghost sm" style={{ marginBottom: 12 }} onClick={() => setMode("view")}>
            <Icon name="chevleft" className="ico-sm" />
            Retour au rendez-vous
          </button>
          <BookingWidget
            page={eventTypeData.page}
            eventType={eventTypeData.event_type}
            rescheduleToken={token}
            wide
            prefill={{ tz: data.booking.invitee_timezone }}
          />
        </div>
      </div>
    );
  }

  const b = data.booking;
  const [stLb, stKind] = STATUS[b.status] ?? STATUS.confirmed;
  const active = b.status === "pending" || b.status === "confirmed";
  const durationMin = Math.round((Date.parse(b.end_at) - Date.parse(b.start_at)) / 60000);

  return (
    <div className="rv-scope rv-public-stage">
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          background: "var(--surface)",
          border: "1px solid var(--border-2)",
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: "var(--shadow-pop)",
        }}
      >
        <div
          style={{
            background: "var(--ink)",
            color: "var(--on-ink)",
            padding: "22px 22px 20px",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "radial-gradient(ellipse at 80% 0%,rgba(226,85,43,.24),transparent 60%)",
            }}
          />
          <div style={{ position: "relative" }}>
            <Row style={{ gap: 10 }}>
              <span
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: "50%",
                  background: data.brand_color,
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                {rvInit(data.host_display_name ?? "?")}
              </span>
              <div>
                <div style={{ fontFamily: "var(--font-serif)", fontSize: 21, lineHeight: 1.1 }}>
                  {b.event_title}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10.5,
                    color: "var(--on-ink-3)",
                    textTransform: "uppercase",
                    letterSpacing: ".08em",
                    marginTop: 3,
                  }}
                >
                  avec {data.host_display_name ?? "votre hôte"}
                </div>
              </div>
            </Row>
          </div>
        </div>

        <div style={{ padding: 18 }}>
          <Row style={{ marginBottom: 12 }}>
            <Pill kind={stKind} dot>
              {stLb}
            </Pill>
            <span style={{ flex: 1 }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>
              {fmtDur(durationMin)}
            </span>
          </Row>

          <Stack gap={9}>
            <Row style={{ gap: 10, alignItems: "flex-start" }}>
              <Icon name="calCheck" className="ico-sm" style={{ color: "var(--accent)", marginTop: 2 }} />
              <div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    textDecoration: active ? "none" : "line-through",
                    opacity: active ? 1 : 0.6,
                  }}
                >
                  {fmtWhen(b.start_at, b.invitee_timezone)}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>
                  {b.invitee_timezone.replace(/_/g, " ")}
                </div>
              </div>
            </Row>

            {b.meeting_url && active ? (
              <Row style={{ gap: 10 }}>
                <Icon name="video" className="ico-sm" style={{ color: "var(--text-3)" }} />
                <a href={b.meeting_url} target="_blank" rel="noreferrer" style={{ fontSize: 12.5 }}>
                  Rejoindre la visio
                </a>
              </Row>
            ) : null}

            {b.location_text ? (
              <Row style={{ gap: 10 }}>
                <Icon name="mappin" className="ico-sm" style={{ color: "var(--text-3)" }} />
                <span style={{ fontSize: 12.5 }}>{b.location_text}</span>
              </Row>
            ) : null}

            {b.cancellation_reason ? (
              <Row style={{ gap: 10 }}>
                <Icon name="info" className="ico-sm" style={{ color: "var(--text-3)" }} />
                <span style={{ fontSize: 12.5, color: "var(--text-2)" }}>
                  {b.cancellation_reason}
                </span>
              </Row>
            ) : null}
          </Stack>

          {b.status === "confirmed" ? (
            <Row style={{ gap: 6, marginTop: 14, flexWrap: "wrap" }}>
              <a
                className="btn outline sm"
                target="_blank"
                rel="noreferrer"
                href={googleCalendarUrl({
                  title: b.event_title,
                  startIso: b.start_at,
                  endIso: b.end_at,
                  details: b.meeting_url ? `Visio : ${b.meeting_url}` : undefined,
                  location: b.meeting_url ?? b.location_text ?? undefined,
                })}
              >
                <Icon name="google" className="ico-sm" />
                Google Agenda
              </a>
              <a
                className="btn outline sm"
                target="_blank"
                rel="noreferrer"
                href={outlookCalendarUrl({
                  title: b.event_title,
                  startIso: b.start_at,
                  endIso: b.end_at,
                  details: b.meeting_url ? `Visio : ${b.meeting_url}` : undefined,
                  location: b.meeting_url ?? b.location_text ?? undefined,
                })}
              >
                <Icon name="microsoft" className="ico-sm" />
                Outlook
              </a>
            </Row>
          ) : null}

          {mode === "cancel" && active ? (
            <div
              style={{
                marginTop: 16,
                border: "1px solid var(--border)",
                borderRadius: 11,
                padding: 12,
                background: "var(--surface-2)",
              }}
            >
              <div style={{ fontSize: 12.5, fontWeight: 500 }}>Annuler ce rendez-vous ?</div>
              <textarea
                className="rv-in"
                style={{ marginTop: 8 }}
                rows={2}
                placeholder="Motif (optionnel)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <Row style={{ gap: 6, marginTop: 9 }}>
                <Btn kind="danger" ic="ban" disabled={working} onClick={() => void cancel()}>
                  Confirmer l&apos;annulation
                </Btn>
                <Btn kind="outline" onClick={() => setMode("view")}>
                  Retour
                </Btn>
              </Row>
            </div>
          ) : null}

          {mode === "view" && active ? (
            <Stack gap={7} style={{ marginTop: 16 }}>
              {data.username && data.event_slug ? (
                <Btn
                  kind="accent"
                  ic="repeat"
                  disabled={working}
                  onClick={() => void startReschedule()}
                  style={{ justifyContent: "center" }}
                >
                  Reprogrammer
                </Btn>
              ) : null}
              <Btn
                kind="outline"
                ic="ban"
                onClick={() => setMode("cancel")}
                style={{ justifyContent: "center", color: "var(--danger)" }}
              >
                Annuler le rendez-vous
              </Btn>
            </Stack>
          ) : null}

          {!active && data.username ? (
            <a
              className="btn accent"
              href={`/rdv/${data.username}`}
              style={{ marginTop: 16, width: "100%", justifyContent: "center" }}
            >
              Réserver un nouveau créneau
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
