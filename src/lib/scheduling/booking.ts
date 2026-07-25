/**
 * Cycle de vie d'un booking — création, confirmation, refus, annulation,
 * reprogrammation — avec tous les effets de bord :
 *   emails (invité + hôte, .ics joint), évènement dans le calendrier CRM,
 *   évènement Google (+ lien Meet), rappels programmés, liaison contact CRM.
 *
 * Le verrou anti double-booking est la contrainte d'exclusion GiST : toute
 * insertion en conflit remonte le code Postgres 23P01, traduit ici en
 * { error: "slot_taken" }.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAppUrl } from "@/lib/app-url";
import {
  BOOKING_COLUMNS,
  getAvailableSlots,
} from "./data";
import {
  cancelledEmail,
  confirmedHostEmail,
  confirmedInviteeEmail,
  declinedInviteeEmail,
  pendingHostEmail,
  pendingInviteeEmail,
  rescheduledEmail,
  sendSchedulingEmail,
  type BookingEmailContext,
} from "./emails";
import {
  deleteGoogleEvent,
  getGoogleConnection,
  insertGoogleEvent,
} from "./google-calendar";
import { generateManageToken } from "./tokens";
import type { Booking, BookingAnswer, EventType, LocationType, SchedulingPage } from "./types";
import { LOCATION_LABELS } from "./types";

const EXCLUSION_VIOLATION = "23P01";

export type HostProfile = {
  id: string;
  email: string | null;
  name: string;
  role: "admin" | "freelance" | string;
};

export async function getHostProfile(sc: SupabaseClient, userId: string): Promise<HostProfile> {
  const { data } = await sc
    .from("user_profiles")
    .select("id, email, full_name, prenom, nom, role")
    .eq("id", userId)
    .maybeSingle();
  return {
    id: userId,
    email: (data?.email as string) ?? null,
    name:
      (data?.full_name as string) ||
      [data?.prenom, data?.nom].filter(Boolean).join(" ") ||
      (data?.email as string) ||
      "Votre hôte",
    role: (data?.role as string) ?? "admin",
  };
}

/** URLs publiques/CRM d'un booking. */
export const bookingUrls = (booking: { manage_token: string }) => ({
  manageUrl: `${getAppUrl()}/rdv/gerer/${booking.manage_token}`,
  dashboardUrl: `${getAppUrl()}/rendez-vous`,
});

const toEmailContext = (
  booking: Booking,
  eventType: { duration_minutes: number } | null,
  host: HostProfile,
  hostTimezone: string,
): BookingEmailContext => {
  const start = new Date(booking.start_at);
  const end = new Date(booking.end_at);
  const { manageUrl, dashboardUrl } = bookingUrls(booking);
  return {
    bookingId: booking.id,
    eventTitle: booking.event_title,
    durationMinutes:
      eventType?.duration_minutes ?? Math.round((end.getTime() - start.getTime()) / 60000),
    startUtc: start,
    endUtc: end,
    locationType: booking.location_type,
    locationText: booking.location_text,
    meetingUrl: booking.meeting_url,
    host: { name: host.name, email: host.email },
    invitee: {
      name: booking.invitee_name,
      email: booking.invitee_email,
      timezone: booking.invitee_timezone,
      phone: booking.invitee_phone,
      notes: booking.invitee_notes,
    },
    hostTimezone,
    answers: (booking.answers ?? []).map((a) => ({ label: a.label, value: a.value })),
    additionalGuests: booking.additional_guests ?? [],
    manageUrl,
    dashboardUrl,
    contactId: booking.contact_id,
    entrepriseId: booking.entreprise_id,
  };
};

/** Retrouve un contact CRM par email (et son entreprise). Best-effort. */
async function matchContactByEmail(
  sc: SupabaseClient,
  email: string,
): Promise<{ contactId: string | null; entrepriseId: number | null }> {
  try {
    const { data } = await sc
      .from("contacts")
      .select("id, entreprise_id")
      .ilike("email", email)
      .limit(1)
      .maybeSingle();
    if (data) {
      return {
        contactId: data.id as string,
        entrepriseId: (data.entreprise_id as number) ?? null,
      };
    }
  } catch {
    // Table contacts indisponible → on continue sans liaison.
  }
  return { contactId: null, entrepriseId: null };
}

