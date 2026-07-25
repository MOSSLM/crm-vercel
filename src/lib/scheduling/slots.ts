/**
 * Moteur de calcul des créneaux disponibles — pur, testé, sans I/O.
 *
 * available = plages du planning (fuseau du planning, converties par date en UTC)
 *           − busy réel (bookings actifs + calendrier CRM + agendas externes)
 *           − buffers avant/après autour du créneau candidat
 *           − préavis minimum
 *           − limites de réservations par jour / par semaine
 *           → découpé selon la durée + la grille de départ (slot_interval)
 *
 * Les candidats sont ancrés au début de chaque plage horaire (9:00, 9:30, …
 * comme Calendly) puis filtrés — un busy au milieu ne décale pas la grille.
 */

import {
  dateKeyInTz,
  isoWeekKeyOfDateKey,
  isoWeekdayOfDateKey,
  nextDateKey,
  zonedTimeToUtc,
} from "./tz";
import type { BusyInterval, DateOverride, OverrideRange, ScheduleRule } from "./types";

export interface SlotComputationInput {
  /** Configuration du type d'évènement. */
  eventType: {
    duration_minutes: number;
    slot_interval_minutes: number | null;
    buffer_before_minutes: number;
    buffer_after_minutes: number;
    minimum_notice_minutes: number;
    booking_window_days: number;
    max_bookings_per_day: number | null;
    max_bookings_per_week: number | null;
  };
  /** Fuseau IANA du planning (les règles sont exprimées dedans). */
  timezone: string;
  rules: ScheduleRule[];
  overrides: DateOverride[];
  /** Intervalles occupés (bookings actifs, calendrier CRM, Google…), UTC ms. */
  busy: BusyInterval[];
  /**
   * Débuts (ISO UTC) des bookings actifs de l'hôte pour CE type d'évènement —
   * sert aux limites jour/semaine (comptées dans le fuseau du planning).
   */
  activeBookingStarts: string[];
  /** Fenêtre demandée (vue du calendrier invité), UTC. */
  fromUtc: Date;
  toUtc: Date;
  /** Instant courant (injectable pour les tests). */
  now?: Date;
}

/** Fusionne des intervalles triables en une liste triée sans chevauchement. */
export const mergeIntervals = (intervals: BusyInterval[]): BusyInterval[] => {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: BusyInterval[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const cur = sorted[i];
    if (cur.start <= last.end) {
      last.end = Math.max(last.end, cur.end);
    } else {
      merged.push({ ...cur });
    }
  }
  return merged;
};

/** [start, end) chevauche-t-il un intervalle fusionné ? (recherche binaire) */
const overlapsAny = (merged: BusyInterval[], start: number, end: number): boolean => {
  let lo = 0;
  let hi = merged.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const b = merged[mid];
    if (b.end <= start) lo = mid + 1;
    else if (b.start >= end) hi = mid - 1;
    else return true;
  }
  return false;
};

/** Plages d'un jour donné : override prioritaire, sinon règles hebdo. */
const rangesForDate = (
  dateKey: string,
  rules: ScheduleRule[],
  overridesByDate: Map<string, DateOverride>,
): OverrideRange[] => {
  const override = overridesByDate.get(dateKey);
  if (override) {
    if (override.is_unavailable) return [];
    return (override.ranges ?? []).filter(
      (r) =>
        Number.isFinite(r.startMinute) &&
        Number.isFinite(r.endMinute) &&
        r.endMinute > r.startMinute,
    );
  }
  const weekday = isoWeekdayOfDateKey(dateKey);
  return rules
    .filter((r) => r.weekday === weekday)
    .map((r) => ({ startMinute: r.start_minute, endMinute: r.end_minute }));
};

/**
 * Calcule les débuts de créneaux disponibles (instants UTC, triés, dédupliqués)
 * dans [fromUtc, toUtc].
 */
