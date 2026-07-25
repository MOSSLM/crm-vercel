import { z } from "zod";
import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { createBooking } from "@/lib/scheduling/booking";
import { BOOKING_COLUMNS, ensureHostSetup } from "@/lib/scheduling/data";
import type { EventType, SchedulingPage } from "@/lib/scheduling/types";
import { hostBookingCreateSchema, requireStaff } from "../_lib";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

/**
 * Liste des bookings de l'hôte.
 *   ?filter=upcoming (défaut) | pending | past | cancelled
 * Un admin peut passer ?all=1 (toute l'équipe) ou ?host=<uuid> (un hôte précis).
 */
export const GET = withAuth({}, async ({ user, req, cors }) => {
  const sc = getServiceClient();
  const staff = await requireStaff(sc, user.id, cors);
  if (!staff.ok) return staff.response;

  const url = new URL(req.url);
  const filter = url.searchParams.get("filter") ?? "upcoming";
  const hostParam = staff.role === "admin" ? url.searchParams.get("host") : null;
  const teamWide = staff.role === "admin" && !hostParam && url.searchParams.get("all") === "1";
  const nowIso = new Date().toISOString();

  let q = sc
    .from("scheduling_bookings")
    .select(`${BOOKING_COLUMNS}, host:user_profiles!scheduling_bookings_user_id_fkey(full_name, email)`)
    .limit(200);
  if (hostParam) q = q.eq("user_id", hostParam);
  else if (!teamWide) q = q.eq("user_id", user.id);

  switch (filter) {
    case "pending":
      q = q.eq("status", "pending").gte("start_at", nowIso).order("start_at", { ascending: true });
      break;
    case "past":
      q = q
        .in("status", ["confirmed", "pending"])
        .lt("start_at", nowIso)
        .order("start_at", { ascending: false });
      break;
    case "cancelled":
      q = q.in("status", ["cancelled", "declined"]).order("start_at", { ascending: false });
      break;
    case "upcoming":
    default:
      q = q
        .in("status", ["confirmed", "pending"])
        .gte("start_at", nowIso)
        .order("start_at", { ascending: true });
      break;
  }

  const { data, error } = await q;
  if (error) return jsonError(error.message, 500, {}, cors);
  return json({ bookings: data ?? [] }, { headers: cors });
});

type HostBookingCreate = z.infer<typeof hostBookingCreateSchema>;

/**
 * Création d'un booking par l'hôte lui-même (cockpit d'appel pendant un
 * call, réservation manuelle). Passe par le même moteur que le parcours
 * public : re-vérification de la dispo, contrainte GiST, emails, calendrier
 * CRM, Google, rappels. Un agent ne réserve que sur SES types d'évènements ;
 * un admin peut réserver sur ceux de n'importe quel hôte.
 */
export const POST = withAuth<HostBookingCreate>(
  { body: hostBookingCreateSchema },
  async ({ user, body, cors }) => {
    const sc = getServiceClient();
    const staff = await requireStaff(sc, user.id, cors);
    if (!staff.ok) return staff.response;

    let q = sc.from("scheduling_event_types").select("*").eq("id", body.event_type_id).eq("is_active", true);
    if (staff.role !== "admin") q = q.eq("user_id", user.id);
    const { data: eventTypeRow } = await q.maybeSingle();
    if (!eventTypeRow) return jsonError("not_found", 404, {}, cors);
    const eventType = eventTypeRow as EventType;

    const page = (await ensureHostSetup(sc, eventType.user_id)) as SchedulingPage;

    const start = new Date(body.start);
    if (Number.isNaN(start.getTime())) return jsonError("invalid_start", 400, {}, cors);

    const result = await createBooking(sc, {
      page,
      eventType,
      startUtc: start,
      invitee: {
        name: body.name.trim(),
        email: body.email.trim(),
        phone: body.phone?.trim() || null,
        notes: body.notes?.trim() || null,
        timezone: body.timezone ?? page.timezone,
      },
      answers: [],
      additionalGuests: [],
      source: "agent",
      callId: body.call_id ?? null,
      opportuniteId: body.opportunite_id ?? null,
    });

    if (!result.ok) {
      const status =
        result.error === "slot_taken" || result.error === "slot_unavailable" ? 409 : 500;
      return jsonError(result.error, status, {}, cors);
    }
    return json({ booking: result.booking }, { status: 201, headers: cors });
  },
);
