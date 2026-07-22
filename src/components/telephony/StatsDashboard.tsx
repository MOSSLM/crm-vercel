"use client";

import { useEffect, useState } from "react";
import { authedFetch } from "@/utils/authedFetch";

interface Stats {
  kpis: {
    total: number;
    answered: number;
    missed: number;
    inbound: number;
    outbound: number;
    avgDuration: number;
    totalDuration: number;
  };
  daily: Array<{ date: string; total: number; answered: number }>;
  agents: Array<{ agent_id: string; total: number; answered: number; duration: number; name?: string }>;
}

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function Tile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function StatsDashboard() {
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      const res = await authedFetch(`/api/telephony/stats?days=${days}`);
      const json = await res.json().catch(() => null);
      if (active) {
        setStats(res.ok ? json : null);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [days]);

  if (loading) return <p className="text-sm text-muted-foreground">Chargement…</p>;
  if (!stats) return <p className="text-sm text-muted-foreground">Statistiques indisponibles.</p>;

  const { kpis, daily, agents } = stats;
  const maxDay = Math.max(1, ...daily.map((d) => d.total));
  const answerRate = kpis.total ? Math.round((kpis.answered / kpis.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Période&nbsp;:</span>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="rounded-md border bg-background px-2 py-1 text-sm"
        >
          {[7, 30, 90].map((d) => (
            <option key={d} value={d}>
              {d} jours
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="Appels" value={kpis.total} />
        <Tile label="Répondus" value={kpis.answered} hint={`${answerRate}%`} />
        <Tile label="Manqués" value={kpis.missed} />
        <Tile label="Entrants" value={kpis.inbound} />
        <Tile label="Sortants" value={kpis.outbound} />
        <Tile label="Durée moy." value={fmtDuration(kpis.avgDuration)} />
      </div>

      {/* Daily volume */}
      <div className="rounded-lg border p-4">
        <h2 className="mb-3 text-sm font-semibold">Volume par jour</h2>
        {daily.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune donnée.</p>
        ) : (
          <div className="flex h-40 items-end gap-1 overflow-x-auto">
            {daily.map((d) => (
              <div key={d.date} className="flex min-w-[14px] flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-primary/80"
                  style={{ height: `${(d.total / maxDay) * 100}%` }}
                  title={`${d.date} · ${d.total} appels (${d.answered} répondus)`}
                />
                <span className="text-[9px] text-muted-foreground">{d.date.slice(5)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Per agent */}
      <div className="rounded-lg border p-4">
        <h2 className="mb-3 text-sm font-semibold">Par agent</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Agent</th>
                <th className="py-2 pr-3 font-medium">Appels</th>
                <th className="py-2 pr-3 font-medium">Répondus</th>
                <th className="py-2 pr-3 font-medium">Taux</th>
                <th className="py-2 pr-3 font-medium">Temps total</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => (
                <tr key={a.agent_id} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-medium">{a.name ?? a.agent_id}</td>
                  <td className="py-2 pr-3">{a.total}</td>
                  <td className="py-2 pr-3">{a.answered}</td>
                  <td className="py-2 pr-3">
                    {a.total ? Math.round((a.answered / a.total) * 100) : 0}%
                  </td>
                  <td className="py-2 pr-3 tabular-nums">{fmtDuration(a.duration)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
