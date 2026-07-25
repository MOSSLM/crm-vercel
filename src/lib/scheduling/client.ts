"use client";

/**
 * Wrappers client typés des routes /api/scheduling/* (hôte).
 * Toutes les requêtes passent par authedFetch (bearer Supabase).
 */

import { authedFetch } from "@/utils/authedFetch";
import type {
  Booking,
  DateOverride,
  EventType,
  Schedule,
  ScheduleRule,
  SchedulingPage,
} from "./types";

const jsonOrThrow = async <T>(res: Response): Promise<T> => {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
  return data;
};

export type BookingWithHost = Booking & {
  host?: { full_name: string | null; email: string | null } | null;
};

export const fetchSchedulingPage = () =>
  authedFetch("/api/scheduling/page").then((r) =>
    jsonOrThrow<{ page: SchedulingPage; public_url: string }>(r),
  );

export const patchSchedulingPage = (patch: Partial<SchedulingPage>) =>
  authedFetch("/api/scheduling/page", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  }).then((r) => jsonOrThrow<{ page: SchedulingPage; public_url: string }>(r));

export const fetchEventTypes = () =>
  authedFetch("/api/scheduling/event-types").then((r) =>
    jsonOrThrow<{ event_types: EventType[] }>(r),
  );

export const createEventType = (payload: Record<string, unknown>) =>
  authedFetch("/api/scheduling/event-types", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then((r) => jsonOrThrow<{ event_type: EventType }>(r));

export const patchEventType = (id: string, payload: Record<string, unknown>) =>
  authedFetch(`/api/scheduling/event-types/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then((r) => jsonOrThrow<{ event_type: EventType }>(r));

export const deleteEventType = (id: string) =>
  authedFetch(`/api/scheduling/event-types/${id}`, { method: "DELETE" }).then((r) =>
    jsonOrThrow<{ success: boolean }>(r),
  );

export const fetchSchedule = () =>
  authedFetch("/api/scheduling/schedule").then((r) =>
    jsonOrThrow<{ schedule: Schedule; rules: ScheduleRule[]; overrides: DateOverride[] }>(r),
  );

export const putSchedule = (payload: { timezone?: string; rules: Omit<ScheduleRule, "id">[] }) =>
  authedFetch("/api/scheduling/schedule", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then((r) =>
    jsonOrThrow<{ schedule: Schedule; rules: ScheduleRule[]; overrides: DateOverride[] }>(r),
  );

export const upsertOverride = (payload: {
  date: string;
  is_unavailable: boolean;
  ranges: { startMinute: number; endMinute: number }[];
}) =>
  authedFetch("/api/scheduling/schedule/overrides", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then((r) => jsonOrThrow<{ override: DateOverride }>(r));

export const deleteOverride = (date: string) =>
  authedFetch("/api/scheduling/schedule/overrides", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date }),
  }).then((r) => jsonOrThrow<{ success: boolean }>(r));

export type BookingFilter = "upcoming" | "pending" | "past" | "cancelled";

export const fetchBookings = (filter: BookingFilter, teamWide = false) =>
  authedFetch(
    `/api/scheduling/bookings?filter=${filter}${teamWide ? "&all=1" : ""}`,
  ).then((r) => jsonOrThrow<{ bookings: BookingWithHost[] }>(r));

export const bookingAction = (
  id: string,
  action: "confirm" | "decline" | "cancel" | "reschedule",
  extra: { reason?: string | null; start?: string } = {},
) =>
  authedFetch(`/api/scheduling/bookings/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...extra }),
  }).then((r) => jsonOrThrow<{ booking: Booking }>(r));

export type CalendarConnection = {
  id: string;
  provider: string;
  account_email: string | null;
  write_calendar_id: string;
  busy_calendar_ids: string[];
  sync_enabled: boolean;
  last_error: string | null;
  created_at: string;
};

export const fetchConnections = () =>
  authedFetch("/api/scheduling/connections").then((r) =>
    jsonOrThrow<{ connections: CalendarConnection[]; google_available: boolean }>(r),
  );

export const disconnectConnection = (id: string) =>
  authedFetch(`/api/scheduling/connections?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  }).then((r) => jsonOrThrow<{ success: boolean }>(r));

export const fetchGoogleAuthUrl = () =>
  authedFetch("/api/scheduling/google/start").then((r) => jsonOrThrow<{ url: string }>(r));
