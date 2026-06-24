"use client";

import React from "react";
import { getContrastColor } from "@/lib/color-utils";
import type { EventOccurrence } from "@/lib/recurrence";
import type { OverlayItem } from "./types";

export const HOUR_HEIGHT = 48; // px par heure
export const HOURS = Array.from({ length: 24 }, (_, i) => i);

const minutesFromMidnight = (d: Date) => d.getHours() * 60 + d.getMinutes();
const fmtTime = (d: Date) =>
  d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

/** Répartit en colonnes les occurrences qui se chevauchent dans une même journée. */
export function layoutOverlaps(
  occurrences: EventOccurrence[],
): Array<{ occ: EventOccurrence; col: number; cols: number }> {
  const sorted = [...occurrences].sort(
    (a, b) => a.start.getTime() - b.start.getTime() || a.end.getTime() - b.end.getTime(),
  );
  const result: Array<{ occ: EventOccurrence; col: number; cols: number }> = [];
  let cluster: EventOccurrence[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    const colEnds: number[] = [];
    const placed = cluster.map((o) => {
      let c = 0;
      while (c < colEnds.length && colEnds[c] > o.start.getTime()) c += 1;
      colEnds[c] = o.end.getTime();
      return { occ: o, col: c };
    });
    const cols = colEnds.length;
    placed.forEach((p) => result.push({ occ: p.occ, col: p.col, cols }));
    cluster = [];
  };

  for (const o of sorted) {
    if (cluster.length === 0) {
      cluster.push(o);
      clusterEnd = o.end.getTime();
    } else if (o.start.getTime() >= clusterEnd) {
      flush();
      cluster.push(o);
      clusterEnd = o.end.getTime();
    } else {
      cluster.push(o);
      clusterEnd = Math.max(clusterEnd, o.end.getTime());
    }
  }
  if (cluster.length) flush();
  return result;
}

const EventBlock = ({
  occ,
  col,
  cols,
  onSelect,
}: {
  occ: EventOccurrence;
  col: number;
  cols: number;
  onSelect: (occ: EventOccurrence) => void;
}) => {
  const top = (minutesFromMidnight(occ.start) / 60) * HOUR_HEIGHT;
  const rawHeight = ((occ.end.getTime() - occ.start.getTime()) / 3_600_000) * HOUR_HEIGHT;
  const height = Math.max(18, rawHeight - 2);
  const widthPct = 100 / cols;
  const text = getContrastColor(occ.event.color);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSelect(occ);
      }}
      className="absolute overflow-hidden rounded-md px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm ring-1 ring-black/5 transition hover:brightness-95"
      style={{
        top,
        height,
        left: `calc(${col * widthPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
        backgroundColor: occ.event.color,
        color: text,
      }}
      title={`${occ.event.title} · ${fmtTime(occ.start)}–${fmtTime(occ.end)}`}
    >
      <span className="block truncate font-semibold">{occ.event.title}</span>
      {height > 30 && (
        <span className="block truncate opacity-80">
          {fmtTime(occ.start)}–{fmtTime(occ.end)}
        </span>
      )}
    </button>
  );
};

export interface DayColumnProps {
  date: Date;
  occurrences: EventOccurrence[];
  onSelectOccurrence: (occ: EventOccurrence) => void;
  onCreateAt: (date: Date, hour: number) => void;
  isToday?: boolean;
}

export const DayColumn = ({
  date,
  occurrences,
  onSelectOccurrence,
  onCreateAt,
  isToday,
}: DayColumnProps) => {
  const placed = React.useMemo(() => layoutOverlaps(occurrences), [occurrences]);

  return (
    <div className="relative border-l" style={{ height: HOUR_HEIGHT * 24 }}>
      {isToday && <div className="pointer-events-none absolute inset-0 bg-primary/[0.03]" />}
      {HOURS.map((hour) => (
        <button
          key={hour}
          type="button"
          onClick={() => onCreateAt(date, hour)}
          className="block w-full border-t border-border/60 transition hover:bg-primary/5"
          style={{ height: HOUR_HEIGHT }}
          aria-label={`Créer un bloc à ${`${hour}`.padStart(2, "0")}:00`}
        />
      ))}
      {placed.map(({ occ, col, cols }) => (
        <EventBlock
          key={`${occ.event.id}-${occ.occurrenceDate}`}
          occ={occ}
          col={col}
          cols={cols}
          onSelect={onSelectOccurrence}
        />
      ))}
    </div>
  );
};

/** Puce d'un évènement "journée entière" (cliquable). */
export const AllDayEventChip = ({
  occ,
  onSelect,
}: {
  occ: EventOccurrence;
  onSelect: (occ: EventOccurrence) => void;
}) => (
  <button
    type="button"
    onClick={() => onSelect(occ)}
    className="flex w-full items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium ring-1 ring-black/5 transition hover:brightness-95"
    style={{ backgroundColor: occ.event.color, color: getContrastColor(occ.event.color) }}
    title={occ.event.title}
  >
    <span className="truncate">{occ.event.title}</span>
  </button>
);

/** Puce d'une échéance existante (projet/tâche), lecture seule. */
export const OverlayChip = ({ item }: { item: OverlayItem }) => (
  <span
    className="flex items-center gap-1 truncate rounded border border-dashed bg-muted/40 px-1.5 py-0.5 text-[11px] text-muted-foreground"
    title={`${item.label} (${item.kind})`}
  >
    <span
      className="h-1.5 w-1.5 shrink-0 rounded-full"
      style={{ backgroundColor: item.color ?? "#94a3b8" }}
    />
    <span className="truncate">{item.label}</span>
  </span>
);

/** Colonne d'heures (gouttière de gauche). */
export const HoursGutter = () => (
  <div className="relative" style={{ height: HOUR_HEIGHT * 24 }}>
    {HOURS.map((hour) => (
      <div
        key={hour}
        className="relative border-t border-transparent text-right"
        style={{ height: HOUR_HEIGHT }}
      >
        <span className="absolute -top-2 right-1 text-[10px] text-muted-foreground">
          {hour > 0 ? `${`${hour}`.padStart(2, "0")}:00` : ""}
        </span>
      </div>
    ))}
  </div>
);
