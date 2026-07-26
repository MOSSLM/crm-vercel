"use client";

/**
 * Disponibilités — portage de `ScreenAvail` (rdv-screens-c.jsx) : timeline
 * hebdomadaire avec bandes déplaçables (échelle 7 h → 21 h), panneau
 * latéral (volume, exceptions de dates, sources d'occupation).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  deleteOverride,
  fetchConnections,
  fetchSchedule,
  putSchedule,
  upsertOverride,
  type CalendarConnection,
} from "@/lib/scheduling/client";
import type { DateOverride } from "@/lib/scheduling/types";
import { Blk, Btn, Chip, Pill, Row, Stack, Sw, minToHHMM } from "../rdv/atoms";
import { Icon } from "../rdv/Icon";
import { SectionHeader } from "./CalShell";
import { timezoneOptions } from "./shared";

const T0 = 420; // 7 h
const T1 = 1260; // 21 h
const TSPAN = T1 - T0;
const pct = (m: number) => ((m - T0) / TSPAN) * 100;

const DAYS = [
  { iso: 1, lb: "Lundi" },
  { iso: 2, lb: "Mardi" },
  { iso: 3, lb: "Mercredi" },
  { iso: 4, lb: "Jeudi" },
  { iso: 5, lb: "Vendredi" },
  { iso: 6, lb: "Samedi" },
  { iso: 7, lb: "Dimanche" },
];

type Range = [number, number];
type DayState = { iso: number; lb: string; ranges: Range[] };

export default function AvailabilityEditor() {
  const [days, setDays] = useState<DayState[]>(DAYS.map((d) => ({ ...d, ranges: [] })));
  const [timezone, setTimezone] = useState("Europe/Paris");
  const [overrides, setOverrides] = useState<DateOverride[]>([]);
  const [connections, setConnections] = useState<CalendarConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [ovDate, setOvDate] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, conn] = await Promise.all([
        fetchSchedule(),
        fetchConnections().catch(() => ({ connections: [] as CalendarConnection[], google_available: false })),
      ]);
      setTimezone(data.schedule.timezone);
      const byDay = new Map<number, Range[]>();
      for (const r of data.rules) {
        const arr = byDay.get(r.weekday) ?? [];
        arr.push([r.start_minute, r.end_minute]);
        byDay.set(r.weekday, arr);
      }
      setDays(
        DAYS.map((d) => ({
          ...d,
          ranges: (byDay.get(d.iso) ?? []).sort((a, b) => a[0] - b[0]),
        })),
      );
      setOverrides([...data.overrides].sort((a, b) => a.date.localeCompare(b.date)));
      setConnections(conn.connections);
      setDirty(false);
    } catch (err) {
      toast.error("Chargement impossible", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const mutate = (iso: number, ranges: Range[]) => {
    setDays((ds) => ds.map((d) => (d.iso === iso ? { ...d, ranges } : d)));
    setDirty(true);
  };

  const toggleDay = (iso: number) => {
    const d = days.find((x) => x.iso === iso);
    if (!d) return;
    mutate(iso, d.ranges.length ? [] : [[540, 1080]]);
  };

  const save = async () => {
    const rules = days.flatMap((d) =>
      d.ranges
        .filter((r) => r[1] > r[0])
        .map((r) => ({ weekday: d.iso, start_minute: r[0], end_minute: r[1] })),
    );
    setSaving(true);
    try {
      await putSchedule({ timezone, rules });
      toast.success("Disponibilités enregistrées");
      setDirty(false);
    } catch (err) {
      toast.error("Enregistrement impossible", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const totalH = useMemo(
    () => days.reduce((s, d) => s + d.ranges.reduce((a, r) => a + (r[1] - r[0]), 0), 0) / 60,
    [days],
  );

  const blockDate = async () => {
    if (!ovDate) return;
    try {
      await upsertOverride({ date: ovDate, is_unavailable: true, ranges: [] });
      toast.success("Journée bloquée");
      setOvDate("");
      await load();
    } catch {
      toast.error("Impossible d'enregistrer l'exception");
    }
  };

  const google = connections.find((c) => c.provider === "google");

  return (
    <>
      <SectionHeader
        title="Disponibilités"
        subtitle="Vos horaires réels. Tout est calculé dans le fuseau du planning — les changements d'heure ne décalent jamais vos créneaux."
        actions={
          <Btn kind="accent" ic="check" disabled={saving || !dirty} onClick={() => void save()}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Btn>
        }
      />

      <Row style={{ marginBottom: 14, gap: 10 }}>
        <Chip ic="check" color="var(--ok)">
          planning par défaut
        </Chip>
        <span style={{ flex: 1 }} />
        <Row style={{ gap: 6 }}>
          <span className="rv-lb">Fuseau</span>
          <select
            className="rv-in mono"
            style={{ width: 190 }}
            value={timezone}
            onChange={(e) => {
              setTimezone(e.target.value);
              setDirty(true);
            }}
          >
            {timezoneOptions().map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </Row>
      </Row>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16, alignItems: "start" }}>
        <div className="rv-list" style={{ padding: "14px 16px 16px" }}>
          <div className="rv-scale">
            <span />
            <div className="ticks">
              {[7, 9, 11, 13, 15, 17, 19, 21].map((h) => (
                <span key={h}>{h}h</span>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="rv-empty" style={{ padding: 30 }}>
              Chargement…
            </div>
          ) : (
            days.map((d) => {
              const on = d.ranges.length > 0;
              return (
                <div key={d.iso} className={`rv-dayrow ${on ? "" : "off"}`.trim()}>
                  <div className="dl">
                    <Sw on={on} onClick={() => toggleDay(d.iso)} />
                    {d.lb}
                  </div>
                  <div className={`rv-track ${on ? "" : "off"}`.trim()}>
                    {on ? (
                      <>
                        {[9, 11, 13, 15, 17, 19].map((h) => (
                          <i key={h} className="g" style={{ left: `${pct(h * 60)}%` }} />
                        ))}
                        {d.ranges.map((r, i) => (
                          <div
                            key={i}
                            className="rv-band"
                            style={{
                              left: `${pct(r[0])}%`,
                              width: `${((r[1] - r[0]) / TSPAN) * 100}%`,
                            }}
                            title={`${minToHHMM(r[0])} – ${minToHHMM(r[1])}`}
                          >
                            <i className="gr l" />
                            <span>
                              {minToHHMM(r[0])} – {minToHHMM(r[1])}
                            </span>
                            <i className="gr r" />
                          </div>
                        ))}
                      </>
                    ) : (
                      <span className="offtx">Indisponible</span>
                    )}
                  </div>
                  <Row style={{ gap: 3, marginLeft: 8 }}>
                    <Btn
                      kind="ghost"
                      size="xs"
                      ic="plus"
                      title="Ajouter une plage"
                      onClick={() => {
                        const last = d.ranges[d.ranges.length - 1];
                        const start = last ? Math.min(last[1] + 60, 1200) : 540;
                        mutate(d.iso, [...d.ranges, [start, Math.min(start + 180, 1260)]]);
                      }}
                    />
                    {d.ranges.length ? (
                      <Btn
                        kind="ghost"
                        size="xs"
                        ic="trash"
                        title="Retirer la dernière plage"
                        onClick={() => mutate(d.iso, d.ranges.slice(0, -1))}
                      />
                    ) : null}
                  </Row>
                </div>
              );
            })
          )}

          {/* Édition fine des heures */}
          {!loading ? (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
              <div className="rv-lb" style={{ marginBottom: 8 }}>
                Horaires précis
              </div>
              <Stack gap={7}>
                {days
                  .filter((d) => d.ranges.length)
                  .map((d) => (
                    <Row key={d.iso} style={{ gap: 8, flexWrap: "wrap" }}>
                      <span style={{ width: 74, fontSize: 12, color: "var(--text-2)" }}>{d.lb}</span>
                      {d.ranges.map((r, i) => (
                        <Row key={i} style={{ gap: 4 }}>
                          <input
                            className="rv-in mono"
                            type="time"
                            style={{ width: 92 }}
                            value={minToHHMM(r[0])}
                            onChange={(e) => {
                              const [h, m] = e.target.value.split(":").map(Number);
                              const next = [...d.ranges];
                              next[i] = [h * 60 + m, r[1]];
                              mutate(d.iso, next);
                            }}
                          />
                          <span style={{ color: "var(--text-4)" }}>–</span>
                          <input
                            className="rv-in mono"
                            type="time"
                            style={{ width: 92 }}
                            value={minToHHMM(r[1] === 1440 ? 1439 : r[1])}
                            onChange={(e) => {
                              const [h, m] = e.target.value.split(":").map(Number);
                              const next = [...d.ranges];
                              next[i] = [r[0], h * 60 + m];
                              mutate(d.iso, next);
                            }}
                          />
                        </Row>
                      ))}
                    </Row>
                  ))}
              </Stack>
            </div>
          ) : null}

          <Row style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)", gap: 14 }}>
            <Row style={{ gap: 6 }}>
              <i style={{ width: 12, height: 8, borderRadius: 3, background: "var(--accent)" }} />
              <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>Ouvert à la réservation</span>
            </Row>
            <span style={{ flex: 1 }} />
            <Btn
              kind="ghost"
              size="xs"
              ic="copy"
              onClick={() => {
                const monday = days.find((d) => d.iso === 1);
                if (!monday?.ranges.length) {
                  toast.error("Lundi n'a aucune plage à copier");
                  return;
                }
                setDays((ds) =>
                  ds.map((d) =>
                    d.iso >= 2 && d.iso <= 5
                      ? { ...d, ranges: monday.ranges.map((r) => [...r] as Range) }
                      : d,
                  ),
                );
                setDirty(true);
                toast.success("Lundi copié sur mardi → vendredi");
              }}
            >
              Copier lundi sur la semaine
            </Btn>
          </Row>
        </div>

        <Stack gap={14}>
          <Blk title="Cette semaine" ic="clock">
            <Row style={{ gap: 16 }}>
              {(
                [
                  [`${totalH.toFixed(0)} h`, "ouvertes"],
                  [`${days.filter((d) => d.ranges.length).length}`, "jours actifs"],
                  [`${overrides.length}`, "exceptions"],
                ] as [string, string][]
              ).map(([v, l]) => (
                <div key={l}>
                  <div style={{ fontFamily: "var(--font-serif)", fontSize: 26, lineHeight: 1 }}>
                    {v}
                  </div>
                  <div
                    style={{
                      fontSize: 10.5,
                      color: "var(--text-3)",
                      textTransform: "uppercase",
                      letterSpacing: ".05em",
                      marginTop: 3,
                    }}
                  >
                    {l}
                  </div>
                </div>
              ))}
            </Row>
          </Blk>

          <Blk title="Exceptions de dates" ic="calOff">
            <Stack gap={9}>
              <Row style={{ gap: 6 }}>
                <input
                  className="rv-in"
                  type="date"
                  style={{ flex: 1 }}
                  value={ovDate}
                  onChange={(e) => setOvDate(e.target.value)}
                />
                <Btn kind="outline" size="sm" ic="plus" disabled={!ovDate} onClick={() => void blockDate()}>
                  Bloquer
                </Btn>
              </Row>
              <div>
                {overrides.length ? (
                  overrides.map((o) => (
                    <div key={o.date} className="rv-ovr">
                      <span className="dt">
                        {new Intl.DateTimeFormat("fr-FR", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          timeZone: "UTC",
                        }).format(new Date(`${o.date}T00:00:00Z`))}
                      </span>
                      <span className="st">
                        {o.is_unavailable
                          ? "journée entière"
                          : (o.ranges ?? [])
                              .map((r) => `${minToHHMM(r.startMinute)}–${minToHHMM(r.endMinute)}`)
                              .join(", ")}
                      </span>
                      {o.is_unavailable ? (
                        <Pill kind="danger" dot>
                          fermé
                        </Pill>
                      ) : (
                        <Pill kind="warn" dot>
                          partiel
                        </Pill>
                      )}
                      <Btn
                        kind="ghost"
                        size="xs"
                        ic="trash"
                        onClick={async () => {
                          try {
                            await deleteOverride(o.date);
                            setOverrides((l) => l.filter((x) => x.date !== o.date));
                          } catch {
                            toast.error("Suppression impossible");
                          }
                        }}
                      />
                    </div>
                  ))
                ) : (
                  <div className="rv-empty">Aucune exception.</div>
                )}
              </div>
            </Stack>
          </Blk>

          <Blk title="Sources d'occupation" ic="plug">
            <Stack gap={7}>
              {(
                [
                  [
                    "google",
                    "Google Agenda",
                    google?.account_email ?? "non connecté",
                    !!google,
                  ],
                  ["calendar", "Calendrier CRM", "évènements + récurrences", true],
                ] as [string, string, string, boolean][]
              ).map(([ic, n, s, on]) => (
                <Row key={n} style={{ gap: 9 }}>
                  <span
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 6,
                      background: on ? "var(--ok-tint)" : "var(--bg-2)",
                      color: on ? "var(--ok)" : "var(--text-4)",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon name={ic} className="ico-xs" />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{n}</div>
                    <div
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        color: "var(--text-3)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {s}
                    </div>
                  </div>
                  {on ? (
                    <Icon name="check" className="ico-sm" style={{ color: "var(--ok)" }} />
                  ) : null}
                </Row>
              ))}
            </Stack>
          </Blk>
        </Stack>
      </div>
    </>
  );
}
