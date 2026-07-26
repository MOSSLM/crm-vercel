"use client";

/**
 * Statistiques — portage de `ScreenStats` (rdv-screens-c.jsx) : KPIs (dont
 * une tuile sombre), histogramme des réservations par semaine, heatmap des
 * créneaux les plus demandés et répartitions par type / par canal.
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { fetchStats, type SchedulingStats } from "@/lib/scheduling/client";
import { useAuth } from "@/components/AuthContext";
import { Blk, Btn, Row, Seg, Stack } from "../rdv/atoms";
import { Icon } from "../rdv/Icon";
import { SectionHeader } from "./CalShell";

const WD = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const HOURS = [8, 9, 10, 11, 12, 14, 15, 16, 17, 18];

const SRC_LABELS: Record<string, string> = {
  public: "Page publique",
  embed: "Site web (embed)",
  agent: "Calé par un agent",
  api: "API",
};

const weekLabel = (weekKey: string): string =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${weekKey}T00:00:00Z`),
  );

export default function InsightsDashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [days, setDays] = useState(30);
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

  const weeks = stats?.by_week.slice(-6) ?? [];
  const maxWeek = Math.max(1, ...weeks.map((w) => w.total));
  const maxType = Math.max(1, ...(stats?.by_event_type ?? []).map((t) => t.count));
  const slotMap = new Map(
    (stats?.by_slot ?? []).map((s) => [`${s.weekday}-${s.hour}`, s.count] as const),
  );
  const maxSlot = Math.max(1, ...(stats?.by_slot ?? []).map((s) => s.count));
  const srcTotal = (stats?.by_source ?? []).reduce((a, s) => a + s.count, 0);

  return (
    <>
      <SectionHeader
        title="Statistiques"
        subtitle={`${days} derniers jours · ${teamWide ? "toute l'équipe" : "vos rendez-vous"}.`}
        actions={
          <>
            <Seg
              opts={[
                { id: "30", lb: "30 j" },
                { id: "90", lb: "90 j" },
                { id: "365", lb: "12 mois" },
              ]}
              val={String(days)}
              set={(v) => setDays(Number(v))}
              lg
            />
            {isAdmin ? (
              <Btn
                kind={teamWide ? "primary" : "outline"}
                ic="users"
                onClick={() => setTeamWide((v) => !v)}
              >
                {teamWide ? "Toute l'équipe" : "Mes RDV"}
              </Btn>
            ) : null}
          </>
        }
      />

      {loading || !stats ? (
        <div className="rv-empty" style={{ padding: 40 }}>
          Chargement…
        </div>
      ) : (
        <>
          <div className="rv-kpis">
            <div className="rv-kpi dark">
              <div className="k">
                <Icon name="calCheck" className="ico-xs" />
                Réservations
              </div>
              <div className="v">{stats.totals.total_past}</div>
              <div className="d">sur la période analysée</div>
            </div>
            <div className="rv-kpi ok">
              <div className="k">
                <Icon name="check" className="ico-xs" />
                Tenus
              </div>
              <div className="v">{stats.totals.held_past}</div>
              <div className="d">sur {stats.totals.total_past} passés</div>
            </div>
            <div className="rv-kpi">
              <div className="k">
                <Icon name="ban" className="ico-xs" />
                Annulés / refusés
              </div>
              <div className="v">{stats.totals.cancelled_past}</div>
              <div className="d">{stats.totals.cancellation_rate} % de la période</div>
            </div>
            <div className="rv-kpi warn">
              <div className="k">
                <Icon name="hourglass" className="ico-xs" />À venir
              </div>
              <div className="v">{stats.totals.upcoming}</div>
              <div className="d">
                {stats.totals.pending ? `+ ${stats.totals.pending} à valider` : "rien à valider"}
              </div>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.35fr 1fr",
              gap: 16,
              marginBottom: 16,
            }}
          >
            <div className="card">
              <div className="card-hd">
                <h3>Réservations par semaine</h3>
                <span className="meta">{weeks.length} semaines</span>
              </div>
              <div className="card-bd">
                {weeks.length ? (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: `repeat(${weeks.length},1fr)`,
                      gap: 12,
                      alignItems: "end",
                      height: 168,
                      padding: "10px 0 4px",
                    }}
                  >
                    {weeks.map((w, i) => (
                      <div
                        key={w.week}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: 7,
                          height: "100%",
                          justifyContent: "flex-end",
                        }}
                      >
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 11,
                            color: "var(--text-2)",
                          }}
                        >
                          {w.total}
                        </span>
                        <div
                          style={{
                            width: "100%",
                            maxWidth: 52,
                            height: `${Math.max(2, (w.total / maxWeek) * 100)}%`,
                            background:
                              i === weeks.length - 1 ? "var(--accent)" : "var(--bg-3)",
                            borderRadius: "5px 5px 0 0",
                          }}
                        />
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 10.5,
                            color: "var(--text-3)",
                          }}
                        >
                          {weekLabel(w.week)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rv-empty">Pas encore de données.</div>
                )}
              </div>
            </div>

            <Blk title="Créneaux les plus demandés" ic="grid">
              <div className="rv-heat">
                <span />
                {WD.map((w) => (
                  <div key={w} className="hw">
                    {w[0]}
                  </div>
                ))}
                {HOURS.map((h) => (
                  <div key={h} style={{ display: "contents" }}>
                    <div className="hh">{h}h</div>
                    {WD.map((w, d) => {
                      const n = slotMap.get(`${d + 1}-${h}`) ?? 0;
                      const v = n / maxSlot;
                      return (
                        <div
                          key={w}
                          className="hc"
                          style={{
                            background: n
                              ? `color-mix(in oklab, var(--accent) ${Math.round(
                                  Math.max(0.15, v) * 90,
                                )}%, var(--bg-3))`
                              : "var(--bg-3)",
                          }}
                          title={`${w} ${h}h · ${n} réservation${n > 1 ? "s" : ""}`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 10, lineHeight: 1.5 }}>
                Densité des réservations par jour et par heure — utile pour ouvrir des créneaux là
                où la demande se concentre.
              </div>
            </Blk>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Blk title="Par type d'évènement" ic="calCog">
              {stats.by_event_type.length ? (
                <Stack gap={10}>
                  {stats.by_event_type.map((t) => (
                    <div key={t.label}>
                      <Row style={{ justifyContent: "space-between", marginBottom: 4 }}>
                        <Row style={{ gap: 7 }}>
                          <i
                            style={{
                              width: 7,
                              height: 7,
                              borderRadius: 2,
                              background: "var(--accent)",
                            }}
                          />
                          <span style={{ fontSize: 12 }}>{t.label}</span>
                        </Row>
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 11,
                            color: "var(--text-3)",
                          }}
                        >
                          {t.count}
                        </span>
                      </Row>
                      <div style={{ height: 5, background: "var(--bg-3)", borderRadius: 999 }}>
                        <i
                          style={{
                            display: "block",
                            height: "100%",
                            width: `${(t.count / maxType) * 100}%`,
                            background: "var(--accent)",
                            borderRadius: 999,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </Stack>
              ) : (
                <div className="rv-empty">Pas encore de données.</div>
              )}
            </Blk>

            <Blk title="Par canal de réservation" ic="target">
              {stats.by_source.length ? (
                <Stack gap={0}>
                  {stats.by_source.map((s, i) => (
                    <Row
                      key={s.label}
                      style={{
                        padding: "9px 0",
                        borderTop: i ? "1px solid var(--border)" : 0,
                        gap: 10,
                      }}
                    >
                      <span
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 6,
                          background: "var(--bg-2)",
                          color: "var(--text-3)",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Icon
                          name={
                            s.label === "agent" ? "phone" : s.label === "embed" ? "code" : "globe"
                          }
                          className="ico-xs"
                        />
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 500 }}>
                          {SRC_LABELS[s.label] ?? s.label}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", width: 44 }}>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>{s.count}</div>
                        <div
                          style={{
                            fontSize: 9.5,
                            color: "var(--text-4)",
                            textTransform: "uppercase",
                          }}
                        >
                          résas
                        </div>
                      </div>
                      <div style={{ textAlign: "right", width: 44 }}>
                        <div
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 13,
                            color: "var(--text-2)",
                          }}
                        >
                          {srcTotal ? Math.round((s.count / srcTotal) * 100) : 0}%
                        </div>
                        <div
                          style={{
                            fontSize: 9.5,
                            color: "var(--text-4)",
                            textTransform: "uppercase",
                          }}
                        >
                          part
                        </div>
                      </div>
                    </Row>
                  ))}
                </Stack>
              ) : (
                <div className="rv-empty">Pas encore de données.</div>
              )}
            </Blk>
          </div>
        </>
      )}
    </>
  );
}
