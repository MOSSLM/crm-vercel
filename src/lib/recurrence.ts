/**
 * Moteur de récurrence — pur, sans dépendance React/DOM.
 *
 * Représentation volontairement simple (pas de RRULE iCal complet) couvrant les
 * besoins du calendrier : tous les jours, hebdo avec jours choisis (ex. tous les
 * lundis, jours de semaine), mensuel, avec intervalle, date de fin et exceptions.
 */

import { addDays, addMonths, addWeeks, startOfDay } from "date-fns";

export type RecurrenceFreq = "none" | "daily" | "weekly" | "monthly";

export interface RecurrenceRule {
  freq: RecurrenceFreq;
  /** Toutes les N occurrences (jours / semaines / mois). >= 1. */
  interval: number;
  /** Hebdomadaire : jours ISO 1=lun .. 7=dim. */
  weekdays?: number[];
  /** Dernière date incluse 'yyyy-MM-dd' ; null/undefined = sans fin. */
  until?: string | null;
  /** Occurrences supprimées une à une, dates 'yyyy-MM-dd'. */
  exceptions?: string[];
}

export interface CalendarEventModel {
  id: string;
  title: string;
  description?: string | null;
  /** Couleur résolue (catégorie ou override), format #RRGGBB. */
  color: string;
  categoryId?: string | null;
  categoryName?: string | null;
  allDay: boolean;
  /** ISO datetime de la 1re occurrence (date + heure de début). */
  startAt: string;
  /** ISO datetime de fin de la 1re occurrence (définit la durée). */
  endAt: string;
  rule: RecurrenceRule;
}

export interface EventOccurrence {
  event: CalendarEventModel;
  start: Date;
  end: Date;
  /** 'yyyy-MM-dd' de cette instance (clé pour les exceptions). */
  occurrenceDate: string;
}

/** Jour de semaine ISO (1=lun .. 7=dim) d'une date locale. */
export const isoWeekday = (date: Date): number => {
  const js = date.getDay(); // 0=dim .. 6=sam
  return js === 0 ? 7 : js;
};

/** Clé date locale 'yyyy-MM-dd' (sans décalage de fuseau). */
export const toDateKey = (date: Date): string => {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
};

/** Parse 'yyyy-MM-dd' en Date locale à minuit (évite le décalage UTC de new Date('yyyy-MM-dd')). */
const parseDateKey = (key: string): Date => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
};

/**
 * Développe les occurrences d'un évènement qui chevauchent [rangeStart, rangeEnd].
 *
 * L'heure/minute locale de `startAt` est conservée pour chaque occurrence et la
 * date est reconstruite via `new Date(y, m, d, h, min)` : pas de cumul de +24h,
 * donc pas de dérive aux transitions d'heure d'été/hiver.
 */
export function expandOccurrences(
  event: CalendarEventModel,
  rangeStart: Date,
  rangeEnd: Date,
): EventOccurrence[] {
  const start = new Date(event.startAt);
  const end = new Date(event.endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];

  const durationMs = Math.max(0, end.getTime() - start.getTime());
  const baseHours = start.getHours();
  const baseMinutes = start.getMinutes();
  const exceptions = new Set(event.rule.exceptions ?? []);
  const interval = Math.max(1, event.rule.interval || 1);
  const untilDate = event.rule.until ? parseDateKey(event.rule.until) : null;

  // Borne haute effective : fin de fenêtre, ou date de fin de récurrence si plus tôt.
  const hardEnd = untilDate
    ? new Date(Math.min(rangeEnd.getTime(), addDays(untilDate, 1).getTime()))
    : rangeEnd;

  const results: EventOccurrence[] = [];

  const pushOccurrence = (dayDate: Date) => {
    const occStart = new Date(
      dayDate.getFullYear(),
      dayDate.getMonth(),
      dayDate.getDate(),
      baseHours,
      baseMinutes,
      0,
      0,
    );
    const occEnd = new Date(occStart.getTime() + durationMs);
    // Chevauchement avec la fenêtre visible.
    if (occEnd.getTime() < rangeStart.getTime() || occStart.getTime() > rangeEnd.getTime()) return;
    const key = toDateKey(occStart);
    if (exceptions.has(key)) return;
    if (untilDate && occStart.getTime() > addDays(untilDate, 1).getTime()) return;
    results.push({ event, start: occStart, end: occEnd, occurrenceDate: key });
  };

  if (event.rule.freq === "none") {
    pushOccurrence(start);
    return results;
  }

  const startDay = startOfDay(start);
  // On commence l'itération au plus tôt entre le début de l'évènement et la fenêtre.
  const windowStartDay = startOfDay(rangeStart);

  if (event.rule.freq === "daily") {
    // Aligner sur la grille des occurrences (multiples d'interval jours depuis startDay).
    let cursor = startDay;
    if (windowStartDay.getTime() > startDay.getTime()) {
      const diffDays = Math.floor(
        (windowStartDay.getTime() - startDay.getTime()) / (24 * 60 * 60 * 1000),
      );
      const steps = Math.floor(diffDays / interval);
      cursor = addDays(startDay, steps * interval);
    }
    let guard = 0;
    while (cursor.getTime() <= hardEnd.getTime() && guard < 10000) {
      if (cursor.getTime() >= startDay.getTime()) pushOccurrence(cursor);
      cursor = addDays(cursor, interval);
      guard += 1;
    }
    return results;
  }

  if (event.rule.freq === "weekly") {
    const weekdays =
      event.rule.weekdays && event.rule.weekdays.length > 0
        ? [...event.rule.weekdays].sort((a, b) => a - b)
        : [isoWeekday(start)];
    // Début de la semaine (lundi) de la 1re occurrence.
    const startWeekMonday = addDays(startDay, -(isoWeekday(startDay) - 1));
    let weekCursor = startWeekMonday;
    // Avancer jusqu'à la fenêtre visible en respectant l'intervalle de semaines.
    if (windowStartDay.getTime() > weekCursor.getTime()) {
      const diffWeeks = Math.floor(
        (startOfDay(addDays(windowStartDay, -(isoWeekday(windowStartDay) - 1))).getTime() -
          weekCursor.getTime()) /
          (7 * 24 * 60 * 60 * 1000),
      );
      const steps = Math.floor(diffWeeks / interval);
      weekCursor = addWeeks(weekCursor, steps * interval);
    }
    let guard = 0;
    while (weekCursor.getTime() <= hardEnd.getTime() && guard < 5000) {
      for (const wd of weekdays) {
        const day = addDays(weekCursor, wd - 1); // wd: 1=lun => +0
        if (day.getTime() >= startDay.getTime()) pushOccurrence(day);
      }
      weekCursor = addWeeks(weekCursor, interval);
      guard += 1;
    }
    return results;
  }

  if (event.rule.freq === "monthly") {
    let cursor = startDay;
    let guard = 0;
    while (cursor.getTime() <= hardEnd.getTime() && guard < 1200) {
      if (cursor.getTime() >= startDay.getTime()) pushOccurrence(cursor);
      cursor = addMonths(cursor, interval);
      guard += 1;
    }
    return results;
  }

  return results;
}

/** Trie des occurrences par heure de début. */
export const sortOccurrences = (a: EventOccurrence, b: EventOccurrence) =>
  a.start.getTime() - b.start.getTime();
