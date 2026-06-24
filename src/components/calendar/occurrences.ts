import {
  expandOccurrences,
  toDateKey,
  type CalendarEventModel,
  type EventOccurrence,
} from "@/lib/recurrence";
import type { OverlayItem } from "./types";

export interface DayBucket {
  timed: EventOccurrence[];
  allDay: EventOccurrence[];
  overlay: OverlayItem[];
}

const emptyBucket = (): DayBucket => ({ timed: [], allDay: [], overlay: [] });

/** Regroupe par jour ('yyyy-MM-dd') les occurrences d'évènements et les échéances overlay. */
export function buildBuckets(
  events: CalendarEventModel[],
  overlay: OverlayItem[],
  rangeStart: Date,
  rangeEnd: Date,
): Map<string, DayBucket> {
  const map = new Map<string, DayBucket>();
  const ensure = (key: string) => {
    let bucket = map.get(key);
    if (!bucket) {
      bucket = emptyBucket();
      map.set(key, bucket);
    }
    return bucket;
  };

  for (const event of events) {
    for (const occ of expandOccurrences(event, rangeStart, rangeEnd)) {
      const bucket = ensure(occ.occurrenceDate);
      (event.allDay ? bucket.allDay : bucket.timed).push(occ);
    }
  }

  for (const item of overlay) {
    const d = new Date(item.date);
    if (Number.isNaN(d.getTime())) continue;
    if (d.getTime() < rangeStart.getTime() || d.getTime() > rangeEnd.getTime()) continue;
    ensure(toDateKey(d)).overlay.push(item);
  }

  return map;
}

export const getBucket = (map: Map<string, DayBucket>, key: string): DayBucket =>
  map.get(key) ?? emptyBucket();

/** Nombre total d'éléments d'un jour (pour la vue mois). */
export const bucketCount = (bucket: DayBucket) =>
  bucket.timed.length + bucket.allDay.length + bucket.overlay.length;
