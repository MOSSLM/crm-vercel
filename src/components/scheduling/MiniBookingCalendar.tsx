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

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
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
import "./cal-skin.css";

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

  const inputCls = "inp";
  const dashedBox: CSSProperties = {
    background: "transparent",
    border: "1px dashed var(--border-2)",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 11.5,
    color: "var(--text-3)",
  };

  if (loadingTypes) {
    return (
      <div className="cal-skin" style={{ ...dashedBox, display: "flex", alignItems: "center", gap: 6 }}>
        <Loader2 size={13} className="spin" /> Chargement…
      </div>
    );
  }

  if (eventTypes.length === 0) {
    return (
      <div className="cal-skin" style={dashedBox}>
        Créez d&apos;abord un type d&apos;évènement dans Cal.SAMA → Types d&apos;évènements.
      </div>
    );
  }

  // ---- État succès -------------------------------------------------------
  if (done) {
    return (
      <div
        className="cal-skin"
        style={{
          background: "var(--ok-tint)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: 12,
        }}
      >
        <p
          style={{
            margin: 0,
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontWeight: 500,
            fontSize: 12.5,
            color: "var(--ok)",
          }}
        >
          <Check size={14} /> RDV réservé !
        </p>
        <p className="mono" style={{ margin: "6px 0 0", fontSize: 10.5, color: "var(--text-2)" }}>
          {done.invitee_name} · {dayLabel(localDateKey(done.start_at))} à {localTime(done.start_at)}
          <br />
          Confirmation envoyée à {done.invitee_email}.
        </p>
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(
                `${getAppUrlClient()}/rdv/gerer/${done.manage_token}`,
              );
              toast.success("Lien de gestion copié");
            }}
            className="btn outline xs grow"
          >
            <Copy size={12} /> Lien de gestion
          </button>
          <button type="button" onClick={reset} className="btn outline xs">
            Nouveau RDV
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="cal-skin space-y-2.5" style={{ background: "transparent" }}>
      {/* Type d'évènement */}
      <select
        value={eventTypeId}
        onChange={(e) => setEventTypeId(e.target.value)}
        className="inp"
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
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: 8,
              background: "var(--surface)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0 2px 4px",
              }}
            >
              <button
                type="button"
                onClick={() => goMonth(-1)}
                disabled={isCurrentMonth}
                className="btn ghost icon xs"
                aria-label="Mois précédent"
              >
                <ChevronLeft size={14} />
              </button>
              <span
                className="mono"
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: ".05em",
                }}
              >
                {MONTHS_FR[monthCursor.month]} {monthCursor.year}
              </span>
              <button
                type="button"
                onClick={() => goMonth(1)}
                className="btn ghost icon xs"
                aria-label="Mois suivant"
              >
                <ChevronRight size={14} />
              </button>
            </div>
            <div className="mini-cal">
              {WEEKDAYS_FR.map((d, i) => (
                <div key={`${d}${i}`} className="wh">
                  {d}
                </div>
              ))}
              {monthDays.map((key, i) => {
                if (key === null) return <div key={`e${i}`} />;
                const has = (slotsByDay.get(key)?.length ?? 0) > 0;
                const day = Number(key.split("-")[2]);
                if (!has) {
                  return (
                    <div key={key} className="d mute">
                      {day}
                    </div>
                  );
                }
                const selected = selectedDay === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedDay(key)}
                    className={"d has" + (selected ? " sel" : "")}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
            {loadingSlots ? (
              <p
                className="mono"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  margin: "6px 2px 0",
                  fontSize: 10,
                  color: "var(--text-3)",
                }}
              >
                <Loader2 size={11} className="spin" /> Disponibilités…
              </p>
            ) : null}
          </div>

          {/* Créneaux du jour */}
          {selectedDay ? (
            <div>
              <p className="cs-tag" style={{ margin: "0 0 6px" }}>
                {dayLabel(selectedDay)}
              </p>
              <div className="slots" style={{ maxHeight: 148, overflowY: "auto", paddingRight: 2 }}>
                {(slotsByDay.get(selectedDay) ?? []).map((iso) => (
                  <button key={iso} type="button" onClick={() => setSelectedSlot(iso)} className="slot">
                    {localTime(iso)}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: 11, color: "var(--text-3)" }}>
              Choisissez un jour disponible (point orange).
            </p>
          )}
        </>
      ) : (
        <>
          {/* Formulaire prospect */}
          <button type="button" onClick={() => setSelectedSlot(null)} className="btn ghost xs">
            <ArrowLeft size={12} /> {dayLabel(localDateKey(selectedSlot))} à {localTime(selectedSlot)}{" "}
            — changer
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
            className="btn accent sm"
            style={{ width: "100%" }}
          >
            {booking ? <Loader2 size={14} className="spin" /> : <Check size={14} />}
            Réserver le créneau
          </button>
          <p style={{ margin: 0, textAlign: "center", fontSize: 10.5, color: "var(--text-3)" }}>
            Confirmation + invitation (.ics) envoyées automatiquement.
          </p>
        </>
      )}
    </div>
  );
}
