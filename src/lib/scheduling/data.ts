/**
 * Accès données du module Rendez-vous — helpers serveur (service-role).
 * Utilisés par les routes /api/scheduling/* (hôte) et /api/public/scheduling/*
 * (invité). Aucune de ces fonctions ne vérifie l'auth : c'est le rôle des
 * routes appelantes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { expandOccurrences, type CalendarEventModel } from "@/lib/recurrence";
import { computeAvailableSlots, mergeIntervals } from "./slots";
import { getGoogleBusy, getGoogleConnection } from "./google-calendar";
import type {
  BusyInterval,
  CustomQuestion,
  DateOverride,
  EventType,
  Schedule,
  ScheduleRule,
  SchedulingPage,
} from "./types";

export const EVENT_TYPE_COLUMNS =
  "id, user_id, schedule_id, slug, title, description, duration_minutes, slot_interval_minutes, " +
  "location_type, location_details, buffer_before_minutes, buffer_after_minutes, " +
  "minimum_notice_minutes, booking_window_days, max_bookings_per_day, max_bookings_per_week, " +
  "requires_confirmation, custom_questions, reminder_minutes, color, price_cents, currency, " +
  "success_redirect_url, is_active, position";

export const BOOKING_COLUMNS =
  "id, user_id, event_type_id, event_title, location_type, location_text, meeting_url, " +
  "start_at, end_at, status, invitee_name, invitee_email, invitee_phone, invitee_notes, " +
  "invitee_timezone, additional_guests, answers, manage_token, contact_id, entreprise_id, " +
  "opportunite_id, call_id, calendar_event_id, google_event_id, rescheduled_from_id, source, " +
  "confirmed_at, cancelled_at, cancelled_by, cancellation_reason, created_at";

/** Slug sûr à partir d'un email/nom : « jean.dupont@x.fr » → « jean-dupont ». */
export const slugify = (raw: string): string =>
  raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/@.*$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "mon-agenda";

/** Règles par défaut d'un nouveau planning : lun–ven 9h–12h / 14h–18h. */
const DEFAULT_RULES: Omit<ScheduleRule, "id">[] = [1, 2, 3, 4, 5].flatMap((weekday) => [
  { weekday, start_minute: 9 * 60, end_minute: 12 * 60 },
  { weekday, start_minute: 14 * 60, end_minute: 18 * 60 },
]);

/**
 * Page + planning + type d'évènement par défaut d'un hôte, créés au premier
 * accès (onboarding zéro-clic : le lien /rdv/{username} marche immédiatement).
 */
export async function ensureHostSetup(
  sc: SupabaseClient,
  userId: string,
): Promise<SchedulingPage> {
  const { data: existing } = await sc
    .from("scheduling_pages")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) return existing as SchedulingPage;

  const { data: profile } = await sc
    .from("user_profiles")
    .select("email, full_name, prenom, nom")
    .eq("id", userId)
    .maybeSingle();

  const displayName =
    (profile?.full_name as string) ||
    [profile?.prenom, profile?.nom].filter(Boolean).join(" ") ||
    (profile?.email as string) ||
    "Mon agenda";

  // Username unique : slug de base, puis suffixes -2, -3… si déjà pris.
  const base = slugify((profile?.full_name as string) || (profile?.email as string) || userId);
  let username = base;
  for (let i = 2; i <= 30; i++) {
    const { data: taken } = await sc
      .from("scheduling_pages")
      .select("id")
      .ilike("username", username)
      .maybeSingle();
    if (!taken) break;
    username = `${base}-${i}`;
  }

  const { data: page, error: pageError } = await sc
    .from("scheduling_pages")
    .insert({ user_id: userId, username, display_name: displayName })
    .select("*")
    .single();
  if (pageError) {
    // Course entre deux requêtes simultanées : l'autre a créé la page.
    const { data: raced } = await sc
      .from("scheduling_pages")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (raced) return raced as SchedulingPage;
    throw pageError;
  }

  const { data: schedule } = await sc
    .from("scheduling_schedules")
    .insert({ user_id: userId, name: "Horaires de travail", is_default: true })
    .select("id")
    .single();

  if (schedule) {
    await sc
      .from("scheduling_schedule_rules")
      .insert(DEFAULT_RULES.map((r) => ({ ...r, schedule_id: schedule.id })));
  }

  // Un premier type d'évènement pour que la page ne soit jamais vide.
  await sc.from("scheduling_event_types").insert({
    user_id: userId,
    schedule_id: schedule?.id ?? null,
    slug: "appel-30min",
    title: "Appel de 30 minutes",
    description: "Un échange rapide en visio pour faire connaissance.",
    duration_minutes: 30,
    location_type: "google_meet",
  });

  return page as SchedulingPage;
}

