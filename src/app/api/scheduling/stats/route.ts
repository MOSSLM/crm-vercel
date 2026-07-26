import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { requireStaff } from "../_lib";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

type StatRow = {
  start_at: string;
  status: string;
  source: string;
  event_title: string;
  created_at: string;
};

/** Lundi (UTC) de la semaine ISO d'une date, clé 'yyyy-MM-dd'. */
const weekStartKey = (iso: string): string => {
  const d = new Date(iso);
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNr = (monday.getUTCDay() + 6) % 7; // 0 = lundi
  monday.setUTCDate(monday.getUTCDate() - dayNr);
  return monday.toISOString().slice(0, 10);
};

/**
 * Statistiques du module Rendez-vous (page « Statistiques » + Aperçu).
 *   ?days=30|90|365   fenêtre passée analysée (défaut 90)
 *   &all=1            admin : toute l'équipe
 * Agrégats calculés côté serveur sur start_at ∈ [now − days, now + 60 j].
 */
export const GET = withAuth({}, async ({ user, req, cors }) => {
  const sc = getServiceClient();
  const staff = await requireStaff(sc, user.id, cors);
  if (!staff.ok) return staff.response;

  const url = new URL(req.url);
  const days = Math.min(365, Math.max(7, Number(url.searchParams.get("days")) || 90));
  const teamWide = staff.role === "admin" && url.searchParams.get("all") === "1";

  const now = Date.now();
  const fromIso = new Date(now - days * 24 * 3600 * 1000).toISOString();
  const toIso = new Date(now + 60 * 24 * 3600 * 1000).toISOString();

  let q = sc
    .from("scheduling_bookings")
    .select("start_at, status, source, event_title, created_at")
    .gte("start_at", fromIso)
    .lte("start_at", toIso)
    .limit(5000);
  if (!teamWide) q = q.eq("user_id", user.id);
  const { data, error } = await q;
  if (error) return jsonError(error.message, 500, {}, cors);
  const rows = (data ?? []) as StatRow[];

  const nowIso = new Date(now).toISOString();
  const past = rows.filter((r) => r.start_at <= nowIso);
  const future = rows.filter((r) => r.start_at > nowIso);

  const countBy = <K extends string>(list: StatRow[], key: (r: StatRow) => K) => {
    const m = new Map<K, number>();
    for (const r of list) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
    return m;
  };

  // Série hebdo : de la semaine de (now − days) à la semaine courante incluse.
  const byWeek = new Map<string, { total: number; cancelled: number }>();
  const firstWeek = weekStartKey(fromIso);
  const lastWeek = weekStartKey(nowIso);
  for (let w = firstWeek; w <= lastWeek; ) {
    byWeek.set(w, { total: 0, cancelled: 0 });
    const d = new Date(`${w}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 7);
    w = d.toISOString().slice(0, 10);
  }
  for (const r of past) {
    const w = weekStartKey(r.start_at);
    const cell = byWeek.get(w);
    if (!cell) continue;
    cell.total += 1;
    if (r.status === "cancelled" || r.status === "declined") cell.cancelled += 1;
  }

  const pastByStatus = countBy(past, (r) => r.status);
  const cancelledPast = (pastByStatus.get("cancelled") ?? 0) + (pastByStatus.get("declined") ?? 0);
  const heldPast = pastByStatus.get("confirmed") ?? 0;

  const topOf = (m: Map<string, number>, limit: number) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([label, count]) => ({ label, count }));

  return json(
    {
      days,
      team_wide: teamWide,
      totals: {
        upcoming: future.filter((r) => r.status === "confirmed").length,
        pending: future.filter((r) => r.status === "pending").length,
        held_past: heldPast,
        cancelled_past: cancelledPast,
        cancellation_rate: past.length ? Math.round((cancelledPast / past.length) * 100) : 0,
        total_past: past.length,
      },
      by_week: [...byWeek.entries()].map(([week, v]) => ({ week, ...v })),
      by_event_type: topOf(countBy(rows, (r) => r.event_title || "—"), 6),
      by_source: topOf(countBy(rows, (r) => r.source), 4),
      // Densité créneau : jour ISO (1=lun) × heure locale du serveur.
      by_slot: (() => {
        const grid = new Map<string, number>();
        for (const r of rows) {
          const d = new Date(r.start_at);
          const weekday = ((d.getUTCDay() + 6) % 7) + 1;
          const key = `${weekday}-${d.getUTCHours()}`;
          grid.set(key, (grid.get(key) ?? 0) + 1);
        }
        return [...grid.entries()].map(([k, count]) => {
          const [weekday, hour] = k.split("-").map(Number);
          return { weekday, hour, count };
        });
      })(),
    },
    { headers: cors },
  );
});
