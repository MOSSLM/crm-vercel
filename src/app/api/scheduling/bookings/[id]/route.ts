import { z } from "zod";
import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import {
  cancelBooking,
  confirmBooking,
  declineBooking,
  rescheduleBooking,
} from "@/lib/scheduling/booking";
import { BOOKING_COLUMNS } from "@/lib/scheduling/data";
import type { Booking } from "@/lib/scheduling/types";
import { bookingActionSchema, requireStaff } from "../../_lib";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

type Params = { id: string };
type BookingAction = z.infer<typeof bookingActionSchema>;

/** Actions hôte sur un booking : confirm / decline / cancel / reschedule. */
export const PATCH = withAuth<BookingAction, Params>(
  { body: bookingActionSchema },
  async ({ user, body, params, cors }) => {
    const sc = getServiceClient();
    const staff = await requireStaff(sc, user.id, cors);
    if (!staff.ok) return staff.response;

    let q = sc.from("scheduling_bookings").select(BOOKING_COLUMNS).eq("id", params.id);
    // Un agent ne touche qu'à ses bookings ; un admin peut agir sur tous.
    if (staff.role !== "admin") q = q.eq("user_id", user.id);
    const { data } = await q.maybeSingle();
    if (!data) return jsonError("not_found", 404, {}, cors);
    const booking = data as unknown as Booking;

    switch (body.action) {
      case "confirm": {
        const result = await confirmBooking(sc, booking);
        if (!result.ok) return jsonError(result.error, 409, {}, cors);
        return json({ booking: result.booking }, { headers: cors });
      }
      case "decline": {
        const result = await declineBooking(sc, booking, body.reason ?? null);
        if (!result.ok) return jsonError(result.error, 409, {}, cors);
        return json({ booking: result.booking }, { headers: cors });
      }
      case "cancel": {
        const result = await cancelBooking(sc, booking, "host", body.reason ?? null);
        if (!result.ok) return jsonError(result.error, 409, {}, cors);
        return json({ booking: result.booking }, { headers: cors });
      }
      case "reschedule": {
        if (!body.start) return jsonError("invalid_body", 400, {}, cors);
        const start = new Date(body.start);
        if (Number.isNaN(start.getTime())) return jsonError("invalid_body", 400, {}, cors);
        const result = await rescheduleBooking(sc, booking, start, "host");
        if (!result.ok) {
          const status = result.error === "slot_taken" || result.error === "slot_unavailable" ? 409 : 400;
          return jsonError(result.error, status, {}, cors);
        }
        return json({ booking: result.booking }, { headers: cors });
      }
      default:
        return jsonError("invalid_action", 400, {}, cors);
    }
  },
);