/** Page publique active par username (insensible à la casse). */
export async function getPageByUsername(
  sc: SupabaseClient,
  username: string,
): Promise<SchedulingPage | null> {
  const { data } = await sc
    .from("scheduling_pages")
    .select("*")
    .ilike("username", username)
    .eq("is_active", true)
    .maybeSingle();
  return (data as SchedulingPage | null) ?? null;
}

export interface ScheduleBundle {
  schedule: Schedule;
  rules: ScheduleRule[];
  overrides: DateOverride[];
}

/** Planning effectif d'un type d'évènement (le sien, sinon celui par défaut). */
export async function getScheduleBundle(
  sc: SupabaseClient,
  userId: string,
  scheduleId: string | null,
): Promise<ScheduleBundle | null> {
  let schedule: Schedule | null = null;
  if (scheduleId) {
    const { data } = await sc
      .from("scheduling_schedules")
      .select("*")
      .eq("id", scheduleId)
      .maybeSingle();
    schedule = data as Schedule | null;
  }
  if (!schedule) {
    const { data } = await sc
      .from("scheduling_schedules")
      .select("*")
      .eq("user_id", userId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    schedule = data as Schedule | null;
  }
  if (!schedule) return null;

  const [{ data: rules }, { data: overrides }] = await Promise.all([
    sc
      .from("scheduling_schedule_rules")
      .select("id, weekday, start_minute, end_minute")
      .eq("schedule_id", schedule.id),
    sc
      .from("scheduling_date_overrides")
      .select("id, date, is_unavailable, ranges")
      .eq("schedule_id", schedule.id),
  ]);

  return {
    schedule,
    rules: (rules ?? []) as ScheduleRule[],
    overrides: ((overrides ?? []) as DateOverride[]).map((o) => ({
      ...o,
      ranges: Array.isArray(o.ranges) ? o.ranges : [],
    })),
  };
}

/**
 * Intervalles occupés de l'hôte sur [fromUtc, toUtc] :
 *   bookings actifs (tous types) + calendrier CRM (récurrences développées)
 *   + agendas Google connectés. `excludeBookingId` sert à la reprogrammation.
 */
export async function collectBusy(
  sc: SupabaseClient,
  userId: string,
  fromUtc: Date,
  toUtc: Date,
  opts: { excludeBookingId?: string } = {},
): Promise<BusyInterval[]> {
  const fromIso = fromUtc.toISOString();
  const toIso = toUtc.toISOString();
  const busy: BusyInterval[] = [];

  // 1) Bookings actifs du module (le GiST reste le verrou final).
  let bookingQuery = sc
    .from("scheduling_bookings")
    .select("id, start_at, end_at")
    .eq("user_id", userId)
    .in("status", ["pending", "confirmed"])
    .lt("start_at", toIso)
    .gt("end_at", fromIso);
  if (opts.excludeBookingId) bookingQuery = bookingQuery.neq("id", opts.excludeBookingId);
  const { data: bookings } = await bookingQuery;
  for (const b of bookings ?? []) {
    busy.push({ start: Date.parse(b.start_at), end: Date.parse(b.end_at) });
  }

  // 2) Calendrier CRM : évènements assignés à l'hôte ou créés par lui,
  //    y compris récurrents (développés via le moteur existant).
  const { data: events } = await sc
    .from("crm_calendar_events")
    .select(
      "id, title, all_day, start_at, end_at, recurrence_freq, recurrence_interval, recurrence_weekdays, recurrence_until, recurrence_exceptions, assigned_to, created_by",
    )
    .or(`assigned_to.eq.${userId},created_by.eq.${userId}`)
    .lte("start_at", toIso)
    .or(`end_at.gte.${fromIso},recurrence_freq.neq.none`);

  for (const ev of events ?? []) {
    const model: CalendarEventModel = {
      id: ev.id,
      title: ev.title ?? "",
      color: "#000000",
      allDay: !!ev.all_day,
      startAt: ev.start_at,
      endAt: ev.end_at,
      rule: {
        freq: (ev.recurrence_freq ?? "none") as CalendarEventModel["rule"]["freq"],
        interval: ev.recurrence_interval ?? 1,
        weekdays: ev.recurrence_weekdays ?? undefined,
        until: ev.recurrence_until,
        exceptions: ev.recurrence_exceptions ?? [],
      },
    };
    for (const occ of expandOccurrences(model, fromUtc, toUtc)) {
      busy.push({ start: occ.start.getTime(), end: occ.end.getTime() });
    }
  }

  // 3) Agenda(s) Google connectés — best-effort (last_error visible côté UI).
  try {
    const conn = await getGoogleConnection(sc, userId);
    if (conn) busy.push(...(await getGoogleBusy(sc, conn, fromUtc, toUtc)));
  } catch (err) {
    console.error("[scheduling/data] google busy error:", err);
  }

  return mergeIntervals(busy);
}

/** Débuts des bookings actifs de CE type d'évènement (limites jour/semaine). */
export async function getActiveBookingStarts(
  sc: SupabaseClient,
  eventTypeId: string,
  aroundFrom: Date,
  aroundTo: Date,
  excludeBookingId?: string,
): Promise<string[]> {
  // Marge d'une semaine de chaque côté pour les limites hebdomadaires.
  const from = new Date(aroundFrom.getTime() - 8 * 24 * 3600 * 1000).toISOString();
  const to = new Date(aroundTo.getTime() + 8 * 24 * 3600 * 1000).toISOString();
  let q = sc
    .from("scheduling_bookings")
    .select("id, start_at")
    .eq("event_type_id", eventTypeId)
    .in("status", ["pending", "confirmed"])
    .gte("start_at", from)
    .lte("start_at", to);
  if (excludeBookingId) q = q.neq("id", excludeBookingId);
  const { data } = await q;
  return (data ?? []).map((b) => b.start_at as string);
}

export interface SlotQueryResult {
  timezone: string; // fuseau du planning
  slots: Date[];
}

/** Créneaux disponibles d'un type d'évènement sur une fenêtre UTC. */
export async function getAvailableSlots(
  sc: SupabaseClient,
  eventType: EventType,
  fromUtc: Date,
  toUtc: Date,
  opts: { excludeBookingId?: string; now?: Date } = {},
): Promise<SlotQueryResult | null> {
  const bundle = await getScheduleBundle(sc, eventType.user_id, eventType.schedule_id);
  if (!bundle) return null;

  const [busy, activeStarts] = await Promise.all([
    collectBusy(sc, eventType.user_id, fromUtc, toUtc, {
      excludeBookingId: opts.excludeBookingId,
    }),
    eventType.max_bookings_per_day != null || eventType.max_bookings_per_week != null
      ? getActiveBookingStarts(sc, eventType.id, fromUtc, toUtc, opts.excludeBookingId)
      : Promise.resolve([]),
  ]);

  const slots = computeAvailableSlots({
    eventType,
    timezone: bundle.schedule.timezone,
    rules: bundle.rules,
    overrides: bundle.overrides,
    busy,
    activeBookingStarts: activeStarts,
    fromUtc,
    toUtc,
    now: opts.now,
  });

  return { timezone: bundle.schedule.timezone, slots };
}

/** Nettoie les questions custom envoyées par le builder (ids stables, types sûrs). */
export const sanitizeCustomQuestions = (raw: unknown): CustomQuestion[] => {
  if (!Array.isArray(raw)) return [];
  const out: CustomQuestion[] = [];
  for (const [i, item] of raw.entries()) {
    if (!item || typeof item !== "object") continue;
    const q = item as Record<string, unknown>;
    const label = typeof q.label === "string" ? q.label.trim().slice(0, 300) : "";
    if (!label) continue;
    const type = ["text", "textarea", "select", "checkbox", "phone"].includes(q.type as string)
      ? (q.type as CustomQuestion["type"])
      : "text";
    out.push({
      id: typeof q.id === "string" && q.id ? q.id.slice(0, 40) : `q${i + 1}`,
      label,
      type,
      required: q.required === true,
      options:
        type === "select" && Array.isArray(q.options)
          ? q.options
              .filter((o): o is string => typeof o === "string" && !!o.trim())
              .map((o) => o.trim().slice(0, 120))
              .slice(0, 20)
          : undefined,
    });
    if (out.length >= 15) break;
  }
  return out;
};
