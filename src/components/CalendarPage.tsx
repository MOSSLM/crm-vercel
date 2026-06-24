"use client";

import React from "react";
import {
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Clock,
  LayoutGrid,
  Plus,
} from "lucide-react";
import {
  addDays,
  addMonths,
  endOfMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { Button } from "@/components/ui/button";
import type { CalendarEventModel, EventOccurrence } from "@/lib/recurrence";
import { useCalendarData } from "./calendar/useCalendarData";
import { EventDialog } from "./calendar/EventDialog";
import { CategoryLegend } from "./calendar/CategoryLegend";
import { WeekGrid } from "./calendar/WeekGrid";
import { DayGrid } from "./calendar/DayGrid";
import { MonthGrid } from "./calendar/MonthGrid";
import { buildBuckets, bucketCount } from "./calendar/occurrences";

type CalendarView = "day" | "week" | "month" | "quarter";

const formatLongDate = (date: Date) =>
  new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);

const monthLabel = (date: Date) =>
  new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(date);

const quarterLabel = (date: Date) =>
  `T${Math.floor(date.getMonth() / 3) + 1} ${date.getFullYear()}`;

const weekLabel = (weekDays: Date[]) => {
  if (weekDays.length === 0) return "Semaine";
  const first = weekDays[0];
  const last = weekDays[6];
  const sameMonth = first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear();
  if (sameMonth) {
    return `${first.getDate()}–${last.getDate()} ${new Intl.DateTimeFormat("fr-FR", {
      month: "long",
      year: "numeric",
    }).format(first)}`;
  }
  return `${new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(first)} – ${new Intl.DateTimeFormat(
    "fr-FR",
    { day: "numeric", month: "short", year: "numeric" },
  ).format(last)}`;
};

