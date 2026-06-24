"use client";

import React from "react";
import { endOfDay, isSameDay, startOfDay } from "date-fns";
import { toDateKey, type CalendarEventModel, type EventOccurrence } from "@/lib/recurrence";
import type { OverlayItem } from "./types";
import { buildBuckets, getBucket } from "./occurrences";
import {
  AllDayEventChip,
  DayColumn,
  HOUR_HEIGHT,
  HoursGutter,
  OverlayChip,
} from "./dayColumn";

export interface DayGridProps {
  date: Date;
  events: CalendarEventModel[];
  overlay: OverlayItem[];
  today: Date;
  onSelectOccurrence: (occ: EventOccurrence) => void;
  onCreateAt: (date: Date, hour: number) => void;
}

export const DayGrid = ({
  date,
  events,
  overlay,
  today,
  onSelectOccurrence,
  onCreateAt,
}: DayGridProps) => {
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const bucket = React.useMemo(() => {
    const map = buildBuckets(events, overlay, startOfDay(date), endOfDay(date));
    return getBucket(map, toDateKey(date));
  }, [events, overlay, date]);

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 7 * HOUR_HEIGHT;
  }, []);

  const hasAllDay = bucket.allDay.length > 0 || bucket.overlay.length > 0;

  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      {hasAllDay && (
        <div className="grid grid-cols-[56px_minmax(0,1fr)] border-b bg-muted/10">
          <div className="flex items-center justify-end border-r px-1 py-1 text-[10px] text-muted-foreground">
            Jour
          </div>
          <div className="flex flex-wrap gap-1 p-1">
            {bucket.allDay.map((occ) => (
              <div key={`${occ.event.id}-${occ.occurrenceDate}`} className="min-w-32">
                <AllDayEventChip occ={occ} onSelect={onSelectOccurrence} />
              </div>
            ))}
            {bucket.overlay.map((item) => (
              <OverlayChip key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}

      <div ref={scrollRef} className="max-h-[65vh] overflow-y-auto">
        <div className="grid grid-cols-[56px_minmax(0,1fr)]">
          <HoursGutter />
          <DayColumn
            date={date}
            occurrences={bucket.timed}
            onSelectOccurrence={onSelectOccurrence}
            onCreateAt={onCreateAt}
            isToday={isSameDay(date, today)}
          />
        </div>
      </div>
    </div>
  );
};
