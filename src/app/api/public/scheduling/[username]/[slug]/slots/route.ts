import { preflight } from "@/app/api/_lib/cors";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { getAvailableSlots } from "@/lib/scheduling/data";
import { isValidManageToken } from "@/lib/scheduling/tokens";
import { SLUG_RE, loadPublicEventType, publicJson } from "../../../_lib";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req, { allowAny: true });

const MAX_RANGE_MS = 62 * 24 * 3600 * 1000; // ~2 mois par requête

/**
 * Créneaux disponibles d'un type d'évènement.
 *   ?from=ISO&to=ISO            fenêtre UTC demandée (≤ 62 jours)
 *   &exclude_token=…            reprogrammation : ignore le booking du token
 * Réponse : { timezone, slots: [ISO UTC, …] } — l'affichage dans le fuseau de
 * l'invité est fait côté client (le même instant UTC pour tout le monde).
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ username: string; slug: string }> },
) {
  const { username: rawUsername, slug: rawSlug } = await ctx.params;
  const username = decodeURIComponent(rawUsername).trim().toLowerCase();
  const slug = decodeURIComponent(rawSlug).trim().toLowerCase();
  if (!SLUG_RE.test(username) || !SLUG_RE.test(slug)) {
    return publicJson(req, { error: "invalid_params" }, 400);
  }

  const url = new URL(req.url);
  const from = new Date(url.searchParams.get("from") ?? "");
  const to = new Date(url.searchParams.get("to") ?? "");
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
    return publicJson(req, { error: "invalid_range" }, 400);
  }
  if (to.getTime() - from.getTime() > MAX_RANGE_MS) {
    return publicJson(req, { error: "range_too_large" }, 400);
  }

  const loaded = await loadPublicEventType(username, slug);
  if (!loaded) return publicJson(req, { error: "not_found" }, 404);

  // Reprogrammation : le créneau actuel de l'invité ne doit pas se bloquer lui-même.
  let excludeBookingId: string | undefined;
  const excludeToken = url.searchParams.get("exclude_token");
  if (excludeToken && isValidManageToken(excludeToken)) {
    const { data: existing } = await getServiceClient()
      .from("scheduling_bookings")
      .select("id, user_id")
      .eq("manage_token", excludeToken)
      .maybeSingle();
    if (existing && existing.user_id === loaded.eventType.user_id) {
      excludeBookingId = existing.id as string;
    }
  }

  const result = await getAvailableSlots(
    getServiceClient(),
    loaded.eventType,
    from,
    to,
    { excludeBookingId },
  );
  if (!result) return publicJson(req, { error: "schedule_not_found" }, 404);

  return publicJson(req, {
    timezone: result.timezone,
    duration_minutes: loaded.eventType.duration_minutes,
    slots: result.slots.map((s) => s.toISOString()),
  });
}
