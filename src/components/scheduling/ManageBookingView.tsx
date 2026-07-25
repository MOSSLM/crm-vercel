"use client";

/**
 * Page publique « gérer mon rendez-vous » (lien reçu par email) :
 * détail du booking + annulation avec motif + reprogrammation (réutilise
 * BookingWidget en mode reschedule). Sans compte, authentifié par le token.
 */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, Calendar as CalendarIcon, Check, Loader2, MapPin, Video, X } from "lucide-react";
import BookingWidget from "./BookingWidget";
import { googleCalendarUrl, outlookCalendarUrl } from "./calendar-links";

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
    custom_questions: { id: string; label: string; type: "text" | "textarea" | "select" | "checkbox" | "phone"; required: boolean; options?: string[] }[];
    color: string | null;
    price_cents: number | null;
    currency: string;
    success_redirect_url: string | null;
  };
};

const fmtDate = (iso: string, tz: string): string => {
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
  return `${date.charAt(0).toUpperCase()}${date.slice(1)} à ${time}`;
};

const STATUS_LABELS: Record<string, string> = {
  pending: "En attente de validation",
  confirmed: "Confirmé",
  cancelled: "Annulé",
  declined: "Refusé",
};

export default function ManageBookingView({ token }: { token: string }) {
  const [data, setData] = useState<ManagePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"view" | "cancel" | "reschedule" | "cancelled">("view");
  const [reason, setReason] = useState("");
  const [working, setWorking] = useState(false);
  const [eventTypeData, setEventTypeData] = useState<EventTypePayload | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/scheduling/manage/${encodeURIComponent(token)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setEventTypeData((await res.json()) as EventTypePayload);
      setMode("reschedule");
    } catch {
      setError("Impossible de charger les disponibilités.");
    } finally {
      setWorking(false);
    }
  };

  const cancelBooking = async () => {
    setWorking(true);
    try {
      const res = await fetch(
        `/api/public/scheduling/manage/${encodeURIComponent(token)}/cancel`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: reason.trim() || null }),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setMode("cancelled");
      void load();
    } catch {
      setError("L'annulation a échoué. Réessayez.");
    } finally {
      setWorking(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FBFAF7]">
        <Loader2 className="h-6 w-6 animate-spin text-[#8A877F]" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FBFAF7] px-4">
        <div className="w-full max-w-md rounded-2xl border bg-white p-8 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
          <p className="mt-4 text-sm text-[#14120E]">{error ?? "Lien invalide."}</p>
        </div>
      </div>
    );
  }

  // Reprogrammé → renvoyer vers le lien du nouveau créneau.
  if (data.booking.status === "cancelled" && data.successor_token) {
    if (typeof window !== "undefined") {
      window.location.replace(`/rdv/gerer/${data.successor_token}`);
    }
    return null;
  }

  if (mode === "reschedule" && eventTypeData) {
    return (
      <div>
        <div className="bg-[#FBFAF7] px-4 pt-6">
          <button
            type="button"
            onClick={() => setMode("view")}
            className="mx-auto flex max-w-3xl items-center gap-1 text-sm text-[#8A877F] hover:text-[#14120E]"
          >
            <ArrowLeft className="h-4 w-4" /> Retour au rendez-vous
          </button>
        </div>
        <BookingWidget
          page={eventTypeData.page}
          eventType={eventTypeData.event_type}
          rescheduleToken={token}
          prefill={{ tz: data.booking.invitee_timezone }}
        />
      </div>
    );
  }

  const brand = data.brand_color || "#2A6FDB";
  const b = data.booking;
  const isActive = b.status === "pending" || b.status === "confirmed";
  const isCancelled = b.status === "cancelled" || b.status === "declined" || mode === "cancelled";

  return (
    <div className="min-h-screen bg-[#FBFAF7] px-4 py-10 text-[#14120E]">
      <div className="mx-auto w-full max-w-md overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="h-1.5 w-full" style={{ backgroundColor: brand }} />
        <div className="p-6">
          <p className="text-sm text-[#8A877F]">
            {data.host_display_name ? `Rendez-vous avec ${data.host_display_name}` : "Votre rendez-vous"}
          </p>
          <h1 className="mt-1 text-xl font-semibold">{b.event_title}</h1>

          <span
            className={
              "mt-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium " +
              (isCancelled
                ? "bg-red-50 text-red-700"
                : b.status === "pending"
                  ? "bg-amber-50 text-amber-700"
                  : "bg-emerald-50 text-emerald-700")
            }
          >
            {isCancelled ? <X className="h-3 w-3" /> : <Check className="h-3 w-3" />}
            {mode === "cancelled" ? "Annulé" : STATUS_LABELS[b.status] ?? b.status}
          </span>

          <div className="mt-4 space-y-2 text-sm">
            <p className="flex items-start gap-2">
              <CalendarIcon className="mt-0.5 h-4 w-4 shrink-0 text-[#8A877F]" />
              <span className={isCancelled ? "line-through opacity-60" : undefined}>
                {fmtDate(b.start_at, b.invitee_timezone)}
                <span className="block text-xs text-[#8A877F]">
                  ({b.invitee_timezone.replace(/_/g, " ")})
                </span>
              </span>
            </p>
            {b.meeting_url && !isCancelled ? (
              <p className="flex items-center gap-2">
                <Video className="h-4 w-4 shrink-0 text-[#8A877F]" />
                <a href={b.meeting_url} target="_blank" rel="noreferrer" className="underline" style={{ color: brand }}>
                  Rejoindre la visio
                </a>
              </p>
            ) : null}
            {b.location_text ? (
              <p className="flex items-center gap-2 text-[#8A877F]">
                <MapPin className="h-4 w-4 shrink-0" /> {b.location_text}
              </p>
            ) : null}
          </div>

          {b.status === "confirmed" ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-[#8A877F]">Ajouter à mon agenda :</span>
              <a
                className="rounded-full border px-3 py-1 font-medium hover:bg-[#F4F2EC]"
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
                Google
              </a>
              <a
                className="rounded-full border px-3 py-1 font-medium hover:bg-[#F4F2EC]"
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
                Outlook
              </a>
            </div>
          ) : null}

          {mode === "cancel" && isActive ? (
            <div className="mt-6 rounded-xl border bg-[#FBFAF7] p-4">
              <p className="text-sm font-medium">Annuler ce rendez-vous ?</p>
              <textarea
                className="mt-2 w-full rounded-lg border border-[#D8D4C8] bg-white px-3 py-2 text-sm"
                rows={2}
                placeholder="Motif (optionnel)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => void cancelBooking()}
                  disabled={working}
                  className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {working ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Confirmer l&apos;annulation
                </button>
                <button
                  type="button"
                  onClick={() => setMode("view")}
                  className="rounded-lg border px-3 py-2 text-sm"
                >
                  Retour
                </button>
              </div>
            </div>
          ) : null}

          {mode === "view" && isActive ? (
            <div className="mt-6 flex flex-col gap-2">
              {data.username && data.event_slug ? (
                <button
                  type="button"
                  onClick={() => void startReschedule()}
                  disabled={working}
                  className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                  style={{ backgroundColor: brand }}
                >
                  {working ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Reprogrammer
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setMode("cancel")}
                className="rounded-lg border px-4 py-2.5 text-sm font-medium text-red-600"
              >
                Annuler le rendez-vous
              </button>
            </div>
          ) : null}

          {isCancelled && data.username ? (
            <a
              href={`/rdv/${data.username}`}
              className="mt-6 inline-block w-full rounded-lg px-4 py-2.5 text-center text-sm font-medium text-white"
              style={{ backgroundColor: brand }}
            >
              Réserver un nouveau créneau
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
