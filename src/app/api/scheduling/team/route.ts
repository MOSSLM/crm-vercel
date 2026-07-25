import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { requireStaff } from "../_lib";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

/**
 * Vue équipe (admin uniquement) : chaque hôte (admin + agents) avec sa page
 * de réservation et ses compteurs de RDV à venir / en attente.
 */
export const GET = withAuth({}, async ({ user, cors }) => {
  const sc = getServiceClient();
  const staff = await requireStaff(sc, user.id, cors);
  if (!staff.ok) return staff.response;
  if (staff.role !== "admin") return jsonError("forbidden", 403, {}, cors);

  const [{ data: profiles, error: pErr }, { data: pages }, { data: upcoming }] =
    await Promise.all([
      sc
        .from("user_profiles")
        .select("id, email, full_name, prenom, nom, role, actif")
        .in("role", ["admin", "freelance"]),
      sc.from("scheduling_pages").select("user_id, username, is_active"),
      sc
        .from("scheduling_bookings")
        .select("user_id, status")
        .in("status", ["confirmed", "pending"])
        .gte("start_at", new Date().toISOString())
        .limit(5000),
    ]);
  if (pErr) return jsonError(pErr.message, 500, {}, cors);

  const pageByUser = new Map(
    (pages ?? []).map((p) => [p.user_id as string, p as { username: string; is_active: boolean }]),
  );
  const counts = new Map<string, { upcoming: number; pending: number }>();
  for (const b of upcoming ?? []) {
    const c = counts.get(b.user_id as string) ?? { upcoming: 0, pending: 0 };
    if (b.status === "pending") c.pending += 1;
    else c.upcoming += 1;
    counts.set(b.user_id as string, c);
  }

  const members = (profiles ?? [])
    .filter((p) => p.actif !== false)
    .map((p) => {
      const page = pageByUser.get(p.id as string);
      const c = counts.get(p.id as string) ?? { upcoming: 0, pending: 0 };
      return {
        user_id: p.id as string,
        name:
          (p.full_name as string) ||
          [p.prenom, p.nom].filter(Boolean).join(" ") ||
          (p.email as string),
        email: p.email as string,
        role: p.role as string,
        username: page?.username ?? null,
        page_active: page?.is_active ?? false,
        upcoming: c.upcoming,
        pending: c.pending,
      };
    })
    .sort((a, b) => (a.role === b.role ? b.upcoming - a.upcoming : a.role === "admin" ? -1 : 1));

  return json({ members }, { headers: cors });
});
