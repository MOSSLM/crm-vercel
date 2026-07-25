/**
 * Helpers partagés des routes /api/scheduling/* (hôte) et
 * /api/public/scheduling/* (invité) : schémas zod, garde de rôle staff,
 * projections publiques (jamais de fuite de tokens ou d'emails d'hôte).
 */

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { jsonError } from "@/app/api/_lib/respond";
import { isValidTimeZone } from "@/lib/scheduling/tz";
import type { EventType, SchedulingPage } from "@/lib/scheduling/types";

// ---------------------------------------------------------------------------
// Garde de rôle : le module scheduling est réservé au staff (admin + agents).
// ---------------------------------------------------------------------------

export type StaffRole = "admin" | "freelance";

export const requireStaff = async (
  sc: SupabaseClient,
  userId: string,
  cors: Record<string, string>,
): Promise<{ ok: true; role: StaffRole } | { ok: false; response: Response }> => {
  const { data, error } = await sc
    .from("user_profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (error) return { ok: false, response: jsonError("profile_lookup_failed", 500, {}, cors) };
  if (!data || (data.role !== "admin" && data.role !== "freelance")) {
    return { ok: false, response: jsonError("forbidden", 403, {}, cors) };
  }
  return { ok: true, role: data.role };
};

// ---------------------------------------------------------------------------
// Schémas zod
// ---------------------------------------------------------------------------

const slugSchema = z
  .string()
  .min(3)
  .max(48)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Slug invalide (minuscules, chiffres, tirets)");

const timezoneSchema = z
  .string()
  .min(1)
  .max(64)
  .refine(isValidTimeZone, "Fuseau horaire IANA invalide");

export const schedulingPagePatchSchema = z.object({
  username: slugSchema.optional(),
  display_name: z.string().min(1).max(120).optional(),
  bio: z.string().max(1000).nullable().optional(),
  avatar_url: z.string().url().max(500).nullable().optional(),
  brand_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  timezone: timezoneSchema.optional(),
  is_active: z.boolean().optional(),
});

const customQuestionSchema = z.object({
  id: z.string().max(40).optional(),
  label: z.string().min(1).max(300),
  type: z.enum(["text", "textarea", "select", "checkbox", "phone"]).default("text"),
  required: z.boolean().default(false),
  options: z.array(z.string().min(1).max(120)).max(20).optional(),
});

export const eventTypeUpsertSchema = z.object({
  slug: slugSchema,
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  duration_minutes: z.number().int().min(5).max(1440),
  slot_interval_minutes: z.number().int().min(5).max(1440).nullable().optional(),
  location_type: z
    .enum(["google_meet", "zoom", "teams", "phone", "in_person", "custom"])
    .default("google_meet"),
  location_details: z.string().max(500).nullable().optional(),
  buffer_before_minutes: z.number().int().min(0).max(720).default(0),
  buffer_after_minutes: z.number().int().min(0).max(720).default(0),
  minimum_notice_minutes: z.number().int().min(0).max(30 * 24 * 60).default(240),
  booking_window_days: z.number().int().min(1).max(730).default(60),
  max_bookings_per_day: z.number().int().min(1).max(100).nullable().optional(),
  max_bookings_per_week: z.number().int().min(1).max(500).nullable().optional(),
  requires_confirmation: z.boolean().default(false),
  custom_questions: z.array(customQuestionSchema).max(15).default([]),
  reminder_minutes: z.array(z.number().int().min(5).max(30 * 24 * 60)).max(5).default([1440, 60]),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
  price_cents: z.number().int().min(0).max(10_000_000).nullable().optional(),
  currency: z.string().length(3).default("eur"),
  success_redirect_url: z.string().url().max(500).nullable().optional(),
  is_active: z.boolean().default(true),
  position: z.number().int().min(0).max(10_000).default(100),
  schedule_id: z.string().uuid().nullable().optional(),
});

export const eventTypePatchSchema = eventTypeUpsertSchema.partial();

const ruleSchema = z
  .object({
    weekday: z.number().int().min(1).max(7),
    start_minute: z.number().int().min(0).max(1439),
    end_minute: z.number().int().min(1).max(1440),
  })
  .refine((r) => r.end_minute > r.start_minute, "end_minute doit être > start_minute");

export const schedulePutSchema = z.object({
  timezone: timezoneSchema.optional(),
  rules: z.array(ruleSchema).max(50),
});

export const overrideUpsertSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  is_unavailable: z.boolean().default(false),
  ranges: z
    .array(
      z
        .object({
          startMinute: z.number().int().min(0).max(1439),
          endMinute: z.number().int().min(1).max(1440),
        })
        .refine((r) => r.endMinute > r.startMinute),
    )
    .max(10)
    .default([]),
});

