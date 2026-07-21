"use client";

/**
 * Call analytics: KPIs, per-day volume, a weekday×hour conversion heatmap,
 * disposition breakdown, a live-calls monitor, and (for admins) a per-agent
 * table. Data from /api/twilio/analytics.
 */
import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { Phone, PhoneMissed, Clock, Timer, Radio, Loader2 } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { authedFetch } from "@/utils/authedFetch";

interface Analytics {
  totals: {
    total: number;
    inbound: number;
    outbound: number;
    answered: number;
    missed: number;
    talkMinutes: number;
  };
  avgDuration: number;
  byDay: Array<{ date: string; count: number; answered: number }>;
  heatmap: number[][];
  byDisposition: Array<{ disposition: string; count: number }>;
  agents: Array<{ id: string; name: string; count: number; answered: number }>;
  live: Array<{
    id: string;
    direction: string;
    from_e164: string | null;
    to_e164: string | null;
    started_at: string;
  }>;
  isAdmin: boolean;
}

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Phone;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-xl font-semibold leading-none">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
          {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

export function CallAnalytics() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await authedFetch(`/api/twilio/analytics?days=${days}`);
        if (res.ok && !cancelled) setData((await res.json()) as Analytics);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [days]);

  const heatMax = useMemo(() => {
    if (!data) return 0;
    return Math.max(1, ...data.heatmap.flat());
  }, [data]);

  if (loading || !data) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const answerRate = data.totals.total
    ? Math.round((data.totals.answered / data.totals.total) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="rounded-md border border-border bg-background px-2 py-1 text-sm"
        >
          <option value={7}>7 jours</option>
          <option value={30}>30 jours</option>
          <option value={90}>90 jours</option>
        </select>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Phone} label="Appels" value={data.totals.total} hint={`${data.totals.inbound} entrants · ${data.totals.outbound} sortants`} />
        <Kpi icon={Radio} label="Taux de décroché" value={`${answerRate}%`} hint={`${data.totals.answered} pris`} />
        <Kpi icon={PhoneMissed} label="Manqués" value={data.totals.missed} />
        <Kpi icon={Timer} label="Durée moy." value={`${data.avgDuration}s`} hint={`${data.totals.talkMinutes} min au total`} />
      </div>

      {/* Volume over time */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Volume d&apos;appels</CardTitle>
          <CardDescription>Appels par jour et appels décrochés.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.byDay} margin={{ left: -20, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="calls" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d: string) => d.slice(5)}
                  fontSize={11}
                  minTickGap={24}
                />
                <YAxis allowDecimals={false} fontSize={11} width={32} />
                <Tooltip />
                <Area type="monotone" dataKey="count" stroke="var(--primary)" fill="url(#calls)" name="Appels" />
                <Area type="monotone" dataKey="answered" stroke="#10b981" fill="transparent" name="Décrochés" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Conversion heatmap */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Heatmap d&apos;activité</CardTitle>
          <CardDescription>Répartition des appels par jour et heure (UTC).</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="min-w-[560px]">
              <div className="mb-1 flex gap-[2px] pl-8">
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="w-[18px] text-center text-[8px] text-muted-foreground">
                    {h % 3 === 0 ? h : ""}
                  </div>
                ))}
              </div>
              {DAY_ORDER.map((dow, rowIdx) => (
                <div key={dow} className="mb-[2px] flex items-center gap-[2px]">
                  <div className="w-8 text-[10px] text-muted-foreground">{DAY_LABELS[rowIdx]}</div>
                  {Array.from({ length: 24 }, (_, h) => {
                    const v = data.heatmap[dow]?.[h] ?? 0;
                    const intensity = v / heatMax;
                    return (
                      <div
                        key={h}
                        title={`${DAY_LABELS[rowIdx]} ${h}h — ${v} appel(s)`}
                        className="h-[18px] w-[18px] rounded-[3px]"
                        style={{
                          backgroundColor:
                            v === 0
                              ? "var(--muted)"
                              : `color-mix(in srgb, var(--primary) ${Math.round(15 + intensity * 85)}%, transparent)`,
                        }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Disposition breakdown */}
      {data.byDisposition.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Issues d&apos;appel</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.byDisposition} margin={{ left: -20, right: 8, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="disposition" fontSize={11} />
                  <YAxis allowDecimals={false} fontSize={11} width={32} />
                  <Tooltip />
                  <Bar dataKey="count" fill="var(--primary)" radius={[4, 4, 0, 0]} name="Appels" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Live monitor */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Appels en cours
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.live.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Aucun appel en cours.</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.live.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span>
                    {c.direction === "inbound" ? "↙" : "↗"}{" "}
                    {c.direction === "inbound" ? c.from_e164 : c.to_e164}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    depuis {new Date(c.started_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Per-agent (admin) */}
      {data.isAdmin && data.agents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Performance par agent</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {data.agents.map((a) => (
                <li key={a.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="font-medium">{a.name}</span>
                  <span className="text-muted-foreground">
                    {a.count} appels · {a.count ? Math.round((a.answered / a.count) * 100) : 0}% décrochés
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default CallAnalytics;
