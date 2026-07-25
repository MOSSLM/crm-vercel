import { preflight } from "@/app/api/_lib/cors";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { rescheduleBooking } from "@/lib/scheduling/booking";
import { BOOKING_COLUMNS } from "@/lib/scheduling/data";
import { isValidManageToken } from "@/lib/scheduling/tokens";
import { publicBookingProjection, publicRescheduleSchema } from "@/app/api/scheduling/_lib";
import { publicJson } from "../../../_lib";
import type { Booking } from "@/lib/scheduling/types";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req, { allowAny: true });

/** Reprogrammation par l'invité : bascule atomique vers le nouveau créneau. */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token: raw } = await ctx.params;
  const token = decodeURIComponent(raw).trim();
  if (!isValidManageToken(token)) return publicJson(req, { error: "invalid_token" }, 400);

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return publicJson(req, { error: "invalid_body" }, 400);
  }
  const parsed = publicRescheduleSchema.safeParse(rawBody);
  if (!parsed.success) return publicJson(req, { error: "invalid_body" }, 400);

  const start = new Date(parsed.data.start);
  if (Number.isNaN(start.getTime())) return publicJson(req, { error: "invalid_start" }, 400);

  const sc = getServiceClient();
  const { data } = await sc
    .from("scheduling_bookings")
    .select(BOOKING_COLUMNS)
    .eq("manage_token", token)
    .maybeSingle();
  if (!data) return publicJson(req, { error: "not_found" }, 404);
  const booking = data as unknown as Booking;

  // L'invité peut mettre à jour son fuseau au passage (affichage des emails).
  if (parsed.data.timezone && parsed.data.timezone !== booking.invitee_timezone) {
    await sc
      .from("scheduling_bookings")
      .update({ invitee_timezone: parsed.data.timezone })
      .eq("id", booking.id);
    booking.invitee_timezone = parsed.data.timezone;
  }

  const result = await rescheduleBooking(sc, booking, start, "invitee");
  if (!result.ok) {
    const status =
      result.error === "slot_taken" || result.error === "slot_unavailable" ? 409 : 400;
    return publicJson(req, { error: result.error }, status);
  }

  return publicJson(req, { booking: publicBookingProjection(result.booking) });
}
