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
export const fmtMinutes = (min: number) =>
  `${`${Math.floor(min / 60)}`.padStart(2, "0")}:${`${min % 60}`.padStart(2, "0")}`;

export type DragMode = "move" | "resize";
export const occKey = (occ: EventOccurrence) => `${occ.event.id}-${occ.occurrenceDate}`;

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
  dimmed,
  onPointerDown,
}: {
  occ: EventOccurrence;
  col: number;
  cols: number;
  dimmed: boolean;
  onPointerDown: (e: React.PointerEvent, occ: EventOccurrence, mode: DragMode) => void;
}) => {
  const top = (minutesFromMidnight(occ.start) / 60) * HOUR_HEIGHT;
  const rawHeight = ((occ.end.getTime() - occ.start.getTime()) / 3_600_000) * HOUR_HEIGHT;
  const height = Math.max(18, rawHeight - 2);
  const widthPct = 100 / cols;
  const text = getContrastColor(occ.event.color);

  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={(e) => onPointerDown(e, occ, "move")}
      className={`absolute cursor-grab overflow-hidden rounded-md px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm ring-1 ring-black/5 transition active:cursor-grabbing ${
        dimmed ? "opacity-40" : "hover:brightness-95"
      }`}
      style={{
        top,
        height,
        left: `calc(${col * widthPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
        backgroundColor: occ.event.color,
        color: text,
        touchAction: "none",
      }}
      title={`${occ.event.title} · ${fmtTime(occ.start)}–${fmtTime(occ.end)}`}
    >
      <span className="block truncate font-semibold">{occ.event.title}</span>
      {height > 30 && (
        <span className="block truncate opacity-80">
          {fmtTime(occ.start)}–{fmtTime(occ.end)}
        </span>
      )}
      {/* Poignée de redimensionnement */}
      <span
        onPointerDown={(e) => {
          e.stopPropagation();
          onPointerDown(e, occ, "resize");
        }}
        className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
        style={{ touchAction: "none" }}
        aria-hidden
      />
    </div>
  );
};

export interface DayColumnProps {
  date: Date;
  occurrences: EventOccurrence[];
  onCreateAt: (date: Date, hour: number) => void;
  onBlockPointerDown: (e: React.PointerEvent, occ: EventOccurrence, mode: DragMode) => void;
  activeKey?: string | null;
  isToday?: boolean;
}

export const DayColumn = ({
  date,
  occurrences,
  onCreateAt,
  onBlockPointerDown,
  activeKey,
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
          key={occKey(occ)}
          occ={occ}
          col={col}
          cols={cols}
          dimmed={activeKey === occKey(occ)}
          onPointerDown={onBlockPointerDown}
        />
      ))}
    </div>
  );
};

/** Aperçu fantôme rendu pendant un glisser-déposer. */
export const DragGhost = ({
  occ,
  startMinutes,
  endMinutes,
  dayIndex,
  dayCount,
}: {
  occ: EventOccurrence;
  startMinutes: number;
  endMinutes: number;
  dayIndex: number;
  dayCount: number;
}) => {
  const widthPct = 100 / dayCount;
  return (
    <div
      className="pointer-events-none absolute z-20 overflow-hidden rounded-md px-1.5 py-1 text-[11px] leading-tight shadow-lg ring-2 ring-primary"
      style={{
        top: (startMinutes / 60) * HOUR_HEIGHT,
        height: Math.max(18, ((endMinutes - startMinutes) / 60) * HOUR_HEIGHT),
        left: `calc(${dayIndex * widthPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
        backgroundColor: occ.event.color,
        color: getContrastColor(occ.event.color),
        opacity: 0.95,
      }}
    >
      <span className="block truncate font-semibold">{occ.event.title}</span>
      <span className="block truncate opacity-80">
        {fmtMinutes(startMinutes)}–{fmtMinutes(endMinutes)}
      </span>
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
  <div className="relative w-14 shrink-0" style={{ height: HOUR_HEIGHT * 24 }}>
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