/** Catégorie « Rendez-vous » du calendrier CRM (créée au premier usage). */
async function ensureCalendarCategory(sc: SupabaseClient): Promise<string | null> {
  try {
    const { data: existing } = await sc
      .from("crm_calendar_categories")
      .select("id")
      .eq("nom", "Rendez-vous")
      .limit(1)
      .maybeSingle();
    if (existing) return existing.id as string;
    const { data: created } = await sc
      .from("crm_calendar_categories")
      .insert({ nom: "Rendez-vous", color: "#E2552B", position: 40 })
      .select("id")
      .single();
    return (created?.id as string) ?? null;
  } catch {
    return null;
  }
}

/** Crée l'évènement lié dans le calendrier CRM (visible dans /calendar et téléphonie). */
async function createCrmCalendarEvent(
  sc: SupabaseClient,
  booking: Booking,
  host: HostProfile,
): Promise<string | null> {
  try {
    const categoryId = await ensureCalendarCategory(sc);
    const { data } = await sc
      .from("crm_calendar_events")
      .insert({
        title: `RDV : ${booking.event_title} — ${booking.invitee_name}`,
        description:
          `Réservé en ligne (${booking.invitee_email})` +
          (booking.meeting_url ? `\nVisio : ${booking.meeting_url}` : "") +
          (booking.location_text ? `\nLieu : ${booking.location_text}` : ""),
        category_id: categoryId,
        start_at: booking.start_at,
        end_at: booking.end_at,
        created_by: host.id,
        assigned_to: host.id,
        created_for_role: host.role === "freelance" ? "freelance" : "admin",
        contact_id: booking.contact_id,
        entreprise_id: booking.entreprise_id,
        call_id: booking.call_id,
      })
      .select("id")
      .single();
    return (data?.id as string) ?? null;
  } catch (err) {
    console.error("[scheduling/booking] crm calendar sync error:", err);
    return null;
  }
}

/** Programme les rappels email (uniquement pour un booking confirmé). */
async function scheduleReminders(
  sc: SupabaseClient,
  booking: Booking,
  reminderMinutes: number[],
): Promise<void> {
  const startMs = Date.parse(booking.start_at);
  const rows = [...new Set(reminderMinutes)]
    .filter((m) => Number.isFinite(m) && m > 0 && m <= 30 * 24 * 60)
    .map((m) => ({
      booking_id: booking.id,
      send_at: new Date(startMs - m * 60000).toISOString(),
      recipient: "both" as const,
    }))
    .filter((r) => Date.parse(r.send_at) > Date.now() + 60_000);
  if (rows.length) await sc.from("scheduling_booking_reminders").insert(rows);
}

async function cancelReminders(sc: SupabaseClient, bookingId: string): Promise<void> {
  await sc
    .from("scheduling_booking_reminders")
    .update({ status: "cancelled" })
    .eq("booking_id", bookingId)
    .eq("status", "pending");
}

/**
 * Résout le lieu du booking : texte affiché + URL visio éventuelle.
 * Le lien Google Meet réel est créé plus tard (évènement Google) s'il y a une
 * connexion agenda ; sinon on retombe sur location_details.
 */
const resolveLocation = (
  eventType: EventType,
  inviteePhone: string | null,
): { locationText: string | null; meetingUrl: string | null } => {
  const details = eventType.location_details?.trim() || null;
  const isUrl = !!details && /^https?:\/\//i.test(details);
  switch (eventType.location_type) {
    case "google_meet":
      return { locationText: null, meetingUrl: isUrl ? details : null };
    case "zoom":
    case "teams":
      return { locationText: isUrl ? null : details, meetingUrl: isUrl ? details : null };
    case "phone":
      return {
        locationText: inviteePhone
          ? `${LOCATION_LABELS.phone} — vous serez appelé au ${inviteePhone}`
          : LOCATION_LABELS.phone,
        meetingUrl: null,
      };
    case "in_person":
    case "custom":
    default:
      return { locationText: details, meetingUrl: isUrl ? details : null };
  }
};

