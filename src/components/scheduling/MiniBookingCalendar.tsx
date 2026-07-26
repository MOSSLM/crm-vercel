"use client";

/**
 * Mini-calendrier de réservation — pensé pour la colonne contexte du cockpit
 * d'appel : l'agent choisit un type d'évènement, un jour disponible, un
 * créneau, saisit les coordonnées du prospect et réserve pendant l'appel.
 *
 * Passe par le vrai moteur (mêmes règles que le parcours public) : dispo
 * revérifiée côté serveur, contrainte anti double-booking, emails de
 * confirmation, calendrier CRM, Google, rappels.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Loader2,
} from "lucide-react";
import { authedFetch } from "@/utils/authedFetch";
import { fetchEventTypes } from "@/lib/scheduling/client";
import type { Booking, EventType } from "@/lib/scheduling/types";
import { getAppUrlClient } from "./host/shared";
import "./rdv-skin.css";
import "./rdv-embed.css";

const MONTHS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];
const WEEKDAYS_FR = ["L", "M", "M", "J", "V", "S", "D"];

const pad = (n: number) => `${n}`.padStart(2, "0");

const localDateKey = (iso: string): string =>
  new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(iso),
  );

const localTime = (iso: string): string =>
  new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

const dayLabel = (dateKey: string): string => {
  const [y, m, d] = dateKey.split("-").map(Number);
  const label = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
  return label.charAt(0).toUpperCase() + label.slice(1);
};

const browserTz = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Paris";
  } catch {
    return "Europe/Paris";
  }
};

export interface MiniBookingCalendarProps {
  prospectName?: string | null;
  prospectEmail?: string | null;
  prospectPhone?: string | null;
  callId?: string | null;
  opportuniteId?: string | null;
  onBooked?: (booking: Booking) => void;
}

export default function MiniBookingCalendar({
  prospectName,
  prospectEmail,
  prospectPhone,
  callId,
  opportuniteId,
  onBooked,
}: MiniBookingCalendarProps) {
  const now = useMemo(() => new Date(), []);
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [eventTypeId, setEventTypeId] = useState<string>("");
  const [loadingTypes, setLoadingTypes] = useState(true);

  const [monthCursor, setMonthCursor] = useState({
    year: now.getFullYear(),
    month: now.getMonth(),
  });
  const [slots, setSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  const [name, setName] = useState(prospectName ?? "");
  const [email, setEmail] = useState(prospectEmail ?? "");
  const [phone, setPhone] = useState(prospectPhone ?? "");
  const [booking, setBooking] = useState(false);
  const [done, setDone] = useState<Booking | null>(null);

  useEffect(() => setName(prospectName ?? ""), [prospectName]);
  useEffect(() => setEmail(prospectEmail ?? ""), [prospectEmail]);
  useEffect(() => setPhone(prospectPhone ?? ""), [prospectPhone]);

  const currentType = eventTypes.find((et) => et.id === eventTypeId) ?? null;

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchEventTypes();
        const active = data.event_types.filter((et) => et.is_active);
        setEventTypes(active);
        setEventTypeId(active[0]?.id ?? "");
      } catch {
        // panneau non bloquant
      } finally {
        setLoadingTypes(false);
      }
    })();
  }, []);

  const fetchSlots = useCallback(async () => {
    if (!eventTypeId) return;
    setLoadingSlots(true);
    try {
      const { year, month } = monthCursor;
      const from = new Date(Date.UTC(year, month, 1) - 24 * 3600 * 1000);
      const to = new Date(Date.UTC(year, month + 1, 1) + 24 * 3600 * 1000);
      const res = await authedFetch(
        `/api/scheduling/event-types/${eventTypeId}/slots?from=${from.toISOString()}&to=${to.toISOString()}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { slots: string[] };
      setSlots(data.slots ?? []);
    } catch {
      setSlots([]);
      toast.error("Chargement des créneaux impossible");
    } finally {
      setLoadingSlots(false);
    }
  }, [eventTypeId, monthCursor]);

  useEffect(() => {
    setSelectedDay(null);
    setSelectedSlot(null);
    void fetchSlots();
  }, [fetchSlots]);

  const slotsByDay = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const iso of slots) {
      const key = localDateKey(iso);
      const arr = map.get(key);
      if (arr) arr.push(iso);
      else map.set(key, [iso]);
    }
    return map;
  }, [slots]);

  const monthDays = useMemo(() => {
    const { year, month } = monthCursor;
    const startIso = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const cells: (string | null)[] = [];
    for (let i = 0; i < startIso; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(`${year}-${pad(month + 1)}-${pad(d)}`);
    return cells;
  }, [monthCursor]);

  const isCurrentMonth =
    monthCursor.year === now.getFullYear() && monthCursor.month === now.getMonth();

  const goMonth = (delta: number) =>
    setMonthCursor(({ year, month }) => {
      const d = new Date(Date.UTC(year, month + delta, 1));
      return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
    });

  const phoneRequired = currentType?.location_type === "phone";
  const canBook =
    !!selectedSlot &&
    name.trim().length > 0 &&
    /.+@.+\..+/.test(email) &&
    (!phoneRequired || phone.trim().length > 0);

  const book = async () => {
    if (!canBook || !selectedSlot || booking) return;
    setBooking(true);
    try {
      const res = await authedFetch("/api/scheduling/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_type_id: eventTypeId,
          start: selectedSlot,
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          timezone: browserTz(),
          call_id: callId ?? null,
          opportunite_id: opportuniteId ?? null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        booking?: Booking;
      };
      if (!res.ok || !data.booking) {
        if (data.error === "slot_taken" || data.error === "slot_unavailable") {
          toast.error("Ce créneau vient d'être pris — la liste a été rafraîchie.");
          setSelectedSlot(null);
          void fetchSlots();
        } else {
          toast.error("Réservation impossible", { description: data.error });
        }
        return;
      }
      setDone(data.booking);
      toast.success(`RDV réservé — confirmation envoyée à ${data.booking.invitee_email}`);
      onBooked?.(data.booking);
    } catch {
      toast.error("Erreur réseau — réessayez.");
    } finally {
      setBooking(false);
    }
  };

  const reset = () => {
    setDone(null);
    setSelectedSlot(null);
    setSelectedDay(null);
    void fetchSlots();
  };

  const inputCls =
    "w-full rounded-md border border-input bg-input-background px-2.5 py-1.5 text-sm placeholder:text-muted-foreground/60";

  if (loadingTypes) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Chargement…
      </div>
    );
  }

  if (eventTypes.length === 0) {
    return (
      <div className="rounded-lg border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
        Créez d&apos;abord un type d&apos;évènement dans Cal.SAMA → Types d&apos;évènements.
      </div>
    );
  }

  // ---- État succès -------------------------------------------------------
  if (done) {
    return (
      <div className="rounded-lg border border-[var(--ok)]/25 bg-[var(--ok-tint)] p-3">
        <p className="flex items-center gap-1.5 text-sm font-medium text-[var(--ok)]">
          <Check className="h-4 w-4" /> RDV réservé !
        </p>
        <p className="cal-mono mt-1.5 text-[11px] text-muted-foreground">
          {done.invitee_name} · {dayLabel(localDateKey(done.start_at))} à {localTime(done.start_at)}
          <br />
          Confirmation envoyée à {done.invitee_email}.
        </p>
        <div className="mt-2.5 flex gap-1.5">
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(
                `${getAppUrlClient()}/rdv/gerer/${done.manage_token}`,
              );
              toast.success("Lien de gestion copié");
            }}
            className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-border bg-card px-2 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--hover)]"
          >
            <Copy className="h-3 w-3" /> Lien de gestion
          </button>
          <button
            type="button"
            onClick={reset}
            className="rounded-md border border-border bg-card px-2 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--hover)]"
          >
            Nouveau RDV
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {/* Type d'évènement */}
      <select
        value={eventTypeId}
        onChange={(e) => setEventTypeId(e.target.value)}
        className="h-8 w-full rounded-md border border-input bg-input-background px-2 text-sm"
        aria-label="Type de rendez-vous"
      >
        {eventTypes.map((et) => (
          <option key={et.id} value={et.id}>
            {et.title} ({et.duration_minutes} min)
          </option>
        ))}
      </select>

      {!selectedSlot ? (
        <>
          {/* Mini calendrier (style maquettes) */}
          <div className="rounded-lg border bg-card p-2">
            <div className="flex items-center justify-between px-0.5 pb-1">
              <button
                type="button"
                onClick={() => goMonth(-1)}
                disabled={isCurrentMonth}
                aria-label="Mois précédent"
                className="rounded p-1 text-muted-foreground transition-colors enabled:hover:bg-[var(--hover)] enabled:hover:text-foreground disabled:opacity-30"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="cal-mono text-[11px] font-semibold uppercase tracking-wide">
                {MONTHS_FR[monthCursor.month]} {monthCursor.year}
              </span>
              <button
                type="button"
                onClick={() => goMonth(1)}
                aria-label="Mois suivant"
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-[var(--hover)] hover:text-foreground"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="cal-mini">
              {WEEKDAYS_FR.map((d, i) => (
                <div key={`${d}${i}`} className="cal-mini-wh">
                  {d}
                </div>
              ))}
              {monthDays.map((key, i) => {
                if (key === null) return <div key={`e${i}`} />;
                const day = Number(key.split("-")[2]);
                const has = (slotsByDay.get(key)?.length ?? 0) > 0;
                if (!has) {
                  return (
                    <div key={key} className="cal-mini-day" data-state="off">
                      {day}
                    </div>
                  );
                }
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedDay(key)}
                    className="cal-mini-day"
                    data-state={selectedDay === key ? "selected" : "free"}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            {loadingSlots ? (
              <p className="cal-mono mt-1.5 flex items-center gap-1.5 px-0.5 text-[10px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Disponibilités…
              </p>
            ) : null}
          </div>

          {/* Créneaux du jour */}
          {selectedDay ? (
            <div>
              <p className="cal-tag mb-1.5 text-muted-foreground">{dayLabel(selectedDay)}</p>
              <div className="grid max-h-36 grid-cols-3 gap-1.5 overflow-y-auto pr-0.5">
                {(slotsByDay.get(selectedDay) ?? []).map((iso) => (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => setSelectedSlot(iso)}
                    className="cal-slot"
                  >
                    {localTime(iso)}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Choisissez un jour disponible (point orange).
            </p>
          )}
        </>
      ) : (
        <>
          {/* Formulaire prospect */}
          <button
            type="button"
            onClick={() => setSelectedSlot(null)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" /> {dayLabel(localDateKey(selectedSlot))} à{" "}
            {localTime(selectedSlot)} — changer
          </button>
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nom du prospect *"
            aria-label="Nom du prospect"
          />
          <input
            type="email"
            className={inputCls}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@prospect.fr *"
            aria-label="Email du prospect"
          />
          <input
            type="tel"
            className={inputCls}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={phoneRequired ? "Téléphone * (RDV téléphonique)" : "Téléphone"}
            aria-label="Téléphone du prospect"
          />
          <button
            type="button"
            onClick={() => void book()}
            disabled={!canBook || booking}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {booking ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Réserver le créneau
          </button>
          <p className="text-center text-[10px] text-muted-foreground">
            Confirmation + invitation (.ics) envoyées automatiquement.
          </p>
        </>
      )}
    </div>
  );
}
