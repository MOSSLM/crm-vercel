"use client";

import React from "react";
import { supabase } from "@/utils/supabase/client";
import type { EventOccurrence } from "@/lib/recurrence";
import { HOUR_HEIGHT, occKey, type DragMode } from "./dayColumn";

const SNAP = 15; // minutes
const pad = (n: number) => `${n}`.padStart(2, "0");
const localIso = (y: number, mo: number, d: number, min: number) =>
  `${y}-${pad(mo + 1)}-${pad(d)}T${pad(Math.floor(min / 60))}:${pad(min % 60)}:00`;

const sameYMD = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export interface DragPreview {
  key: string;
  occ: EventOccurrence;
  mode: DragMode;
  dayIndex: number;
  startMinutes: number;
  endMinutes: number;
}

interface DragContext {
  occ: EventOccurrence;
  mode: DragMode;
  startX: number;
  startY: number;
  moved: boolean;
  baseStartMin: number;
  baseEndMin: number;
  durationMin: number;
  grabOffsetMin: number;
  dayIndex: number;
  allowDayChange: boolean;
  preview: { startMin: number; endMin: number; dayIndex: number } | null;
}

interface Config {
  columnsRef: React.RefObject<HTMLDivElement | null>;
  days: Date[];
  onSelect: (occ: EventOccurrence) => void;
  onChanged: () => void;
}

export function useGridDrag(config: Config) {
  const configRef = React.useRef(config);
  configRef.current = config;

  const ctxRef = React.useRef<DragContext | null>(null);
  const [preview, setPreview] = React.useState<DragPreview | null>(null);

  const minutesFromClientY = React.useCallback((clientY: number) => {
    const el = configRef.current.columnsRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const raw = ((clientY - rect.top) / HOUR_HEIGHT) * 60;
    return Math.max(0, Math.min(1440, Math.round(raw / SNAP) * SNAP));
  }, []);

  const dayIndexFromClientX = React.useCallback((clientX: number) => {
    const el = configRef.current.columnsRef.current;
    const days = configRef.current.days;
    if (!el || days.length === 0) return 0;
    const rect = el.getBoundingClientRect();
    const w = rect.width / days.length;
    return Math.max(0, Math.min(days.length - 1, Math.floor((clientX - rect.left) / w)));
  }, []);

  const handleMove = React.useCallback(
    (e: PointerEvent) => {
      const ctx = ctxRef.current;
      if (!ctx) return;
      if (!ctx.moved && Math.hypot(e.clientX - ctx.startX, e.clientY - ctx.startY) < 4) return;
      ctx.moved = true;
      e.preventDefault();

      const ptrMin = minutesFromClientY(e.clientY);
      let startMin = ctx.baseStartMin;
      let endMin = ctx.baseEndMin;
      let dayIndex = ctx.dayIndex;

      if (ctx.mode === "move") {
        startMin = ptrMin - ctx.grabOffsetMin;
        startMin = Math.round(startMin / SNAP) * SNAP;
        startMin = Math.max(0, Math.min(1440 - ctx.durationMin, startMin));
        endMin = startMin + ctx.durationMin;
        dayIndex = ctx.allowDayChange ? dayIndexFromClientX(e.clientX) : ctx.dayIndex;
      } else {
        startMin = ctx.baseStartMin;
        endMin = Math.max(ctx.baseStartMin + SNAP, Math.min(1440, ptrMin));
      }

      ctx.preview = { startMin, endMin, dayIndex };
      setPreview({
        key: occKey(ctx.occ),
        occ: ctx.occ,
        mode: ctx.mode,
        dayIndex,
        startMinutes: startMin,
        endMinutes: endMin,
      });
    },
    [minutesFromClientY, dayIndexFromClientX],
  );

  const handleUp = React.useCallback(async () => {
    const ctx = ctxRef.current;
    ctxRef.current = null;
    setPreview(null);
    if (!ctx) return;

    if (!ctx.moved) {
      configRef.current.onSelect(ctx.occ);
      return;
    }
    const p = ctx.preview;
    if (!p) return;

    const event = ctx.occ.event;
    const anchor = new Date(event.startAt);
    let y = anchor.getFullYear();
    let mo = anchor.getMonth();
    let d = anchor.getDate();
    // Changement de jour autorisé uniquement pour un évènement non récurrent.
    if (ctx.allowDayChange && ctx.mode === "move") {
      const target = configRef.current.days[p.dayIndex];
      if (target) {
        y = target.getFullYear();
        mo = target.getMonth();
        d = target.getDate();
      }
    }
    const start_at = localIso(y, mo, d, p.startMin);
    const end_at = localIso(y, mo, d, Math.max(p.startMin + SNAP, p.endMin));
    const { error } = await supabase
      .from("crm_calendar_events")
      .update({ start_at, end_at })
      .eq("id", event.id);
    if (!error) configRef.current.onChanged();
  }, []);

  React.useEffect(() => {
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [handleMove, handleUp]);

  const beginDrag = React.useCallback(
    (e: React.PointerEvent, occ: EventOccurrence, mode: DragMode) => {
      e.preventDefault();
      const { days } = configRef.current;
      const startMin = occ.start.getHours() * 60 + occ.start.getMinutes();
      const endMin = Math.min(
        1440,
        startMin + Math.round((occ.end.getTime() - occ.start.getTime()) / 60000),
      );
      const idx = days.findIndex((dd) => sameYMD(dd, occ.start));
      ctxRef.current = {
        occ,
        mode,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
        baseStartMin: startMin,
        baseEndMin: endMin,
        durationMin: endMin - startMin,
        grabOffsetMin: minutesFromClientY(e.clientY) - startMin,
        dayIndex: idx >= 0 ? idx : 0,
        allowDayChange: occ.event.rule.freq === "none" && days.length > 1,
        preview: null,
      };
    },
    [minutesFromClientY],
  );

  return { preview, beginDrag };
}
