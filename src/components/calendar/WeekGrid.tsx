"use client";

import React from "react";
import { endOfDay, isSameDay, startOfDay } from "date-fns";
import { toDateKey, type CalendarEventModel, type EventOccurrence } from "@/lib/recurrence";
import type { OverlayItem } from "./types";
import { buildBuckets, getBucket } from "./occurrences";
import {
  AllDayEventChip,
  DayColumn,
  DragGhost,
  HOUR_HEIGHT,
  HoursGutter,
  OverlayChip,
} from "./dayColumn";
import { useGridDrag } from "./useGridDrag";

const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export interface WeekGridProps {
  days: Date[];
  events: CalendarEventModel[];
  overlay: OverlayItem[];
  today: Date;
  selectedDate: Date;
  onSelectDay: (date: Date) => void;
  onSelectOccurrence: (occ: EventOccurrence) => void;
  onCreateAt: (date: Date, hour: number) => void;
  onChanged: () => void;
}

export const WeekGrid = ({
  days,
  events,
  overlay,
  today,
  selectedDate,
  onSelectDay,
  onSelectOccurrence,
  onCreateAt,
  onChanged,
}: WeekGridProps) => {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const columnsRef = React.useRef<HTMLDivElement>(null);
  const { preview, beginDrag } = useGridDrag({
    columnsRef,
    days,
    onSelect: onSelectOccurrence,
    onChanged,
  });

  const buckets = React.useMemo(() => {
    if (days.length === 0) return new Map();
    return buildBuckets(events, overlay, startOfDay(days[0]), endOfDay(days[days.length - 1]));
  }, [events, overlay, days]);

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 7 * HOUR_HEIGHT;
  }, []);

  const hasAllDay = days.some((d) => {
    const b = getBucket(buckets, toDateKey(d));
    return b.allDay.length > 0 || b.overlay.length > 0;
  });

  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      {/* En-tête jours */}
      <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b">
        <div className="border-r" />
        {days.map((day) => {
          const selected = isSameDay(day, selectedDate);
          const isToday = isSameDay(day, today);
          return (
            <button
              key={day.toISOString()}
              onClick={() => onSelectDay(day)}
              className={`flex flex-col items-center gap-0.5 border-r py-2 text-center transition last:border-r-0 ${
                selected ? "bg-primary/10" : "hover:bg-muted/40"
              }`}
            >
              <span className="text-[11px] uppercase text-muted-foreground">
                {WEEKDAY_LABELS[(day.getDay() + 6) % 7]}
              </span>
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${
                  isToday ? "bg-primary text-primary-foreground" : ""
                }`}
              >
                {day.getDate()}
              </span>
            </button>
          );
        })}
      </div>

      {/* Bandeau journée entière + échéances */}
      {hasAllDay && (
        <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b bg-muted/10">
          <div className="flex items-center justify-end border-r px-1 py-1 text-[10px] text-muted-foreground">
            Jour
          </div>
          {days.map((day) => {
            const bucket = getBucket(buckets, toDateKey(day));
            return (
              <div key={day.toISOString()} className="space-y-1 border-r p-1 last:border-r-0">
                {bucket.allDay.map((occ) => (
                  <AllDayEventChip
                    key={`${occ.event.id}-${occ.occurrenceDate}`}
                    occ={occ}
                    onSelect={onSelectOccurrence}
                  />
                ))}
                {bucket.overlay.map((item) => (
                  <OverlayChip key={item.id} item={item} />
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Grille horaire */}
      <div ref={scrollRef} className="max-h-[60vh] overflow-y-auto">
        <div className="flex">
          <HoursGutter />
          <div
            ref={columnsRef}
            className="relative grid flex-1"
            style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
          >
            {days.map((day) => (
              <DayColumn
                key={day.toISOString()}
                date={day}
                occurrences={getBucket(buckets, toDateKey(day)).timed}
                onCreateAt={onCreateAt}
                onBlockPointerDown={beginDrag}
                activeKey={preview?.key ?? null}
                isToday={isSameDay(day, today)}
              />
            ))}
            {preview && (
              <DragGhost
                occ={preview.occ}
                startMinutes={preview.startMinutes}
                endMinutes={preview.endMinutes}
                dayIndex={preview.dayIndex}
                dayCount={days.length}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
