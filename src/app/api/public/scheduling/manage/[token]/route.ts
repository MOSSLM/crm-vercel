import { preflight } from "@/app/api/_lib/cors";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { BOOKING_COLUMNS } from "@/lib/scheduling/data";
import { isValidManageToken } from "@/lib/scheduling/tokens";
import { publicBookingProjection } from "@/app/api/scheduling/_lib";
import { publicJson } from "../../_lib";
import type { Booking } from "@/lib/scheduling/types";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req, { allowAny: true });

/**
 * Détail d'un booking pour la page publique « gérer mon rendez-vous ».
 * Ajoute le contexte nécessaire à la reprogrammation (username + event slug)
 * et, si le booking a été reprogrammé, le token du successeur.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token: raw } = await ctx.params;
  const token = decodeURIComponent(raw).trim();
  if (!isValidManageToken(token)) return publicJson(req, { error: "invalid_token" }, 400);

  const sc = getServiceClient();
  const { data } = await sc
    .from("scheduling_bookings")
    .select(BOOKING_COLUMNS)
    .eq("manage_token", token)
    .maybeSingle();
  if (!data) return publicJson(req, { error: "not_found" }, 404);
  const booking = data as unknown as Booking;

  // Booking annulé pour cause de reprogrammation → pointer le successeur.
  let successorToken: string | null = null;
  if (booking.status === "cancelled") {
    const { data: successor } = await sc
      .from("scheduling_bookings")
      .select("manage_token")
      .eq("rescheduled_from_id", booking.id)
      .maybeSingle();
    successorToken = (successor?.manage_token as string) ?? null;
  }

  // Contexte de reprogrammation : slug de l'évènement + username de la page.
  let eventSlug: string | null = null;
  let username: string | null = null;
  let customQuestions: unknown = [];
  if (booking.event_type_id) {
    const { data: et } = await sc
      .from("scheduling_event_types")
      .select("slug, is_active, custom_questions")
      .eq("id", booking.event_type_id)
      .maybeSingle();
    if (et?.is_active) {
      eventSlug = et.slug as string;
      customQuestions = et.custom_questions ?? [];
    }
  }
  const { data: pageRow } = await sc
    .from("scheduling_pages")
    .select("username, display_name, brand_color, is_active")
    .eq("user_id", booking.user_id)
    .maybeSingle();
  if (pageRow?.is_active) username = pageRow.username as string;

  return publicJson(req, {
    booking: publicBookingProjection(booking),
    successor_token: successorToken,
    username,
    event_slug: eventSlug,
    custom_questions: customQuestions,
    host_display_name: (pageRow?.display_name as string) ?? null,
    brand_color: (pageRow?.brand_color as string) ?? "#0E93A6",
  });
}