/** Effets de bord d'une confirmation : Google (+Meet), calendrier CRM, rappels. */
async function applyConfirmationSideEffects(
  sc: SupabaseClient,
  booking: Booking,
  eventType: EventType | null,
  host: HostProfile,
): Promise<Booking> {
  let meetingUrl = booking.meeting_url;
  let googleEventId: string | null = booking.google_event_id;

  try {
    const conn = await getGoogleConnection(sc, host.id);
    if (conn) {
      const created = await insertGoogleEvent(sc, conn, {
        summary: `${booking.event_title} — ${booking.invitee_name}`,
        description:
          `Réservé via la page de rendez-vous.` +
          `\nInvité : ${booking.invitee_name} (${booking.invitee_email})` +
          (booking.invitee_phone ? `\nTéléphone : ${booking.invitee_phone}` : ""),
        startUtc: new Date(booking.start_at),
        endUtc: new Date(booking.end_at),
        attendees: [{ email: booking.invitee_email, displayName: booking.invitee_name }],
        withMeet: booking.location_type === "google_meet" && !meetingUrl,
        location: booking.location_text ?? undefined,
      });
      if (created) {
        googleEventId = created.id;
        if (!meetingUrl && created.meetUrl) meetingUrl = created.meetUrl;
      }
    }
  } catch (err) {
    console.error("[scheduling/booking] google event error:", err);
  }

  const updated: Booking = { ...booking, meeting_url: meetingUrl, google_event_id: googleEventId };
  const calendarEventId = await createCrmCalendarEvent(sc, updated, host);

  await sc
    .from("scheduling_bookings")
    .update({
      meeting_url: meetingUrl,
      google_event_id: googleEventId,
      calendar_event_id: calendarEventId,
      confirmed_at: updated.confirmed_at ?? new Date().toISOString(),
    })
    .eq("id", booking.id);

  if (eventType) await scheduleReminders(sc, updated, eventType.reminder_minutes ?? []);

  return { ...updated, calendar_event_id: calendarEventId };
}

export interface CreateBookingParams {
  page: SchedulingPage;
  eventType: EventType;
  startUtc: Date;
  invitee: {
    name: string;
    email: string;
    phone?: string | null;
    notes?: string | null;
    timezone: string;
  };
  answers: BookingAnswer[];
  additionalGuests: string[];
  source: "public" | "embed" | "agent" | "api";
  callId?: string | null;
  opportuniteId?: string | null;
}

export type CreateBookingResult =
  | { ok: true; booking: Booking }
  | { ok: false; error: "slot_taken" | "slot_unavailable" | "db_error"; detail?: string };

/**
 * Création d'un booking : re-vérifie la dispo côté serveur, insère (la
 * contrainte GiST tranche les courses), puis déroule emails + intégrations.
 */
