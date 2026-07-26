"use client";

/**
 * Statistiques Cal.SAMA — tuiles de synthèse, réservations par semaine
 * (barres mono-série, teinte primaire, tooltip au survol), répartition par
 * type d'évènement et par source (listes à barres de proportion).
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, User } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAuth } from "@/components/AuthContext";
import { fetchStats, type SchedulingStats } from "@/lib/scheduling/client";

const PERIODS = [
  { days: 30, label: "30 jours" },
  { days: 90, label: "90 jours" },
  { days: 365, label: "12 mois" },
];

const SOURCE_LABELS: Record<string, string> = {
  public: "Lien public",
  embed: "Site web (embed)",
  agent: "Agent",
  api: "API",
};

const weekLabel = (weekKey: string): string =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${weekKey}T00:00:00Z`),
  );

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value?: number; payload?: { cancelled?: number } }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const total = payload[0]?.value ?? 0;
  const cancelled = payload[0]?.payload?.cancelled ?? 0;
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border-2)",
        borderRadius: 8,
        padding: "8px 10px",
        fontSize: 11.5,
        boxShadow: "var(--shadow-2)",
      }}
    >
      <p style={{ margin: 0, fontWeight: 500 }}>Semaine du {label}</p>
      <p style={{ margin: "2px 0 0", color: "var(--text-3)" }}>
        {total} réservation{total > 1 ? "s" : ""}
        {cancelled ? ` · dont ${cancelled} annulée${cancelled > 1 ? "s" : ""}` : ""}
      </p>
    </div>
  );
}

function ProportionList({
  title,
  items,
  labelMap,
}: {
  title: string;
  items: { label: string; count: number }[];
  labelMap?: Record<string, string>;
}) {
  const max = Math.max(1, ...items.map((i) => i.count));
  const total = items.reduce((acc, i) => acc + i.count, 0);
  return (
    <div className="blk">
      <h4>{title}</h4>
      {items.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-3)" }}>Pas encore de données.</p>
      ) : (
        <div className="space-y-2.5">
          {items.map((item) => (
            <div key={item.label} style={{ fontSize: 12.5 }}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 flex-1 truncate">{labelMap?.[item.label] ?? item.label}</span>
                <span className="mono" style={{ color: "var(--text-3)", fontSize: 11.5 }}>
                  {item.count}
                  <span style={{ marginLeft: 4, fontSize: 10.5 }}>
                    ({total ? Math.round((item.count / total) * 100) : 0} %)
                  </span>
                </span>
              </div>
              <div className="propbar" style={{ marginTop: 4 }}>
                <i style={{ width: `${(item.count / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function InsightsDashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [days, setDays] = useState(90);
  const [teamWide, setTeamWide] = useState(false);
  const [stats, setStats] = useState<SchedulingStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setStats(await fetchStats(days, teamWide));
    } catch (err) {
      toast.error("Chargement des statistiques impossible", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setLoading(false);
    }
  }, [days, teamWide]);

  useEffect(() => {
    void load();
  }, [load]);

  const chartData = (stats?.by_week ?? []).map((w) => ({
    ...w,
    label: weekLabel(w.week),
  }));

  return (
    <div className="space-y-4">
      {/* Filtres */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="seg" role="tablist">
          {PERIODS.map((p) => (
            <button
              key={p.days}
              type="button"
              role="tab"
              aria-selected={days === p.days}
              className="seg-btn"
              onClick={() => setDays(p.days)}
            >
              {p.label}
            </button>
          ))}
        </div>
        {isAdmin ? (
          <button
            type="button"
            className={"btn sm " + (teamWide ? "primary" : "outline")}
            onClick={() => setTeamWide((v) => !v)}
          >
            <User size={13} />
            {teamWide ? "Toute l'équipe" : "Mes RDV"}
          </button>
        ) : null}
      </div>

      {loading || !stats ? (
        <div className="blk empty">
          <Loader2 size={18} className="spin" style={{ margin: "0 auto 8px" }} />
          Chargement…
        </div>
      ) : (
        <>
          {/* Tuiles de synthèse */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="blk stat">
              <span className="cs-tag">Réservations · période</span>
              <div className="v">{stats.totals.total_past}</div>
            </div>
            <div className="blk stat">
              <span className="cs-tag">RDV tenus</span>
              <div className="v ok">{stats.totals.held_past}</div>
            </div>
            <div className="blk stat">
              <span className="cs-tag">Annulés / refusés</span>
              <div className="v danger">{stats.totals.cancelled_past}</div>
              <div className="h">soit {stats.totals.cancellation_rate} % de la période</div>
            </div>
            <div className="blk stat">
              <span className="cs-tag">À venir (confirmés)</span>
              <div className="v">{stats.totals.upcoming}</div>
              {stats.totals.pending ? (
                <div className="h" style={{ color: "var(--warn)" }}>
                  + {stats.totals.pending} en attente
                </div>
              ) : null}
            </div>
          </div>

          {/* Réservations par semaine — mono-série, teinte primaire */}
          <div className="blk">
            <h4>Réservations par semaine</h4>
            <p style={{ margin: "-4px 0 0", fontSize: 11.5, color: "var(--text-3)" }}>
              Rendez-vous dont la date tombe dans la semaine (période analysée).
            </p>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "var(--text-3)", fontSize: 11, fontFamily: "var(--font-mono)" }}
                    interval="preserveStartEnd"
                    minTickGap={24}
                  />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "var(--text-3)", fontSize: 11, fontFamily: "var(--font-mono)" }}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--hover-2)" }} />
                  <Bar
                    dataKey="total"
                    fill="var(--accent)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ProportionList title="Par type d'évènement" items={stats.by_event_type} />
            <ProportionList title="Par canal de réservation" items={stats.by_source} labelMap={SOURCE_LABELS} />
          </div>
        </>
      )}
    </div>
  );
}
