/**
 * Telephony stats / reporting for the admin dashboard.
 *
 * Aggregates our own `calls` table (not the provider's rate-limited stats API):
 * KPIs, a daily series, and a per-agent breakdown over a date window.
 */

import { withAuth } from "@/app/api/_lib/with-auth";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";

export const runtime = "nodejs";

interface DayBucket {
  date: string;
  total: number;
  answered: number;
}
interface AgentBucket {
  agent_id: string;
  total: number;
  answered: number;
  duration: number;
  name?: string;
}

export const GET = withAuth({ role: "admin" }, async ({ req, cors }) => {
  const url = new URL(req.url);
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days") ?? 30)));
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const sc = getServiceClient();
  const { data, error } = await sc
    .from("calls")
    .select("id, direction, disposition, duration_sec, agent_id, started_at, created_at")
    .gte("created_at", since)
    .limit(5000);
  if (error) return jsonError(error.message, 500, {}, cors);

  const rows = (data ?? []) as Array<{
    direction: string;
    disposition: string | null;
    duration_sec: number | null;
    agent_id: string | null;
    started_at: string | null;
    created_at: string | null;
  }>;

  const total = rows.length;
  const answered = rows.filter((r) => r.disposition === "answered").length;
  const missed = rows.filter(
    (r) => r.direction === "inbound" && r.disposition === "no_answer",
  ).length;
  const inbound = rows.filter((r) => r.direction === "inbound").length;
  const outbound = rows.filter((r) => r.direction === "outbound").length;
  const totalDuration = rows.reduce((s, r) => s + (r.duration_sec ?? 0), 0);
  const avgDuration = answered ? Math.round(totalDuration / answered) : 0;

  const dayMap = new Map<string, DayBucket>();
  const agentMap = new Map<string, AgentBucket>();
  for (const r of rows) {
    const d = (r.started_at ?? r.created_at ?? "").slice(0, 10);
    if (d) {
      const b = dayMap.get(d) ?? { date: d, total: 0, answered: 0 };
      b.total += 1;
      if (r.disposition === "answered") b.answered += 1;
      dayMap.set(d, b);
    }
    const a = r.agent_id ?? "unassigned";
    const ab = agentMap.get(a) ?? { agent_id: a, total: 0, answered: 0, duration: 0 };
    ab.total += 1;
    if (r.disposition === "answered") ab.answered += 1;
    ab.duration += r.duration_sec ?? 0;
    agentMap.set(a, ab);
  }

  const daily = [...dayMap.values()].sort((x, y) => (x.date < y.date ? -1 : 1));
  const agents = [...agentMap.values()].sort((x, y) => y.total - x.total);

  const agentIds = agents.map((a) => a.agent_id).filter((id) => id !== "unassigned");
  if (agentIds.length > 0) {
    const { data: profiles } = await sc
      .from("user_profiles")
      .select("id, full_name, email")
      .in("id", agentIds);
    const nameById = new Map<string, string>();
    for (const p of profiles ?? []) {
      nameById.set(p.id as string, (p.full_name as string) || (p.email as string) || (p.id as string));
    }
    for (const a of agents) {
      a.name = a.agent_id === "unassigned" ? "Non attribué" : nameById.get(a.agent_id) ?? a.agent_id;
    }
  } else {
    for (const a of agents) a.name = a.agent_id === "unassigned" ? "Non attribué" : a.agent_id;
  }

  return json(
    {
      kpis: { total, answered, missed, inbound, outbound, avgDuration, totalDuration },
      daily,
      agents,
    },
    { headers: cors },
  );
});