export async function createBooking(
  sc: SupabaseClient,
  params: CreateBookingParams,
): Promise<CreateBookingResult> {
  const { eventType, page, startUtc } = params;
  const endUtc = new Date(startUtc.getTime() + eventType.duration_minutes * 60000);

  // 1) Le créneau demandé est-il encore proposé ? (règles + busy + limites)
  const slotCheck = await getAvailableSlots(
    sc,
    eventType,
    new Date(startUtc.getTime() - 24 * 3600 * 1000),
    new Date(endUtc.getTime() + 24 * 3600 * 1000),
  );
  const offered = slotCheck?.slots.some((s) => s.getTime() === startUtc.getTime()) ?? false;
  if (!offered) return { ok: false, error: "slot_unavailable" };

  // 2) Liaison contact CRM par email.
  const { contactId, entrepriseId } = await matchContactByEmail(sc, params.invitee.email);

  const { locationText, meetingUrl } = resolveLocation(
    eventType,
    params.invitee.phone ?? null,
  );

  const status = eventType.requires_confirmation ? "pending" : "confirmed";

  // 3) Insertion — le GiST rejette les chevauchements concurrents (23P01).
  const { data: inserted, error: insertError } = await sc
    .from("scheduling_bookings")
    .insert({
      user_id: eventType.user_id,
      event_type_id: eventType.id,
      event_title: eventType.title,
      location_type: eventType.location_type,
      location_text: locationText,
      meeting_url: meetingUrl,
      start_at: startUtc.toISOString(),
      end_at: endUtc.toISOString(),
      status,
      invitee_name: params.invitee.name,
      invitee_email: params.invitee.email.toLowerCase(),
      invitee_phone: params.invitee.phone ?? null,
      invitee_notes: params.invitee.notes ?? null,
      invitee_timezone: params.invitee.timezone,
      additional_guests: params.additionalGuests,
      answers: params.answers,
      manage_token: generateManageToken(),
      contact_id: contactId,
      entreprise_id: entrepriseId,
      opportunite_id: params.opportuniteId ?? null,
      call_id: params.callId ?? null,
      source: params.source,
      confirmed_at: status === "confirmed" ? new Date().toISOString() : null,
    })
    .select(BOOKING_COLUMNS)
    .single();

  if (insertError) {
    if (insertError.code === EXCLUSION_VIOLATION) return { ok: false, error: "slot_taken" };
    console.error("[scheduling/booking] insert error:", insertError);
    return { ok: false, error: "db_error", detail: insertError.message };
  }

  let booking = inserted as unknown as Booking;
  const host = await getHostProfile(sc, eventType.user_id);

  // 4) Effets de bord + emails (best-effort, jamais bloquants).
  if (status === "confirmed") {
    booking = await applyConfirmationSideEffects(sc, booking, eventType, host);
    const ctx = toEmailContext(booking, eventType, host, page.timezone);
    await Promise.all([
      sendSchedulingEmail(confirmedInviteeEmail(ctx), {
        contactId: booking.contact_id,
        entrepriseId: booking.entreprise_id,
      }),
      sendSchedulingEmail(confirmedHostEmail(ctx), {
        contactId: booking.contact_id,
        entrepriseId: booking.entreprise_id,
      }),
    ]);
  } else {
    const ctx = toEmailContext(booking, eventType, host, page.timezone);
    await Promise.all([
      sendSchedulingEmail(pendingInviteeEmail(ctx), {
        contactId: booking.contact_id,
        entrepriseId: booking.entreprise_id,
      }),
      sendSchedulingEmail(pendingHostEmail(ctx), {
        contactId: booking.contact_id,
        entrepriseId: booking.entreprise_id,
      }),
    ]);
  }

  return { ok: true, booking };
}

const loadEventType = async (
  sc: SupabaseClient,
  eventTypeId: string | null,
): Promise<EventType | null> => {
  if (!eventTypeId) return null;
  const { data } = await sc
    .from("scheduling_event_types")
    .select("*")
    .eq("id", eventTypeId)
    .maybeSingle();
  return (data as EventType | null) ?? null;
};

const hostTimezoneOf = async (sc: SupabaseClient, userId: string): Promise<string> => {
  const { data } = await sc
    .from("scheduling_pages")
    .select("timezone")
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.timezone as string) ?? "Europe/Paris";
};

/** Nettoyage des artefacts externes d'un booking (Google + calendrier CRM). */
async function removeExternalArtifacts(sc: SupabaseClient, booking: Booking): Promise<void> {
  await cancelReminders(sc, booking.id);
  if (booking.calendar_event_id) {
    await sc.from("crm_calendar_events").delete().eq("id", booking.calendar_event_id);
  }
  if (booking.google_event_id) {
    try {
      const conn = await getGoogleConnection(sc, booking.user_id);
      if (conn) await deleteGoogleEvent(sc, conn, booking.google_event_id);
    } catch (err) {
      console.error("[scheduling/booking] google delete error:", err);
    }
  }
}

