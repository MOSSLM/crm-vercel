"use client";

import React from "react";
import { ChevronLeft, ChevronRight, CalendarDays, CalendarRange, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/utils/supabase/client";

type CalendarView = "month" | "week" | "quarter";

const WEEK_DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
type PlanningItem = {
  id: string;
  label: string;
  kind: "projet" | "tache" | "sous-tache";
  date: string;
  projectId?: string;
};

const getStartOfWeek = (date: Date) => {
  const result = new Date(date);
  const day = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - day);
  result.setHours(0, 0, 0, 0);
  return result;
};

const formatLongDate = (date: Date) =>
  new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);

const isSameDay = (a: Date, b: Date) =>
  a.getDate() === b.getDate() &&
  a.getMonth() === b.getMonth() &&
  a.getFullYear() === b.getFullYear();

const monthLabel = (date: Date) =>
  new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(date);

const quarterLabel = (date: Date) => {
  const quarter = Math.floor(date.getMonth() / 3) + 1;
  return `T${quarter} ${date.getFullYear()}`;
};

export const CalendarPage = () => {
  const [currentDate, setCurrentDate] = React.useState(new Date());
  const [selectedDate, setSelectedDate] = React.useState(new Date());
  const [view, setView] = React.useState<CalendarView>("month");
  const [planningItems, setPlanningItems] = React.useState<PlanningItem[]>([]);

  const today = React.useMemo(() => new Date(), []);

  const monthGridDays = React.useMemo(() => {
    const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const monthStartWeek = getStartOfWeek(firstDay);

    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(monthStartWeek);
      day.setDate(monthStartWeek.getDate() + index);
      return day;
    });
  }, [currentDate]);

  const weekDays = React.useMemo(() => {
    const start = getStartOfWeek(currentDate);
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      return day;
    });
  }, [currentDate]);

  const quarterMonths = React.useMemo(() => {
    const qStartMonth = Math.floor(currentDate.getMonth() / 3) * 3;
    return Array.from({ length: 3 }, (_, index) => new Date(currentDate.getFullYear(), qStartMonth + index, 1));
  }, [currentDate]);

  React.useEffect(() => {
    const loadPlanning = async () => {
      const [{ data: projects }, { data: tasks }, { data: subtasks }] = await Promise.all([
        supabase.from("crm_projects").select("id,nom,due_date").not("due_date", "is", null),
        supabase.from("crm_tasks").select("id,project_id,titre,due_date").not("due_date", "is", null),
        supabase
          .from("crm_subtasks")
          .select("id,task_id,titre,due_date,crm_tasks(project_id)")
          .not("due_date", "is", null),
      ]);

      const projectItems: PlanningItem[] = (projects ?? []).map((project) => ({
        id: `project-${project.id}`,
        label: project.nom as string,
        kind: "projet",
        date: project.due_date as string,
        projectId: project.id as string,
      }));

      const taskItems: PlanningItem[] = (tasks ?? []).map((task) => ({
        id: `task-${task.id}`,
        label: task.titre as string,
        kind: "tache",
        date: task.due_date as string,
        projectId: task.project_id as string,
      }));

      const subtaskItems: PlanningItem[] = (
        (subtasks ?? []) as Array<{ id: string; titre: string; due_date: string; crm_tasks?: Array<{ project_id: string }> }>
      ).map((subtask) => ({
        id: `subtask-${subtask.id}`,
        label: subtask.titre,
        kind: "sous-tache",
        date: subtask.due_date,
        projectId: subtask.crm_tasks?.[0]?.project_id,
      }));

      setPlanningItems([...projectItems, ...taskItems, ...subtaskItems]);
    };

    void loadPlanning();
  }, []);

  const selectedDayItems = React.useMemo(
    () =>
      planningItems.filter((item: PlanningItem) => {
        const itemDate = new Date(item.date);
        return isSameDay(itemDate, selectedDate);
      }),
    [planningItems, selectedDate]
  );

  const goPrevious = () => {
    setCurrentDate((prev) => {
      const next = new Date(prev);
      if (view === "month") next.setMonth(next.getMonth() - 1);
      if (view === "week") next.setDate(next.getDate() - 7);
      if (view === "quarter") next.setMonth(next.getMonth() - 3);
      return next;
    });
  };

  const goNext = () => {
    setCurrentDate((prev) => {
      const next = new Date(prev);
      if (view === "month") next.setMonth(next.getMonth() + 1);
      if (view === "week") next.setDate(next.getDate() + 7);
      if (view === "quarter") next.setMonth(next.getMonth() + 3);
      return next;
    });
  };

  const currentLabel = view === "month" ? monthLabel(currentDate) : view === "week" ? "Vue semaine" : quarterLabel(currentDate);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Calendrier</h1>
          <p className="text-sm text-muted-foreground">Planification mensuelle, hebdomadaire ou trimestrielle.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" onClick={goPrevious} aria-label="Période précédente">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Badge variant="secondary" className="h-9 px-3 text-sm capitalize">
            {currentLabel}
          </Badge>
          <Button variant="outline" size="icon" onClick={goNext} aria-label="Période suivante">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <div className="ml-0 flex gap-2 md:ml-2">
            <Button variant={view === "month" ? "default" : "outline"} size="sm" onClick={() => setView("month")}>
              <Calendar className="mr-2 h-4 w-4" />Mois
            </Button>
            <Button variant={view === "week" ? "default" : "outline"} size="sm" onClick={() => setView("week")}>
              <CalendarDays className="mr-2 h-4 w-4" />Semaine
            </Button>
            <Button variant={view === "quarter" ? "default" : "outline"} size="sm" onClick={() => setView("quarter")}>
              <CalendarRange className="mr-2 h-4 w-4" />Trimestre
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Vue {view === "month" ? "mensuelle" : view === "week" ? "hebdomadaire" : "trimestrielle"}</CardTitle>
            <CardDescription>Sélectionnez un jour pour consulter les projets, tâches et sous-tâches prévues (hors horaire).</CardDescription>
          </CardHeader>
          <CardContent>
            {view === "month" && (
              <div>
                <div className="grid grid-cols-7 gap-2 pb-2">
                  {WEEK_DAYS.map((day) => (
                    <p key={day} className="text-center text-xs font-medium uppercase text-muted-foreground">
                      {day}
                    </p>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-2">
                  {monthGridDays.map((day) => {
                    const outsideMonth = day.getMonth() !== currentDate.getMonth();
                    const selected = isSameDay(day, selectedDate);
                    const isToday = isSameDay(day, today);

                    return (
                      <button
                        key={day.toISOString()}
                        onClick={() => setSelectedDate(day)}
                        className={`min-h-20 rounded-xl border p-2 text-left transition hover:border-primary/70 ${
                          outsideMonth ? "bg-muted/30 text-muted-foreground" : "bg-background"
                        } ${selected ? "border-primary ring-1 ring-primary" : "border-border"}`}
                      >
                        <div className="flex items-center justify-between text-sm font-medium">
                          <span>{day.getDate()}</span>
                          {isToday && <span className="h-2 w-2 rounded-full bg-primary" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {view === "week" && (
              <div className="grid gap-2 md:grid-cols-7">
                {weekDays.map((day) => {
                  const selected = isSameDay(day, selectedDate);
                  const isToday = isSameDay(day, today);
                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => setSelectedDate(day)}
                      className={`rounded-xl border p-3 text-left transition hover:border-primary/70 ${selected ? "border-primary ring-1 ring-primary" : "border-border"}`}
                    >
                      <p className="text-xs uppercase text-muted-foreground">{WEEK_DAYS[(day.getDay() + 6) % 7]}</p>
                      <p className="text-xl font-semibold">{day.getDate()}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {new Intl.DateTimeFormat("fr-FR", { month: "long" }).format(day)}
                      </p>
                      {isToday && <Badge className="mt-2">Aujourd&apos;hui</Badge>}
                    </button>
                  );
                })}
              </div>
            )}

            {view === "quarter" && (
              <div className="grid gap-3 md:grid-cols-3">
                {quarterMonths.map((monthDate) => {
                  const isCurrentMonth =
                    monthDate.getMonth() === selectedDate.getMonth() && monthDate.getFullYear() === selectedDate.getFullYear();

                  return (
                    <button
                      key={monthDate.toISOString()}
                      onClick={() => setSelectedDate(monthDate)}
                      className={`rounded-xl border p-4 text-left transition hover:border-primary/70 ${
                        isCurrentMonth ? "border-primary ring-1 ring-primary" : "border-border"
                      }`}
                    >
                      <p className="text-sm text-muted-foreground">Mois</p>
                      <p className="text-xl font-semibold capitalize">
                        {new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(monthDate)}
                      </p>
                      <p className="mt-3 text-sm text-muted-foreground">Aperçu consolidé du mois.</p>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Journée sélectionnée</CardTitle>
            <CardDescription className="capitalize">{formatLongDate(selectedDate)}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {selectedDayItems.map((item) => (
                <div key={item.id} className="rounded-lg border px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{item.label}</p>
                    <Badge variant="outline" className="capitalize">{item.kind}</Badge>
                  </div>
                </div>
              ))}
              {selectedDayItems.length === 0 ? <p className="text-sm text-muted-foreground">Aucun élément planifié ce jour.</p> : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
