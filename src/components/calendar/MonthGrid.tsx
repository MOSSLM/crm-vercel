"use client";

import React from "react";
import { endOfDay, isSameDay, startOfDay } from "date-fns";
import { getContrastColor } from "@/lib/color-utils";
import {
  sortOccurrences,
  toDateKey,
  type CalendarEventModel,
  type EventOccurrence,
} from "@/lib/recurrence";
import type { OverlayItem } from "./types";
import { buildBuckets, getBucket } from "./occurrences";

const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MAX_CHIPS = 3;

const fmtTime = (d: Date) => d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

export interface MonthGridProps {
  monthDate: Date;
  monthGridDays: Date[];
  events: CalendarEventModel[];
  overlay: OverlayItem[];
  today: Date;
  selectedDate: Date;
  onSelectDay: (date: Date) => void;
  onSelectOccurrence: (occ: EventOccurrence) => void;
}

export const MonthGrid = ({
  monthDate,
  monthGridDays,
  events,
  overlay,
  today,
  selectedDate,
  onSelectDay,
  onSelectOccurrence,
}: MonthGridProps) => {
  const buckets = React.useMemo(() => {
    if (monthGridDays.length === 0) return new Map();
    return buildBuckets(
      events,
      overlay,
      startOfDay(monthGridDays[0]),
      endOfDay(monthGridDays[monthGridDays.length - 1]),
    );
  }, [events, overlay, monthGridDays]);

  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <div className="grid grid-cols-7 border-b">
        {WEEKDAY_LABELS.map((label) => (
          <p
            key={label}
            className="py-2 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
          >
            {label}
          </p>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {monthGridDays.map((day) => {
          const outside = day.getMonth() !== monthDate.getMonth();
          const isToday = isSameDay(day, today);
          const selected = isSameDay(day, selectedDate);
          const bucket = getBucket(buckets, toDateKey(day));
          const occ = [...bucket.allDay, ...bucket.timed].sort(sortOccurrences);
          const visible = occ.slice(0, MAX_CHIPS);
          const extra = occ.length - visible.length + bucket.overlay.length;

          return (
            <button
              key={day.toISOString()}
              onClick={() => onSelectDay(day)}
              className={`flex min-h-28 flex-col gap-1 border-b border-r p-1.5 text-left align-top transition hover:bg-muted/30 [&:nth-child(7n)]:border-r-0 ${
                outside ? "bg-muted/20 text-muted-foreground" : ""
              } ${selected ? "ring-1 ring-inset ring-primary" : ""}`}
            >
              <span
                className={`flex h-6 w-6 items-center justify-center self-start rounded-full text-xs font-semibold ${
                  isToday ? "bg-primary text-primary-foreground" : ""
                }`}
              >
                {day.getDate()}
              </span>
              <div className="flex flex-1 flex-col gap-0.5 overflow-hidden">
                {visible.map((o) => (
                  <span
                    key={`${o.event.id}-${o.occurrenceDate}`}
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectOccurrence(o);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.stopPropagation();
                        onSelectOccurrence(o);
                      }
                    }}
                    className="flex items-center gap-1 truncate rounded px-1 py-0.5 text-[10px] font-medium leading-tight ring-1 ring-black/5"
                    style={{ backgroundColor: o.event.color, color: getContrastColor(o.event.color) }}
                    title={`${o.event.title}${o.event.allDay ? "" : ` · ${fmtTime(o.start)}`}`}
                  >
                    {!o.event.allDay && <span className="opacity-80">{fmtTime(o.start)}</span>}
                    <span className="truncate">{o.event.title}</span>
                  </span>
                ))}
                {extra > 0 && (
                  <span className="px-1 text-[10px] text-muted-foreground">+{extra} de plus</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