export type SimpleResult = { ok: true; booking: Booking } | { ok: false; error: string };

/** Annulation par l'invité (token) ou par l'hôte (dashboard). */
export async function cancelBooking(
  sc: SupabaseClient,
  booking: Booking,
  by: "invitee" | "host",
  reason?: string | null,
): Promise<SimpleResult> {
  if (booking.status !== "pending" && booking.status !== "confirmed") {
    return { ok: false, error: "booking_not_active" };
  }
  const { data: updated, error } = await sc
    .from("scheduling_bookings")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by: by,
      cancellation_reason: reason ?? null,
    })
    .eq("id", booking.id)
    .in("status", ["pending", "confirmed"])
    .select(BOOKING_COLUMNS)
    .single();
  if (error || !updated) return { ok: false, error: error?.message ?? "not_found" };

  const fresh = updated as unknown as Booking;
  await removeExternalArtifacts(sc, fresh);

  const host = await getHostProfile(sc, fresh.user_id);
  const hostTz = await hostTimezoneOf(sc, fresh.user_id);
  const ctx = { ...toEmailContext(fresh, null, host, hostTz), icsSequence: 1 };
  await Promise.all([
    sendSchedulingEmail(cancelledEmail(ctx, "invitee", by, reason), {
      contactId: fresh.contact_id,
      entrepriseId: fresh.entreprise_id,
    }),
    sendSchedulingEmail(cancelledEmail(ctx, "host", by, reason), {
      contactId: fresh.contact_id,
      entrepriseId: fresh.entreprise_id,
    }),
  ]);
  return { ok: true, booking: fresh };
}

/** Confirmation manuelle d'une demande en attente (hôte). */
export async function confirmBooking(
  sc: SupabaseClient,
  booking: Booking,
): Promise<SimpleResult> {
  if (booking.status !== "pending") return { ok: false, error: "booking_not_pending" };
  const { data: updated, error } = await sc
    .from("scheduling_bookings")
    .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
    .eq("id", booking.id)
    .eq("status", "pending")
    .select(BOOKING_COLUMNS)
    .single();
  if (error || !updated) return { ok: false, error: error?.message ?? "not_found" };

  let fresh = updated as unknown as Booking;
  const eventType = await loadEventType(sc, fresh.event_type_id);
  const host = await getHostProfile(sc, fresh.user_id);
  const hostTz = await hostTimezoneOf(sc, fresh.user_id);

  fresh = await applyConfirmationSideEffects(sc, fresh, eventType, host);
  const ctx = toEmailContext(fresh, eventType, host, hostTz);
  await Promise.all([
    sendSchedulingEmail(confirmedInviteeEmail(ctx), {
      contactId: fresh.contact_id,
      entrepriseId: fresh.entreprise_id,
    }),
    sendSchedulingEmail(confirmedHostEmail(ctx), {
      contactId: fresh.contact_id,
      entrepriseId: fresh.entreprise_id,
    }),
  ]);
  return { ok: true, booking: fresh };
}

/** Refus d'une demande en attente (hôte). */
export async function declineBooking(
  sc: SupabaseClient,
  booking: Booking,
  reason?: string | null,
): Promise<SimpleResult> {
  if (booking.status !== "pending") return { ok: false, error: "booking_not_pending" };
  const { data: updated, error } = await sc
    .from("scheduling_bookings")
    .update({
      status: "declined",
      cancelled_at: new Date().toISOString(),
      cancelled_by: "host",
      cancellation_reason: reason ?? null,
    })
    .eq("id", booking.id)
    .eq("status", "pending")
    .select(BOOKING_COLUMNS)
    .single();
  if (error || !updated) return { ok: false, error: error?.message ?? "not_found" };

  const fresh = updated as unknown as Booking;
  await cancelReminders(sc, fresh.id);
  const host = await getHostProfile(sc, fresh.user_id);
  const hostTz = await hostTimezoneOf(sc, fresh.user_id);
  const ctx = toEmailContext(fresh, null, host, hostTz);
  await sendSchedulingEmail(declinedInviteeEmail(ctx, reason), {
    contactId: fresh.contact_id,
    entrepriseId: fresh.entreprise_id,
  });
  return { ok: true, booking: fresh };
}

