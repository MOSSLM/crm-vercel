"use client";

import React from "react";
import {
  Calendar,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Plus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/utils/supabase/client";

type CalendarView = "month" | "week" | "quarter";
type ItemStatus = "a_faire" | "en_cours" | "termine";
type Priority = "haute" | "moyenne" | "basse";

type PlanningItem = {
  id: string;
  label: string;
  kind: "projet" | "tache" | "sous-tache";
  date: string;
  startAt?: string | null;
  endAt?: string | null;
  projectId?: string;
};

const WEEK_DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const HOURS = Array.from({ length: 24 }, (_, index) => index);

const getStartOfWeek = (date: Date) => {
  const result = new Date(date);
  const day = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - day);
  result.setHours(0, 0, 0, 0);
  return result;
};

const isSameDay = (a: Date, b: Date) =>
  a.getDate() === b.getDate() &&
  a.getMonth() === b.getMonth() &&
  a.getFullYear() === b.getFullYear();

const formatLongDate = (date: Date) =>
  new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);

const monthLabel = (date: Date) =>
  new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(date);

const quarterLabel = (date: Date) => {
  const quarter = Math.floor(date.getMonth() / 3) + 1;
  return `T${quarter} ${date.getFullYear()}`;
};

const weekLabel = (weekDays: Date[]) => {
  if (weekDays.length === 0) return "Vue semaine";
  const first = weekDays[0];
  const last = weekDays[6];
  const sameMonth = first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear();

  if (sameMonth) {
    return `${first.getDate()}-${last.getDate()} ${new Intl.DateTimeFormat("fr-FR", {
      month: "long",
      year: "numeric",
    }).format(first)}`;
  }

  return `${new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
  }).format(first)} - ${new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(last)}`;
};

const getHourFromDateTime = (dateTime?: string | null) => {
  if (!dateTime) return null;
  const parsed = new Date(dateTime);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getHours();
};

const formatHour = (hour: number) => `${hour.toString().padStart(2, "0")}:00`;

const kindBadgeVariant = (kind: PlanningItem["kind"]): "default" | "secondary" | "outline" => {
  if (kind === "projet") return "default";
  if (kind === "tache") return "secondary";
  return "outline";
};

