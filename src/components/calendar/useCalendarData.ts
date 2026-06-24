"use client";

import React from "react";
import { supabase } from "@/utils/supabase/client";
import type { CalendarEventModel, RecurrenceRule } from "@/lib/recurrence";
import { CALENDAR_PALETTE, DEFAULT_EVENT_COLOR, type CalendarCategory, type OverlayItem } from "./types";

type EventRow = {
  id: string;
  title: string;
  description: string | null;
  category_id: string | null;
  color: string | null;
  all_day: boolean;
  start_at: string;
  end_at: string;
  recurrence_freq: RecurrenceRule["freq"];
  recurrence_interval: number;
  recurrence_weekdays: number[] | null;
  recurrence_until: string | null;
  recurrence_exceptions: string[] | null;
};

const mapEvent = (row: EventRow, categoryById: Map<string, CalendarCategory>): CalendarEventModel => {
  const category = row.category_id ? categoryById.get(row.category_id) : undefined;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    color: row.color || category?.color || DEFAULT_EVENT_COLOR,
    categoryId: row.category_id,
    categoryName: category?.nom ?? null,
    allDay: row.all_day,
    startAt: row.start_at,
    endAt: row.end_at,
    rule: {
      freq: row.recurrence_freq ?? "none",
      interval: row.recurrence_interval ?? 1,
      weekdays: row.recurrence_weekdays ?? undefined,
      until: row.recurrence_until,
      exceptions: row.recurrence_exceptions ?? [],
    },
  };
};

export interface CalendarData {
  categories: CalendarCategory[];
  events: CalendarEventModel[];
  overlay: OverlayItem[];
  loading: boolean;
  refresh: () => Promise<void>;
}

export const useCalendarData = (): CalendarData => {
  const [categories, setCategories] = React.useState<CalendarCategory[]>([]);
  const [events, setEvents] = React.useState<CalendarEventModel[]>([]);
  const [overlay, setOverlay] = React.useState<OverlayItem[]>([]);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    const [{ data: catRows }, { data: eventRows }] = await Promise.all([
      supabase.from("crm_calendar_categories").select("id,nom,color,position").order("position"),
      supabase
        .from("crm_calendar_events")
        .select(
          "id,title,description,category_id,color,all_day,start_at,end_at,recurrence_freq,recurrence_interval,recurrence_weekdays,recurrence_until,recurrence_exceptions",
        ),
    ]);

    const cats: CalendarCategory[] = (catRows ?? []).map((c) => ({
      id: c.id as string,
      nom: c.nom as string,
      color: (c.color as string) ?? DEFAULT_EVENT_COLOR,
      position: (c.position as number) ?? 100,
    }));
    const categoryById = new Map(cats.map((c) => [c.id, c]));
    setCategories(cats);
    setEvents(((eventRows ?? []) as EventRow[]).map((row) => mapEvent(row, categoryById)));

    // Overlay : échéances existantes (lecture seule), colorées par couleur de projet.
    const [{ data: projects }, { data: tasks }, { data: subtasks }] = await Promise.all([
      supabase
        .from("crm_projects")
        .select("id,nom,due_date,start_at,end_at,color")
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

    const projectColorById = new Map<string, string>();
    const projectItems: OverlayItem[] = (projects ?? []).map((project) => {
      const color = (project.color as string) ?? null;
      if (color) projectColorById.set(project.id as string, color);
      return {
        id: `project-${project.id}`,
        label: project.nom as string,
        kind: "projet",
        date: (project.due_date as string) || (project.start_at as string) || (project.end_at as string),
        startAt: (project.start_at as string) ?? null,
        endAt: (project.end_at as string) ?? null,
        color,
      };
    });

    const taskItems: OverlayItem[] = (tasks ?? []).map((task) => ({
      id: `task-${task.id}`,
      label: task.titre as string,
      kind: "tache",
      date: (task.due_date as string) || (task.start_at as string) || (task.end_at as string),
      startAt: (task.start_at as string) ?? null,
      endAt: (task.end_at as string) ?? null,
      color: task.project_id ? projectColorById.get(task.project_id as string) ?? null : null,
    }));

    const subtaskItems: OverlayItem[] = (
      (subtasks ?? []) as Array<{
        id: string;
        titre: string;
        due_date: string;
        start_at?: string;
        end_at?: string;
        crm_tasks?: { project_id: string } | Array<{ project_id: string }>;
      }>
    ).map((subtask) => {
      const parent = Array.isArray(subtask.crm_tasks) ? subtask.crm_tasks[0] : subtask.crm_tasks;
      const projectId = parent?.project_id;
      return {
        id: `subtask-${subtask.id}`,
        label: subtask.titre,
        kind: "sous-tache",
        date: subtask.due_date || subtask.start_at || subtask.end_at || new Date().toISOString(),
        startAt: subtask.start_at ?? null,
        endAt: subtask.end_at ?? null,
        color: projectId ? projectColorById.get(projectId) ?? null : null,
      };
    });

    setOverlay([...projectItems, ...taskItems, ...subtaskItems].filter((item) => item.date));
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  return { categories, events, overlay, loading, refresh };
};

/** Couleur de secours si aucune catégorie n'existe encore. */
export const fallbackPaletteColor = (index: number) =>
  CALENDAR_PALETTE[index % CALENDAR_PALETTE.length].color;