export type RescheduleResult =
  | { ok: true; booking: Booking }
  | { ok: false; error: "slot_taken" | "slot_unavailable" | "booking_not_active" | "db_error" };

/**
 * Reprogrammation : nouveau créneau validé côté serveur (en excluant le
 * booking lui-même du busy), puis bascule ATOMIQUE via la RPC
 * scheduling_reschedule_booking — l'ancien reste actif si le nouveau échoue.
 */
export async function rescheduleBooking(
  sc: SupabaseClient,
  booking: Booking,
  newStartUtc: Date,
  by: "invitee" | "host",
): Promise<RescheduleResult> {
  if (booking.status !== "pending" && booking.status !== "confirmed") {
    return { ok: false, error: "booking_not_active" };
  }
  const eventType = await loadEventType(sc, booking.event_type_id);
  const durationMinutes =
    eventType?.duration_minutes ??
    Math.round((Date.parse(booking.end_at) - Date.parse(booking.start_at)) / 60000);
  const newEndUtc = new Date(newStartUtc.getTime() + durationMinutes * 60000);

  if (eventType) {
    const slotCheck = await getAvailableSlots(
      sc,
      eventType,
      new Date(newStartUtc.getTime() - 24 * 3600 * 1000),
      new Date(newEndUtc.getTime() + 24 * 3600 * 1000),
      { excludeBookingId: booking.id },
    );
    const offered = slotCheck?.slots.some((s) => s.getTime() === newStartUtc.getTime()) ?? false;
    if (!offered) return { ok: false, error: "slot_unavailable" };
  }

  const newToken = generateManageToken();
  const { data: newId, error: rpcError } = await sc.rpc("scheduling_reschedule_booking", {
    p_old_id: booking.id,
    p_new_start: newStartUtc.toISOString(),
    p_new_end: newEndUtc.toISOString(),
    p_new_token: newToken,
    p_by: by,
  });
  if (rpcError) {
    if (rpcError.code === EXCLUSION_VIOLATION) return { ok: false, error: "slot_taken" };
    if (rpcError.message?.includes("booking_not_active")) {
      return { ok: false, error: "booking_not_active" };
    }
    console.error("[scheduling/booking] reschedule rpc error:", rpcError);
    return { ok: false, error: "db_error" };
  }

  // Nettoyage de l'ancien (rappels, Google, calendrier CRM).
  await removeExternalArtifacts(sc, booking);

  const { data: created } = await sc
    .from("scheduling_bookings")
    .select(BOOKING_COLUMNS)
    .eq("id", newId as string)
    .single();
  let fresh = created as unknown as Booking;

  const host = await getHostProfile(sc, fresh.user_id);
  const hostTz = await hostTimezoneOf(sc, fresh.user_id);

  if (fresh.status === "confirmed") {
    fresh = await applyConfirmationSideEffects(sc, fresh, eventType, host);
  }

  const ctx = {
    ...toEmailContext(fresh, eventType, host, hostTz),
    icsSequence: 1,
  };
  const oldStart = new Date(booking.start_at);
  const oldEnd = new Date(booking.end_at);
  await Promise.all([
    sendSchedulingEmail(rescheduledEmail(ctx, "invitee", oldStart, oldEnd), {
      contactId: fresh.contact_id,
      entrepriseId: fresh.entreprise_id,
    }),
    sendSchedulingEmail(rescheduledEmail(ctx, "host", oldStart, oldEnd), {
      contactId: fresh.contact_id,
      entrepriseId: fresh.entreprise_id,
    }),
  ]);

  return { ok: true, booking: fresh };
}
