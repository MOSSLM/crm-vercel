import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { BOOKING_COLUMNS } from "@/lib/scheduling/data";
import { requireStaff } from "../_lib";

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