export const bookingActionSchema = z.object({
  action: z.enum(["confirm", "decline", "cancel", "reschedule"]),
  reason: z.string().max(1000).nullable().optional(),
  /** Pour reschedule : nouveau début ISO UTC. */
  start: z.string().datetime({ offset: true }).optional(),
});

/** Création d'un booking par l'hôte (cockpit d'appel, admin) — source 'agent'. */
export const hostBookingCreateSchema = z.object({
  event_type_id: z.string().uuid(),
  start: z.string().datetime({ offset: true }),
  name: z.string().min(1).max(160),
  email: z.string().email().max(254),
  phone: z.string().max(40).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  timezone: timezoneSchema.optional(),
  call_id: z.string().uuid().nullable().optional(),
  opportunite_id: z.string().uuid().nullable().optional(),
});

export const publicBookingCreateSchema = z.object({
  username: slugSchema,
  event_slug: slugSchema,
  start: z.string().datetime({ offset: true }),
  timezone: timezoneSchema,
  name: z.string().min(1).max(160),
  email: z.string().email().max(254),
  phone: z.string().max(40).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  answers: z
    .array(z.object({ id: z.string().max(40), value: z.string().max(2000) }))
    .max(15)
    .default([]),
  guests: z.array(z.string().email().max(254)).max(5).default([]),
  source: z.enum(["public", "embed"]).default("public"),
});

export const publicRescheduleSchema = z.object({
  start: z.string().datetime({ offset: true }),
  timezone: timezoneSchema.optional(),
});

export const publicCancelSchema = z.object({
  reason: z.string().max(1000).nullable().optional(),
});

// ---------------------------------------------------------------------------
// Projections publiques (côté invité)
// ---------------------------------------------------------------------------

export const publicPageProjection = (page: SchedulingPage) => ({
  username: page.username,
  display_name: page.display_name,
  bio: page.bio,
  avatar_url: page.avatar_url,
  brand_color: page.brand_color,
  timezone: page.timezone,
});

export const publicEventTypeProjection = (et: EventType) => ({
  slug: et.slug,
  title: et.title,
  description: et.description,
  duration_minutes: et.duration_minutes,
  location_type: et.location_type,
  // location_details volontairement omis : l'adresse/lien exact n'est révélé
  // qu'après réservation (email + page de confirmation).
  requires_confirmation: et.requires_confirmation,
  custom_questions: et.custom_questions ?? [],
  color: et.color,
  price_cents: et.price_cents,
  currency: et.currency,
  success_redirect_url: et.success_redirect_url,
  minimum_notice_minutes: et.minimum_notice_minutes,
  booking_window_days: et.booking_window_days,
});

/** Vue invité d'un booking (page de gestion par token). */
export const publicBookingProjection = (b: {
  id: string;
  event_title: string;
  location_type: string;
  location_text: string | null;
  meeting_url: string | null;
  start_at: string;
  end_at: string;
  status: string;
  invitee_name: string;
  invitee_email: string;
  invitee_timezone: string;
  manage_token: string;
  cancellation_reason: string | null;
}) => ({
  id: b.id,
  event_title: b.event_title,
  location_type: b.location_type,
  location_text: b.location_text,
  meeting_url: b.meeting_url,
  start_at: b.start_at,
  end_at: b.end_at,
  status: b.status,
  invitee_name: b.invitee_name,
  invitee_email: b.invitee_email,
  invitee_timezone: b.invitee_timezone,
  manage_token: b.manage_token,
  cancellation_reason: b.cancellation_reason,
});
