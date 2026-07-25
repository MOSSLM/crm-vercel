import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { getAvailableSlots } from "@/lib/scheduling/data";
import type { EventType } from "@/lib/scheduling/types";
import { requireStaff } from "../../../_lib";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

type Params = { id: string };
const MAX_RANGE_MS = 62 * 24 * 3600 * 1000;

/**
 * Créneaux disponibles d'un type d'évènement, côté hôte (cockpit d'appel,
 * réservation manuelle). Un agent ne voit que ses types ; un admin tous.
 *   ?from=ISO&to=ISO (fenêtre ≤ 62 jours)
 */
export const GET = withAuth<undefined, Params>({}, async ({ user, req, params, cors }) => {
  const sc = getServiceClient();
  const staff = await requireStaff(sc, user.id, cors);
  if (!staff.ok) return staff.response;

  const url = new URL(req.url);
  const from = new Date(url.searchParams.get("from") ?? "");
  const to = new Date(url.searchParams.get("to") ?? "");
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
    return jsonError("invalid_range", 400, {}, cors);
  }
  if (to.getTime() - from.getTime() > MAX_RANGE_MS) {
    return jsonError("range_too_large", 400, {}, cors);
  }

  let q = sc.from("scheduling_event_types").select("*").eq("id", params.id);
  if (staff.role !== "admin") q = q.eq("user_id", user.id);
  const { data } = await q.maybeSingle();
  if (!data) return jsonError("not_found", 404, {}, cors);
  const eventType = data as EventType;

  const result = await getAvailableSlots(sc, eventType, from, to);
  if (!result) return jsonError("schedule_not_found", 404, {}, cors);

  return json(
    {
      timezone: result.timezone,
      duration_minutes: eventType.duration_minutes,
      location_type: eventType.location_type,
      slots: result.slots.map((s) => s.toISOString()),
    },
    { headers: cors },
  );
});