export const CalendarPage = () => {
  const { categories, events, overlay, refresh } = useCalendarData();
  const today = React.useMemo(() => new Date(), []);

  const [currentDate, setCurrentDate] = React.useState(today);
  const [selectedDate, setSelectedDate] = React.useState(today);
  const [view, setView] = React.useState<CalendarView>("week");

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingEvent, setEditingEvent] = React.useState<CalendarEventModel | null>(null);
  const [occurrenceDate, setOccurrenceDate] = React.useState<string | null>(null);
  const [defaultStart, setDefaultStart] = React.useState<Date | null>(null);

  const weekDays = React.useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [currentDate]);

  const monthGridDays = React.useMemo(() => {
    const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 });
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [currentDate]);

  const quarterMonths = React.useMemo(() => {
    const qStart = Math.floor(currentDate.getMonth() / 3) * 3;
    return Array.from({ length: 3 }, (_, i) => new Date(currentDate.getFullYear(), qStart + i, 1));
  }, [currentDate]);

  // ── Navigation ──────────────────────────────────────────────
  const shift = (direction: 1 | -1) => {
    if (view === "day") {
      const next = addDays(selectedDate, direction);
      setSelectedDate(next);
      setCurrentDate(next);
    } else if (view === "week") {
      setCurrentDate((prev) => addDays(prev, 7 * direction));
    } else if (view === "month") {
      setCurrentDate((prev) => addMonths(prev, direction));
    } else {
      setCurrentDate((prev) => addMonths(prev, 3 * direction));
    }
  };

  const goToday = () => {
    setCurrentDate(today);
    setSelectedDate(today);
  };

  // ── Dialogue ────────────────────────────────────────────────
  const openCreate = (start: Date | null) => {
    setEditingEvent(null);
    setOccurrenceDate(null);
    setDefaultStart(start);
    setDialogOpen(true);
  };

  const openCreateAt = (date: Date, hour: number) => {
    const start = new Date(date);
    start.setHours(hour, 0, 0, 0);
    openCreate(start);
  };

  const openEdit = (occ: EventOccurrence) => {
    setEditingEvent(occ.event);
    setOccurrenceDate(occ.occurrenceDate);
    setDefaultStart(null);
    setDialogOpen(true);
  };

  const openDay = (date: Date) => {
    setSelectedDate(date);
    setCurrentDate(date);
    setView("day");
  };

  const currentLabel =
    view === "day"
      ? formatLongDate(selectedDate)
      : view === "week"
        ? weekLabel(weekDays)
        : view === "month"
          ? monthLabel(currentDate)
          : quarterLabel(currentDate);

  const VIEW_BUTTONS: { key: CalendarView; label: string; icon: React.ReactNode }[] = [
    { key: "day", label: "Jour", icon: <Clock className="mr-2 h-4 w-4" /> },
    { key: "week", label: "Semaine", icon: <CalendarDays className="mr-2 h-4 w-4" /> },
    { key: "month", label: "Mois", icon: <LayoutGrid className="mr-2 h-4 w-4" /> },
    { key: "quarter", label: "Trimestre", icon: <CalendarRange className="mr-2 h-4 w-4" /> },
  ];

  return (
    <div className="space-y-4 p-4 md:p-6">
      <EventDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        categories={categories}
        event={editingEvent}
        occurrenceDate={occurrenceDate}
        defaultStart={defaultStart}
        onSaved={refresh}
      />

      {/* Barre d'outils */}
      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Calendrier</h1>
            <p className="text-sm text-muted-foreground">
              Blocs de travail récurrents, code couleur, et échéances de tes projets.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={goToday}>
              Aujourd&apos;hui
            </Button>
            <Button variant="outline" size="icon" onClick={() => shift(-1)} aria-label="Précédent">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-44 rounded-md border px-3 py-2 text-center text-sm font-medium capitalize">
              {currentLabel}
            </div>
            <Button variant="outline" size="icon" onClick={() => shift(1)} aria-label="Suivant">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button size="sm" onClick={() => openCreate(selectedDate)}>
              <Plus className="mr-2 h-4 w-4" />
              Nouveau bloc
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-1">
            {VIEW_BUTTONS.map((vb) => (
              <Button
                key={vb.key}
                variant={view === vb.key ? "default" : "outline"}
                size="sm"
                onClick={() => setView(vb.key)}
              >
                {vb.icon}
                {vb.label}
              </Button>
            ))}
          </div>
          <CategoryLegend categories={categories} onChanged={refresh} />
        </div>
      </div>

      {/* Vues */}
      {view === "day" && (
        <DayGrid
          date={selectedDate}
          events={events}
          overlay={overlay}
          today={today}
          onSelectOccurrence={openEdit}
          onCreateAt={openCreateAt}
        />
      )}

      {view === "week" && (
        <WeekGrid
          days={weekDays}
          events={events}
          overlay={overlay}
          today={today}
          selectedDate={selectedDate}
          onSelectDay={openDay}
          onSelectOccurrence={openEdit}
          onCreateAt={openCreateAt}
        />
      )}

      {view === "month" && (
        <MonthGrid
          monthDate={currentDate}
          monthGridDays={monthGridDays}
          events={events}
          overlay={overlay}
          today={today}
          selectedDate={selectedDate}
          onSelectDay={openDay}
          onSelectOccurrence={openEdit}
        />
      )}

      {view === "quarter" && (
        <div className="grid gap-3 md:grid-cols-3">
          {quarterMonths.map((monthDate) => {
            const buckets = buildBuckets(
              events,
              overlay,
              startOfMonth(monthDate),
              endOfMonth(monthDate),
            );
            let total = 0;
            buckets.forEach((b) => {
              total += bucketCount(b);
            });
            return (
              <button
                key={monthDate.toISOString()}
                onClick={() => {
                  setCurrentDate(monthDate);
                  setView("month");
                }}
                className="rounded-2xl border bg-card p-4 text-left transition hover:border-primary/70"
              >
                <p className="text-sm text-muted-foreground">Mois</p>
                <p className="text-xl font-semibold capitalize">{monthLabel(monthDate)}</p>
                <p className="mt-3 text-sm text-muted-foreground">
                  {total > 0 ? `${total} élément${total > 1 ? "s" : ""} planifié${total > 1 ? "s" : ""}` : "Aucun élément"}
                </p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
