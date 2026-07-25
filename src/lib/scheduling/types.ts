/**
 * Types partagés du module Rendez-vous (scheduling).
 * Miroir des tables sql/20260725_scheduling_module.sql.
 */

export type LocationType =
  | "google_meet"
  | "zoom"
  | "teams"
  | "phone"
  | "in_person"
  | "custom";

export type BookingStatus = "pending" | "confirmed" | "cancelled" | "declined";

export type CustomQuestionType = "text" | "textarea" | "select" | "checkbox" | "phone";

export interface CustomQuestion {
  id: string;
  label: string;
  type: CustomQuestionType;
  required: boolean;
  options?: string[]; // pour type 'select'
}

export interface BookingAnswer {
  id: string;
  label: string;
  value: string;
}

export interface SchedulingPage {
  id: string;
  user_id: string;
  username: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  brand_color: string;
  timezone: string;
  is_active: boolean;
}

export interface Schedule {
  id: string;
  user_id: string;
  name: string;
  timezone: string;
  is_default: boolean;
}

export interface ScheduleRule {
  id?: string;
  weekday: number; // ISO 1=lun .. 7=dim
  start_minute: number; // 0..1439, fuseau du planning
  end_minute: number; // 1..1440
}

export interface OverrideRange {
  startMinute: number;
  endMinute: number;
}

export interface DateOverride {
  id?: string;
  date: string; // yyyy-MM-dd
  is_unavailable: boolean;
  ranges: OverrideRange[];
}

export interface EventType {
  id: string;
  user_id: string;
  schedule_id: string | null;
  slug: string;
  title: string;
  description: string | null;
  duration_minutes: number;
  slot_interval_minutes: number | null;
  location_type: LocationType;
  location_details: string | null;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  minimum_notice_minutes: number;
  booking_window_days: number;
  max_bookings_per_day: number | null;
  max_bookings_per_week: number | null;
  requires_confirmation: boolean;
  custom_questions: CustomQuestion[];
  reminder_minutes: number[];
  color: string | null;
  price_cents: number | null;
  currency: string;
  success_redirect_url: string | null;
  is_active: boolean;
  position: number;
}

export interface Booking {
  id: string;
  user_id: string;
  event_type_id: string | null;
  event_title: string;
  location_type: LocationType | string;
  location_text: string | null;
  meeting_url: string | null;
  start_at: string; // ISO UTC
  end_at: string; // ISO UTC
  status: BookingStatus;
  invitee_name: string;
  invitee_email: string;
  invitee_phone: string | null;
  invitee_notes: string | null;
  invitee_timezone: string;
  additional_guests: string[];
  answers: BookingAnswer[];
  manage_token: string;
  contact_id: string | null;
  entreprise_id: number | null;
  opportunite_id: string | null;
  call_id: string | null;
  calendar_event_id: string | null;
  google_event_id: string | null;
  rescheduled_from_id: string | null;
  source: "public" | "embed" | "agent" | "api";
  confirmed_at: string | null;
  cancelled_at: string | null;
  cancelled_by: "invitee" | "host" | null;
  cancellation_reason: string | null;
  created_at: string;
}

/** Intervalle UTC [start, end) en millisecondes epoch. */
export interface BusyInterval {
  start: number;
  end: number;
}

/** Libellés FR des types de lieu (UI + emails). */
export const LOCATION_LABELS: Record<LocationType, string> = {
  google_meet: "Google Meet",
  zoom: "Zoom",
  teams: "Microsoft Teams",
  phone: "Appel téléphonique",
  in_person: "En présentiel",
  custom: "À définir",
};