export const CalendarPage = () => {
  const [currentDate, setCurrentDate] = React.useState(new Date());
  const [selectedDate, setSelectedDate] = React.useState(new Date());
  const [view, setView] = React.useState<CalendarView>("month");
  const [planningItems, setPlanningItems] = React.useState<PlanningItem[]>([]);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    titre: "",
    status: "a_faire" as ItemStatus,
    priority: "moyenne" as Priority,
    startAt: "",
    endAt: "",
  });

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
    return Array.from({ length: 3 }, (_, index) =>
      new Date(currentDate.getFullYear(), qStartMonth + index, 1)
    );
  }, [currentDate]);

  const loadPlanning = React.useCallback(async () => {
    const [{ data: projects }, { data: tasks }, { data: subtasks }] = await Promise.all([
      supabase
        .from("crm_projects")
        .select("id,nom,due_date,start_at,end_at")
        .or("due_date.not.is.null,start_at.not.is.null,end_at.not.is.null"),
      supabase
        .from("crm_tasks")
        .select("id,project_id,titre,due_date,start_at,end_at")
        .or("due_date.not.is.null,start_at.not.is.null,end_at.not.is.null"),
      supabase
        .from("crm_subtasks")
        .select("id,task_id,titre,due_date,start_at,end_at,crm_tasks(project_id)")
        .or("due_date.not.is.null,start_at.not.is.null,end_at.not.is.null"),
    ]);

    const projectItems: PlanningItem[] = (projects ?? []).map((project) => ({
      id: `project-${project.id}`,
      label: project.nom as string,
      kind: "projet",
      date: (project.due_date as string) || (project.start_at as string) || (project.end_at as string),
      startAt: (project.start_at as string) ?? null,
      endAt: (project.end_at as string) ?? null,
      projectId: project.id as string,
    }));

    const taskItems: PlanningItem[] = (tasks ?? []).map((task) => ({
      id: `task-${task.id}`,
      label: task.titre as string,
      kind: "tache",
      date: (task.due_date as string) || (task.start_at as string) || (task.end_at as string),
      startAt: (task.start_at as string) ?? null,
      endAt: (task.end_at as string) ?? null,
      projectId: (task.project_id as string) ?? undefined,
    }));

    const subtaskItems: PlanningItem[] = (
      (subtasks ?? []) as Array<{
        id: string;
        titre: string;
        due_date: string;
        start_at?: string;
        end_at?: string;
        crm_tasks?: Array<{ project_id: string }>;
      }>
    ).map((subtask) => ({
      id: `subtask-${subtask.id}`,
      label: subtask.titre,
      kind: "sous-tache",
      date: subtask.due_date || subtask.start_at || subtask.end_at || new Date().toISOString(),
      startAt: subtask.start_at ?? null,
      endAt: subtask.end_at ?? null,
      projectId: subtask.crm_tasks?.[0]?.project_id,
    }));

    setPlanningItems([...projectItems, ...taskItems, ...subtaskItems]);
  }, []);

  React.useEffect(() => {
    void loadPlanning();
  }, [loadPlanning]);

  const createTaskFromCalendar = async () => {
    if (!form.titre.trim()) return;

    const startAt = form.startAt || `${selectedDate.toISOString().slice(0, 10)}T09:00`;
    const endAt = form.endAt || `${selectedDate.toISOString().slice(0, 10)}T10:00`;

    await supabase.from("crm_tasks").insert({
      titre: form.titre.trim(),
      status: form.status,
      priority: form.priority,
      project_id: null,
      start_at: startAt,
      end_at: endAt,
      due_date: endAt.slice(0, 10),
    });

    setCreateOpen(false);
    setForm({ titre: "", status: "a_faire", priority: "moyenne", startAt: "", endAt: "" });
    await loadPlanning();
  };

  const selectedDayItems = React.useMemo(
    () =>
      planningItems
        .filter((item) => isSameDay(new Date(item.date), selectedDate))
        .sort((a, b) => {
          const hourA = getHourFromDateTime(a.startAt);
          const hourB = getHourFromDateTime(b.startAt);

          if (hourA === null && hourB === null) return a.label.localeCompare(b.label);
          if (hourA === null) return -1;
          if (hourB === null) return 1;
          return hourA - hourB;
        }),
    [planningItems, selectedDate]
  );

  const selectedUntimedItems = React.useMemo(
    () => selectedDayItems.filter((item) => getHourFromDateTime(item.startAt) === null),
    [selectedDayItems]
  );

  const selectedHourlySlots = React.useMemo(
    () =>
      HOURS.map((hour) => ({
        hour,
        items: selectedDayItems.filter((item) => getHourFromDateTime(item.startAt) === hour),
      })),
    [selectedDayItems]
  );

  const weeklyHourlySlots = React.useMemo(
    () =>
      HOURS.map((hour) => ({
        hour,
        days: weekDays.map((day) => ({
          day,
          items: planningItems.filter(
            (item) =>
              isSameDay(new Date(item.date), day) && getHourFromDateTime(item.startAt) === hour
          ),
        })),
      })),
    [planningItems, weekDays]
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

  const currentLabel =
    view === "month"
      ? monthLabel(currentDate)
      : view === "week"
      ? weekLabel(weekDays)
      : quarterLabel(currentDate);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Créer une tâche depuis le calendrier</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Titre</Label>
              <Input
                value={form.titre}
                onChange={(e) => setForm((prev) => ({ ...prev, titre: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Début</Label>
                <Input
                  type="datetime-local"
                  value={form.startAt}
                  onChange={(e) => setForm((prev) => ({ ...prev, startAt: e.target.value }))}
                />
              </div>
              <div>
                <Label>Fin</Label>
                <Input
                  type="datetime-local"
                  value={form.endAt}
                  onChange={(e) => setForm((prev) => ({ ...prev, endAt: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={createTaskFromCalendar}>Créer la tâche</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Calendrier</h1>
          <p className="text-sm text-muted-foreground">
            Planification mensuelle, hebdomadaire ou trimestrielle.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" onClick={goPrevious} aria-label="Période précédente">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-44 rounded-md border px-3 py-2 text-center text-sm font-medium capitalize">
            {currentLabel}
          </div>
          <Button variant="outline" size="icon" onClick={goNext} aria-label="Période suivante">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nouvelle tâche
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant={view === "month" ? "default" : "outline"}
              size="sm"
              onClick={() => setView("month")}
            >
              <Calendar className="mr-2 h-4 w-4" />
              Mois
            </Button>
            <Button
              variant={view === "week" ? "default" : "outline"}
              size="sm"
              onClick={() => setView("week")}
            >
              <CalendarDays className="mr-2 h-4 w-4" />
              Semaine
            </Button>
            <Button
              variant={view === "quarter" ? "default" : "outline"}
              size="sm"
              onClick={() => setView("quarter")}
            >
              <CalendarRange className="mr-2 h-4 w-4" />
              Trimestre
            </Button>
          </div>
        </div>
      </div>

      {view === "month" && (
        <div className="grid gap-4 xl:grid-cols-[1.8fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Vue mensuelle</CardTitle>
              <CardDescription>
                Sélectionnez un jour. Le panneau de droite détaille les tâches sans heure puis la
                journée heure par heure.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-2 pb-2">
                {WEEK_DAYS.map((day) => (
                  <p
                    key={day}
                    className="text-center text-xs font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    {day}
                  </p>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-2">
                {monthGridDays.map((day) => {
                  const outsideMonth = day.getMonth() !== currentDate.getMonth();
                  const selected = isSameDay(day, selectedDate);
                  const isToday = isSameDay(day, today);
                  const dayCount = planningItems.filter((item) =>
                    isSameDay(new Date(item.date), day)
                  ).length;

                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => setSelectedDate(day)}
                      className={`min-h-24 rounded-xl border p-2 text-left transition hover:border-primary/70 ${
                        outsideMonth ? "bg-muted/30 text-muted-foreground" : "bg-background"
                      } ${selected ? "border-primary ring-1 ring-primary" : "border-border"}`}
                    >
                      <div className="flex items-center justify-between text-sm font-medium">
                        <span>{day.getDate()}</span>
                        {isToday && <span className="h-2 w-2 rounded-full bg-primary" />}
                      </div>
                      <p className="mt-6 text-xs text-muted-foreground">
                        {dayCount > 0 ? `${dayCount} élément${dayCount > 1 ? "s" : ""}` : "Aucun"}
                      </p>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Journée sélectionnée</CardTitle>
              <CardDescription className="capitalize">{formatLongDate(selectedDate)}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="mb-2 text-sm font-semibold">Tâches sans horaire</h3>
                {selectedUntimedItems.length > 0 ? (
                  <div className="space-y-2">
                    {selectedUntimedItems.map((item) => (
                      <div key={item.id} className="rounded-lg border bg-muted/30 px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium">{item.label}</p>
                          <Badge variant={kindBadgeVariant(item.kind)} className="capitalize">
                            {item.kind}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Aucune tâche sans horaire.</p>
                )}
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold">Planning heure par heure</h3>
                <div className="max-h-[480px] space-y-2 overflow-auto pr-1">
                  {selectedHourlySlots.map((slot) => (
                    <div key={slot.hour} className="rounded-lg border p-2">
                      <p className="mb-1 text-xs font-semibold text-muted-foreground">
                        {formatHour(slot.hour)}
                      </p>
                      {slot.items.length > 0 ? (
                        <div className="space-y-1">
                          {slot.items.map((item) => (
                            <div key={item.id} className="rounded-md border bg-background px-2 py-1">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-medium">{item.label}</p>
                                <Badge variant={kindBadgeVariant(item.kind)} className="capitalize">
                                  {item.kind}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {item.startAt
                                  ? new Date(item.startAt).toLocaleTimeString("fr-FR", {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })
                                  : "--:--"}
                                {" - "}
                                {item.endAt
                                  ? new Date(item.endAt).toLocaleTimeString("fr-FR", {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })
                                  : "--:--"}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">Libre</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {view === "week" && (
        <Card>
          <CardHeader>
            <CardTitle>Vue hebdomadaire</CardTitle>
            <CardDescription>
              En dessous des jours, la grille horaire affiche les tâches selon l&apos;heure de début.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto">
              <div className="min-w-[920px]">
                <div className="grid grid-cols-[72px_repeat(7,minmax(0,1fr))] border-b bg-muted/20">
                  <div className="border-r p-2 text-xs font-medium text-muted-foreground">Heure</div>
                  {weekDays.map((day) => {
                    const selected = isSameDay(day, selectedDate);
                    const isToday = isSameDay(day, today);

                    return (
                      <button
                        key={day.toISOString()}
                        onClick={() => setSelectedDate(day)}
                        className={`border-r p-2 text-left transition last:border-r-0 ${
                          selected ? "bg-primary/10" : "hover:bg-muted/30"
                        }`}
                      >
                        <p className="text-xs uppercase text-muted-foreground">
                          {WEEK_DAYS[(day.getDay() + 6) % 7]}
                        </p>
                        <p className="text-base font-semibold">{day.getDate()}</p>
                        {isToday ? <Badge className="mt-1">Aujourd&apos;hui</Badge> : null}
                      </button>
                    );
                  })}
                </div>

                {weeklyHourlySlots.map((row) => (
                  <div
                    key={row.hour}
                    className="grid min-h-16 grid-cols-[72px_repeat(7,minmax(0,1fr))] border-b"
                  >
                    <div className="border-r p-2 text-xs font-medium text-muted-foreground">
                      {formatHour(row.hour)}
                    </div>
                    {row.days.map(({ day, items }) => (
                      <div key={`${day.toISOString()}-${row.hour}`} className="border-r p-2 last:border-r-0">
                        {items.length > 0 ? (
                          <div className="space-y-1">
                            {items.map((item) => (
                              <div key={item.id} className="rounded-md border bg-card px-2 py-1">
                                <p className="text-xs font-medium">{item.label}</p>
                                <p className="text-[11px] text-muted-foreground capitalize">
                                  {item.kind}
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-muted-foreground">—</p>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {view === "quarter" && (
        <Card>
          <CardHeader>
            <CardTitle>Vue trimestrielle</CardTitle>
            <CardDescription>Vue consolidée des trois mois du trimestre.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-3">
              {quarterMonths.map((monthDate) => {
                const isCurrentMonth =
                  monthDate.getMonth() === selectedDate.getMonth() &&
                  monthDate.getFullYear() === selectedDate.getFullYear();

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
                      {new Intl.DateTimeFormat("fr-FR", {
                        month: "long",
                        year: "numeric",
                      }).format(monthDate)}
                    </p>
                    <p className="mt-3 text-sm text-muted-foreground">Aperçu consolidé du mois.</p>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
