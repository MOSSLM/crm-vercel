import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { bookingUrls, getHostProfile } from "@/lib/scheduling/booking";
import { reminderEmail, sendSchedulingEmail } from "@/lib/scheduling/emails";
import { BOOKING_COLUMNS } from "@/lib/scheduling/data";
import type { Booking } from "@/lib/scheduling/types";

export const runtime = "nodejs";

/**
 * Tick des rappels de rendez-vous — appelé par Supabase pg_cron toutes les
 * 5 minutes (voir sql/20260725_scheduling_module.sql) ou Vercel Cron.
 * Même contrat de sécurité que process-scheduled-actions :
 *   - `Authorization: Bearer ${CRON_SECRET}` (Vercel), ou
 *   - `x-pg-cron-secret: ${PG_CRON_SECRET}` (pg_cron) ;
 *   fail-closed en production quand aucun secret n'est configuré.
 */
const verifyCron = (req: Request): boolean => {
  const cronSecret = process.env.CRON_SECRET;
  const pgCronSecret = process.env.PG_CRON_SECRET;

  if (process.env.NODE_ENV === "production" && !cronSecret && !pgCronSecret) {
    return false;
  }
  if (!cronSecret && !pgCronSecret) return true;

  const auth = req.headers.get("authorization");
  const pgHeader = req.headers.get("x-pg-cron-secret");
  const validVercel = !!cronSecret && auth === `Bearer ${cronSecret}`;
  const validPgCron = !!pgCronSecret && pgHeader === pgCronSecret;
  return validVercel || validPgCron;
};

const BATCH_SIZE = 50;

export async function GET(req: Request) {
  if (!verifyCron(req)) return jsonError("Unauthorized", 401);

  const sc = getServiceClient();
  const nowIso = new Date().toISOString();

  const { data: due, error } = await sc
    .from("scheduling_booking_reminders")
    .select("id, booking_id, recipient, send_at")
    .eq("status", "pending")
    .lte("send_at", nowIso)
    .order("send_at", { ascending: true })
    .limit(BATCH_SIZE);
  if (error) return jsonError(error.message, 500);
  if (!due || due.length === 0) return json({ processed: 0 });

  let sent = 0;
  const errors: string[] = [];

  for (const reminder of due) {
    try {
      const { data: bookingRow } = await sc
        .from("scheduling_bookings")
        .select(BOOKING_COLUMNS)
        .eq("id", reminder.booking_id)
        .maybeSingle();
      const booking = bookingRow as unknown as Booking | null;

      // RDV annulé/passé entre-temps → rappel obsolète.
      if (
        !booking ||
        booking.status !== "confirmed" ||
        Date.parse(booking.start_at) < Date.now()
      ) {
        await sc
          .from("scheduling_booking_reminders")
          .update({ status: "cancelled" })
          .eq("id", reminder.id);
        continue;
      }

      const host = await getHostProfile(sc, booking.user_id);
      const { data: pageRow } = await sc
        .from("scheduling_pages")
        .select("timezone")
        .eq("user_id", booking.user_id)
        .maybeSingle();
      const hostTz = (pageRow?.timezone as string) ?? "Europe/Paris";
      const { manageUrl, dashboardUrl } = bookingUrls(booking);

      const ctx = {
        bookingId: booking.id,
        eventTitle: booking.event_title,
        durationMinutes: Math.round(
          (Date.parse(booking.end_at) - Date.parse(booking.start_at)) / 60000,
        ),
        startUtc: new Date(booking.start_at),
        endUtc: new Date(booking.end_at),
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
        hostTimezone: hostTz,
        answers: [],
        additionalGuests: booking.additional_guests ?? [],
        manageUrl,
        dashboardUrl,
      };

      const sends: Promise<boolean>[] = [];
      if (reminder.recipient === "invitee" || reminder.recipient === "both") {
        sends.push(
          sendSchedulingEmail(reminderEmail(ctx, "invitee"), {
            contactId: booking.contact_id,
            entrepriseId: booking.entreprise_id,
          }),
        );
      }
      if (reminder.recipient === "host" || reminder.recipient === "both") {
        sends.push(
          sendSchedulingEmail(reminderEmail(ctx, "host"), {
            contactId: booking.contact_id,
            entrepriseId: booking.entreprise_id,
          }),
        );
      }
      const results = await Promise.all(sends);
      const ok = results.some(Boolean);

      await sc
        .from("scheduling_booking_reminders")
        .update({
          status: ok ? "sent" : "failed",
          sent_at: ok ? new Date().toISOString() : null,
          error: ok ? null : "envoi échoué (voir email_logs)",
        })
        .eq("id", reminder.id);
      if (ok) sent += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : "erreur inconnue";
      errors.push(`${reminder.id}: ${message}`);
      await sc
        .from("scheduling_booking_reminders")
        .update({ status: "failed", error: message.slice(0, 500) })
        .eq("id", reminder.id);
    }
  }

  return json({ processed: due.length, sent, errors: errors.length ? errors : undefined });
}