export function computeAvailableSlots(input: SlotComputationInput): Date[] {
  const { eventType, timezone, rules, overrides, fromUtc, toUtc } = input;
  const now = input.now ?? new Date();

  const durationMs = eventType.duration_minutes * 60000;
  const stepMs = (eventType.slot_interval_minutes ?? eventType.duration_minutes) * 60000;
  if (durationMs <= 0 || stepMs <= 0) return [];

  const bufferBeforeMs = eventType.buffer_before_minutes * 60000;
  const bufferAfterMs = eventType.buffer_after_minutes * 60000;

  // Fenêtre effective : préavis minimum + fenêtre de réservation max.
  const windowStart = Math.max(
    fromUtc.getTime(),
    now.getTime() + eventType.minimum_notice_minutes * 60000,
  );
  const windowEnd = Math.min(
    toUtc.getTime(),
    now.getTime() + eventType.booking_window_days * 24 * 3600 * 1000,
  );
  if (windowEnd <= windowStart) return [];

  const mergedBusy = mergeIntervals(input.busy);

  const overridesByDate = new Map<string, DateOverride>();
  for (const o of overrides) overridesByDate.set(o.date, o);

  // Comptes de bookings actifs par jour / semaine (fuseau du planning).
  const perDay = new Map<string, number>();
  const perWeek = new Map<string, number>();
  for (const iso of input.activeBookingStarts) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) continue;
    const key = dateKeyInTz(d, timezone);
    perDay.set(key, (perDay.get(key) ?? 0) + 1);
    perWeek.set(isoWeekKeyOfDateKey(key), (perWeek.get(isoWeekKeyOfDateKey(key)) ?? 0) + 1);
  }

  // Jours (fuseau du planning) couvrant la fenêtre, ±1 jour pour les
  // débordements de fuseau (une plage tardive à Tokyo tombe la veille en UTC).
  const startKey = dateKeyInTz(new Date(windowStart - 24 * 3600 * 1000), timezone);
  const endKey = dateKeyInTz(new Date(windowEnd + 24 * 3600 * 1000), timezone);

  const slots: Date[] = [];
  const seen = new Set<number>();

  // Garde : la fenêtre est bornée à booking_window_days (≤ 730) + marges.
  let guard = 0;
  for (let key = startKey; guard < 800; key = nextDateKey(key), guard++) {
    const dayRanges = rangesForDate(key, rules, overridesByDate);

    for (const range of dayRanges) {
      const rangeStart = zonedTimeToUtc(key, range.startMinute, timezone).getTime();
      const rangeEnd = zonedTimeToUtc(key, range.endMinute, timezone).getTime();
      if (rangeEnd <= rangeStart) continue;

      // Grille ancrée au début de la plage.
      for (let s = rangeStart; s + durationMs <= rangeEnd; s += stepMs) {
        const e = s + durationMs;
        if (s < windowStart) continue;
        if (e > windowEnd) break;
        // Le créneau + ses buffers ne doivent croiser aucun busy.
        if (overlapsAny(mergedBusy, s - bufferBeforeMs, e + bufferAfterMs)) continue;

        if (eventType.max_bookings_per_day != null || eventType.max_bookings_per_week != null) {
          const slotDayKey = dateKeyInTz(new Date(s), timezone);
          if (
            eventType.max_bookings_per_day != null &&
            (perDay.get(slotDayKey) ?? 0) >= eventType.max_bookings_per_day
          ) {
            continue;
          }
          if (
            eventType.max_bookings_per_week != null &&
            (perWeek.get(isoWeekKeyOfDateKey(slotDayKey)) ?? 0) >= eventType.max_bookings_per_week
          ) {
            continue;
          }
        }

        if (!seen.has(s)) {
          seen.add(s);
          slots.push(new Date(s));
        }
      }
    }

    if (key === endKey) break;
  }

  slots.sort((a, b) => a.getTime() - b.getTime());
  return slots;
}

/**
 * Vérification serveur d'UN créneau au moment de la réservation : recalcule la
 * dispo sur la journée du créneau et confirme que `startUtc` en fait partie.
 * (La contrainte d'exclusion en base reste le verrou final anti-concurrence.)
 */
export function isSlotAvailable(
  input: Omit<SlotComputationInput, "fromUtc" | "toUtc">,
  startUtc: Date,
): boolean {
  const from = new Date(startUtc.getTime() - 24 * 3600 * 1000);
  const to = new Date(
    startUtc.getTime() + input.eventType.duration_minutes * 60000 + 24 * 3600 * 1000,
  );
  const slots = computeAvailableSlots({ ...input, fromUtc: from, toUtc: to });
  return slots.some((s) => s.getTime() === startUtc.getTime());
}
