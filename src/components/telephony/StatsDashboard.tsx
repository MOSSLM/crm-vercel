"use client";

import { useEffect, useState } from "react";
import {
  PhoneOutgoing,
  PhoneIncoming,
  Clock,
  PhoneMissed,
  CheckCircle2,
} from "lucide-react";
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
function fmtTalk(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m} min`;
}

const AV_COLORS = ["#E2552B", "#3B7DD8", "#7A5AF0", "#2E9E6B", "#D8912E", "#C64B8C"];
function colorOf(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AV_COLORS[h % AV_COLORS.length];
}
function initials(s: string): string {
  const p = s.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "?") + (p[1]?.[0] ?? "")).toUpperCase();
}

const PERIODS = [
  { d: 7, l: "7 j" },
  { d: 30, l: "30 j" },
  { d: 90, l: "90 j" },
];

/** Call analytics dashboard (skin prototype kpi / st-*). */
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

  if (loading)
    return (
      <div className="tel-skin">
        <p style={{ fontSize: 13, color: "var(--text-3)" }}>Chargement…</p>
      </div>
    );
  if (!stats)
    return (
      <div className="tel-skin">
        <p style={{ fontSize: 13, color: "var(--text-3)" }}>Statistiques indisponibles.</p>
      </div>
    );

  const { kpis, daily, agents } = stats;
  const maxDay = Math.max(1, ...daily.map((d) => d.total));
  const answerRate = kpis.total ? Math.round((kpis.answered / kpis.total) * 100) : 0;

  const breakdown = [
    { lb: "Répondus", n: kpis.answered, kind: "ok" },
    { lb: "Manqués", n: kpis.missed, kind: "danger" },
    { lb: "Entrants", n: kpis.inbound, kind: "info" },
    { lb: "Sortants", n: kpis.outbound, kind: "magic" },
  ];
  const maxBd = Math.max(1, ...breakdown.map((b) => b.n));

  return (
    <div className="tel-skin">
      <div className="st-page">
        <div className="page-hd">
          <div>
            <h1>Statistiques d&apos;appels</h1>
            <div className="sub">Performance de l&apos;équipe · {days} derniers jours</div>
          </div>
          <div className="actions">
            <div className="seg">
              {PERIODS.map((p) => (
                <button
                  key={p.d}
                  type="button"
                  className={`seg-b ${days === p.d ? "on" : ""}`}
                  onClick={() => setDays(p.d)}
                >
                  {p.l}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* KPI bento */}
        <div
          className="kpi-bento"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", marginBottom: 22 }}
        >
          <div className="kpi">
            <div className="lb">
              <PhoneOutgoing className="ico-xs" />
              Appels
            </div>
            <div className="vl">{kpis.total}</div>
          </div>
          <div className="kpi">
            <div className="lb">
              <CheckCircle2 className="ico-xs" />
              Répondus
            </div>
            <div className="vl">{kpis.answered}</div>
          </div>
          <div className="kpi">
            <div className="lb">
              <PhoneMissed className="ico-xs" />
              Manqués
            </div>
            <div className="vl">{kpis.missed}</div>
          </div>
          <div className="kpi">
            <div className="lb">
              <Clock className="ico-xs" />
              Temps en ligne
            </div>
            <div className="vl" style={{ fontSize: 30 }}>
              {fmtTalk(kpis.totalDuration)}
            </div>
          </div>
          <div className="kpi">
            <div className="lb">
              <Clock className="ico-xs" />
              Durée moy.
            </div>
            <div className="vl" style={{ fontSize: 30 }}>
              {fmtDuration(kpis.avgDuration)}
            </div>
          </div>
          <div className="kpi dark">
            <div className="lb">
              <PhoneIncoming className="ico-xs" />
              Taux de décroché
            </div>
            <div className="vl">
              {answerRate}
              <span className="unit">%</span>
            </div>
          </div>
        </div>

        <div className="st-row2">
          {/* Volume par jour */}
          <div className="card">
            <div className="card-hd">
              <h3>Volume par jour</h3>
              <span className="meta">répondus · manqués</span>
            </div>
            <div className="card-bd">
              {daily.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--text-3)" }}>Aucune donnée.</p>
              ) : (
                <>
                  <div className="st-hours">
                    {daily.map((d) => (
                      <div key={d.date} className="st-hcol">
                        <div className="st-hbars" title={`${d.date} · ${d.total} appels (${d.answered} répondus)`}>
                          <div
                            className="st-hbar out"
                            style={{ height: `${((d.total - d.answered) / maxDay) * 100}%` }}
                          />
                          <div
                            className="st-hbar in"
                            style={{ height: `${(d.answered / maxDay) * 100}%` }}
                          />
                        </div>
                        <div className="st-hlb">{d.date.slice(5)}</div>
                      </div>
                    ))}
                  </div>
                  <div className="st-legend">
                    <span>
                      <i className="in" />
                      Répondus
                    </span>
                    <span>
                      <i className="out" />
                      Non répondus
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Répartition */}
          <div className="card">
            <div className="card-hd">
              <h3>Répartition</h3>
              <span className="meta">{kpis.total} appels</span>
            </div>
            <div className="card-bd">
              <div className="st-dispo">
                {breakdown.map((b) => (
                  <div key={b.lb} className="st-drow">
                    <span className="dl">
                      <span className={`dt ${b.kind}`} />
                      {b.lb}
                    </span>
                    <div className="db">
                      <i className={b.kind} style={{ width: `${(b.n / maxBd) * 100}%` }} />
                    </div>
                    <span className="dn">{b.n}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Leaderboard */}
        <div className="card" style={{ marginTop: 22 }}>
          <div className="card-hd">
            <h3>Performance par agent</h3>
            <span className="meta">équipe</span>
          </div>
          <div>
            <div className="st-lead-hd">
              <span>Agent</span>
              <span>Appels</span>
              <span>En ligne</span>
              <span>Décroché</span>
              <span>Répondus</span>
            </div>
            {agents.length === 0 ? (
              <p style={{ padding: 18, fontSize: 13, color: "var(--text-3)" }}>Aucune donnée agent.</p>
            ) : (
              agents.map((a) => {
                const name = a.name ?? a.agent_id;
                const rate = a.total ? Math.round((a.answered / a.total) * 100) : 0;
                const c = colorOf(name);
                return (
                  <div key={a.agent_id} className="st-lead-row">
                    <span className="ag">
                      <span className="av" style={{ background: c }}>
                        {initials(name)}
                      </span>
                      <span>
                        <span className="n">{name}</span>
                      </span>
                    </span>
                    <span className="v">{a.total}</span>
                    <span className="v mono">{fmtTalk(a.duration)}</span>
                    <span className="v">
                      <span className="mini-bar">
                        <i style={{ width: `${rate}%`, background: c }} />
                      </span>
                      {rate}%
                    </span>
                    <span className="v rdv">{a.answered}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
