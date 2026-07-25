import { preflight } from "@/app/api/_lib/cors";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { cancelBooking } from "@/lib/scheduling/booking";
import { BOOKING_COLUMNS } from "@/lib/scheduling/data";
import { isValidManageToken } from "@/lib/scheduling/tokens";
import { publicBookingProjection, publicCancelSchema } from "@/app/api/scheduling/_lib";
import { publicJson } from "../../../_lib";
import type { Booking } from "@/lib/scheduling/types";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req, { allowAny: true });

/** Annulation par l'invité via son manage_token. */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token: raw } = await ctx.params;
  const token = decodeURIComponent(raw).trim();
  if (!isValidManageToken(token)) return publicJson(req, { error: "invalid_token" }, 400);

  let body: { reason?: string | null } = {};
  try {
    const parsed = publicCancelSchema.safeParse(await req.json());
    if (parsed.success) body = parsed.data;
  } catch {
    // corps vide accepté
  }

  const sc = getServiceClient();
  const { data } = await sc
    .from("scheduling_bookings")
    .select(BOOKING_COLUMNS)
    .eq("manage_token", token)
    .maybeSingle();
  if (!data) return publicJson(req, { error: "not_found" }, 404);

  const result = await cancelBooking(sc, data as unknown as Booking, "invitee", body.reason ?? null);
  if (!result.ok) return publicJson(req, { error: result.error }, 409);

  return publicJson(req, { booking: publicBookingProjection(result.booking) });
}
