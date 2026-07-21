/**
 * Call analytics. Admins see the whole team; agents see their own. Aggregates
 * volume, answer/miss rates, talk time, a per-day series, a weekday×hour
 * conversion heatmap, disposition + per-agent breakdowns, and live calls.
 */
import { json, jsonError } from "@/app/api/_lib/respond";
import { withAuth } from "@/app/api/_lib/with-auth";
import { STAFF_ROLES } from "@/app/api/_lib/require-role";
import { preflight } from "@/app/api/_lib/cors";
import { getServiceClient } from "@/app/api/_lib/service-client";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

const MISSED = new Set(["no-answer", "busy", "failed", "canceled"]);

interface Row {
  direction: "inbound" | "outbound";
  status: string;
  disposition: string | null;
  agent_id: string | null;
  started_at: string;
  duration_seconds: number | null;
  answered_at: string | null;
}

export const GET = withAuth({ role: STAFF_ROLES }, async ({ user, req, cors }) => {
  const db = getServiceClient();
  const url = new URL(req.url);
  const days = Math.min(Math.max(Number(url.searchParams.get("days") ?? 30), 1), 180);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data: profile } = await db
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const isAdmin = (profile as { role?: string } | null)?.role === "admin";

  let query = db
    .from("calls")
    .select("direction, status, disposition, agent_id, started_at, duration_seconds, answered_at")
    .gte("started_at", since)
    .limit(10000);
  if (!isAdmin) query = query.eq("agent_id", user.id);

  const { data, error } = await query;
  if (error) return jsonError(error.message, 500, {}, cors);
  const rows = (data as Row[]) ?? [];

  const isMissed = (r: Row) => MISSED.has(r.status) || MISSED.has(r.disposition ?? "");
  const isAnswered = (r: Row) => !!r.answered_at || (r.duration_seconds ?? 0) > 0;

  const totals = {
    total: rows.length,
    inbound: rows.filter((r) => r.direction === "inbound").length,
    outbound: rows.filter((r) => r.direction === "outbound").length,
    answered: rows.filter(isAnswered).length,
    missed: rows.filter(isMissed).length,
    talkMinutes: Math.round(rows.reduce((s, r) => s + (r.duration_seconds ?? 0), 0) / 60),
  };
  const answeredDurations = rows.filter(isAnswered).map((r) => r.duration_seconds ?? 0);
  const avgDuration = answeredDurations.length
    ? Math.round(answeredDurations.reduce((s, d) => s + d, 0) / answeredDurations.length)
    : 0;

  // Per-day series.
  const byDayMap = new Map<string, { count: number; answered: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    byDayMap.set(d, { count: 0, answered: 0 });
  }
  // Weekday (0=Sun..6=Sat) × hour heatmap.
  const heatmap: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  const byDisposition = new Map<string, number>();
  const byAgent = new Map<string, { count: number; answered: number }>();

  for (const r of rows) {
    const dt = new Date(r.started_at);
    const day = dt.toISOString().slice(0, 10);
    const bucket = byDayMap.get(day);
    if (bucket) {
      bucket.count++;
      if (isAnswered(r)) bucket.answered++;
    }
    heatmap[dt.getUTCDay()][dt.getUTCHours()]++;
    const disp = r.disposition ?? "non_defini";
    byDisposition.set(disp, (byDisposition.get(disp) ?? 0) + 1);
    if (r.agent_id) {
      const a = byAgent.get(r.agent_id) ?? { count: 0, answered: 0 };
      a.count++;
      if (isAnswered(r)) a.answered++;
      byAgent.set(r.agent_id, a);
    }
  }

  // Resolve agent names (admin view).
  let agents: Array<{ id: string; name: string; count: number; answered: number }> = [];
  if (isAdmin && byAgent.size > 0) {
    const ids = [...byAgent.keys()];
    const { data: profs } = await db
      .from("user_profiles")
      .select("id, full_name, email")
      .in("id", ids);
    const nameById = new Map((profs ?? []).map((p) => [p.id, p.full_name || p.email || "—"]));
    agents = ids
      .map((id) => ({ id, name: nameById.get(id) ?? "—", ...byAgent.get(id)! }))
      .sort((a, b) => b.count - a.count);
  }

  // Live (in-progress) calls.
  let liveQuery = db
    .from("calls")
    .select("id, direction, from_e164, to_e164, agent_id, started_at, answered_at")
    .eq("status", "in-progress")
    .order("started_at", { ascending: false })
    .limit(50);
  if (!isAdmin) liveQuery = liveQuery.eq("agent_id", user.id);
  const { data: live } = await liveQuery;

  return json(
    {
      totals,
      avgDuration,
      byDay: [...byDayMap.entries()].map(([date, v]) => ({ date, ...v })),
      heatmap,
      byDisposition: [...byDisposition.entries()].map(([disposition, count]) => ({
        disposition,
        count,
      })),
      agents,
      live: live ?? [],
      isAdmin,
    },
    { headers: cors },
  );
});
