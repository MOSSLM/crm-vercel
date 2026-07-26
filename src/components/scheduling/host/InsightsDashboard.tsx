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
import { Button } from "@/components/ui/button";
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
      className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md"
    >
      <p className="font-medium text-popover-foreground">Semaine du {label}</p>
      <p className="mt-0.5 text-muted-foreground">
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
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="cal-tag text-muted-foreground">{title}</div>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Pas encore de données.</p>
      ) : (
        <div className="mt-3 space-y-2.5">
          {items.map((item) => (
            <div key={item.label} className="text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 flex-1 truncate">
                  {labelMap?.[item.label] ?? item.label}
                </span>
                <span className="cal-mono text-xs text-muted-foreground">
                  {item.count}
                  <span className="ml-1 text-[10px]">
                    ({total ? Math.round((item.count / total) * 100) : 0} %)
                  </span>
                </span>
              </div>
              <div className="cal-propbar mt-1">
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
        <div className="inline-flex gap-1 rounded-lg bg-muted p-1">
          {PERIODS.map((p) => (
            <button
              key={p.days}
              type="button"
              onClick={() => setDays(p.days)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                days === p.days
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {isAdmin ? (
          <Button
            variant={teamWide ? "default" : "outline"}
            size="sm"
            onClick={() => setTeamWide((v) => !v)}
          >
            <User className="mr-1.5 h-4 w-4" />
            {teamWide ? "Toute l'équipe" : "Mes RDV"}
          </Button>
        ) : null}
      </div>

      {loading || !stats ? (
        <div className="flex items-center justify-center rounded-xl border bg-card py-16 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Chargement…
        </div>
      ) : (
        <>
          {/* Tuiles de synthèse */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="cal-tag text-muted-foreground">Réservations · période</div>
              <div className="cal-display mt-1.5 text-[30px]">{stats.totals.total_past}</div>
            </div>
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="cal-tag text-muted-foreground">RDV tenus</div>
              <div className="cal-display mt-1.5 text-[30px] text-[var(--ok)]">
                {stats.totals.held_past}
              </div>
            </div>
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="cal-tag text-muted-foreground">Annulés / refusés</div>
              <div className="cal-display mt-1.5 text-[30px] text-[var(--danger)]">
                {stats.totals.cancelled_past}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                soit {stats.totals.cancellation_rate} % de la période
              </div>
            </div>
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="cal-tag text-muted-foreground">À venir (confirmés)</div>
              <div className="cal-display mt-1.5 text-[30px]">{stats.totals.upcoming}</div>
              {stats.totals.pending ? (
                <div className="mt-1 text-xs text-[var(--warn)]">
                  + {stats.totals.pending} en attente
                </div>
              ) : null}
            </div>
          </div>

          {/* Réservations par semaine — mono-série, teinte primaire */}
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="cal-tag text-muted-foreground">Réservations par semaine</div>
            <p className="mt-1 text-xs text-muted-foreground">
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
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                    interval="preserveStartEnd"
                    minTickGap={24}
                  />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--hover)" }} />
                  <Bar
                    dataKey="total"
                    fill="var(--primary)"
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
