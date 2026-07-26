"use client";

/**
 * Éditeur de disponibilités : plages hebdo récurrentes par jour (fuseau du
 * planning) + exceptions de dates (congés / horaires spéciaux).
 * Les heures sont saisies en local du planning et stockées en minutes ;
 * la conversion UTC se fait par date au moment du calcul des créneaux.
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarOff, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  deleteOverride,
  fetchSchedule,
  putSchedule,
  upsertOverride,
} from "@/lib/scheduling/client";
import type { DateOverride } from "@/lib/scheduling/types";
import { WEEKDAYS_FR, minutesToTime, timeToMinutes, timezoneOptions } from "./shared";

type DayRanges = { startMinute: number; endMinute: number }[];

export default function AvailabilityEditor() {
  const [timezone, setTimezone] = useState("Europe/Paris");
  const [days, setDays] = useState<Record<number, DayRanges>>({});
  const [overrides, setOverrides] = useState<DateOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Nouvel override
  const [ovDate, setOvDate] = useState("");
  const [ovUnavailable, setOvUnavailable] = useState(true);
  const [ovStart, setOvStart] = useState("09:00");
  const [ovEnd, setOvEnd] = useState("12:00");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchSchedule();
      setTimezone(data.schedule.timezone);
      const byDay: Record<number, DayRanges> = {};
      for (const r of data.rules) {
        (byDay[r.weekday] ??= []).push({ startMinute: r.start_minute, endMinute: r.end_minute });
      }
      for (const arr of Object.values(byDay)) arr.sort((a, b) => a.startMinute - b.startMinute);
      setDays(byDay);
      setOverrides(
        [...data.overrides].sort((a, b) => a.date.localeCompare(b.date)),
      );
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

  const save = async () => {
    const rules = Object.entries(days).flatMap(([weekday, ranges]) =>
      ranges
        .filter((r) => r.endMinute > r.startMinute)
        .map((r) => ({
          weekday: Number(weekday),
          start_minute: r.startMinute,
          end_minute: r.endMinute,
        })),
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

  const setDay = (iso: number, ranges: DayRanges) => {
    setDays((d) => ({ ...d, [iso]: ranges }));
    setDirty(true);
  };

  const addOverride = async () => {
    if (!ovDate) return;
    try {
      await upsertOverride({
        date: ovDate,
        is_unavailable: ovUnavailable,
        ranges: ovUnavailable
          ? []
          : [{ startMinute: timeToMinutes(ovStart), endMinute: timeToMinutes(ovEnd) }],
      });
      toast.success(ovUnavailable ? "Journée bloquée" : "Horaires spéciaux enregistrés");
      setOvDate("");
      await load();
    } catch {
      toast.error("Impossible d'enregistrer l'exception");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-xl border bg-card py-16 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Chargement…
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Plages hebdo */}
      <div className="rounded-xl border bg-card p-4 shadow-sm lg:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="cal-tag text-muted-foreground">Horaires récurrents</h2>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Fuseau</Label>
            <select
              value={timezone}
              onChange={(e) => {
                setTimezone(e.target.value);
                setDirty(true);
              }}
              className="rounded-lg border bg-background px-2 py-1.5 text-sm"
            >
              {timezoneOptions().map((z) => (
                <option key={z} value={z}>
                  {z.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Ces horaires suivent l&apos;heure locale du fuseau choisi — le passage été/hiver ne
          décale jamais vos créneaux.
        </p>

        <div className="mt-4 space-y-3">
          {WEEKDAYS_FR.map(({ iso, label }) => {
            const ranges = days[iso] ?? [];
            const enabled = ranges.length > 0;
            return (
              <div key={iso} className="flex flex-wrap items-start gap-3 border-t pt-3 first:border-t-0 first:pt-0">
                <label className="flex w-28 shrink-0 items-center gap-2 pt-1.5 text-sm font-medium">
                  <Switch
                    checked={enabled}
                    onCheckedChange={(v) =>
                      setDay(iso, v ? [{ startMinute: 540, endMinute: 1080 }] : [])
                    }
                  />
                  {label}
                </label>
                {enabled ? (
                  <div className="flex-1 space-y-2">
                    {ranges.map((r, idx) => (
                      <div key={idx} className="flex flex-wrap items-center gap-2">
                        <Input
                          type="time"
                          className="w-28"
                          value={minutesToTime(r.startMinute)}
                          onChange={(e) => {
                            const arr = [...ranges];
                            arr[idx] = { ...arr[idx], startMinute: timeToMinutes(e.target.value) };
                            setDay(iso, arr);
                          }}
                        />
                        <span className="text-muted-foreground">–</span>
                        <Input
                          type="time"
                          className="w-28"
                          value={minutesToTime(r.endMinute === 1440 ? 1439 : r.endMinute)}
                          onChange={(e) => {
                            const arr = [...ranges];
                            arr[idx] = { ...arr[idx], endMinute: timeToMinutes(e.target.value) };
                            setDay(iso, arr);
                          }}
                        />
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-red-600"
                          onClick={() => setDay(iso, ranges.filter((_, i) => i !== idx))}
                          aria-label="Supprimer la plage"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        {r.endMinute <= r.startMinute ? (
                          <span className="text-xs text-red-600">fin avant début</span>
                        ) : null}
                      </div>
                    ))}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const last = ranges[ranges.length - 1];
                        const start = last ? Math.min(last.endMinute + 120, 1320) : 540;
                        setDay(iso, [...ranges, { startMinute: start, endMinute: Math.min(start + 180, 1440) }]);
                      }}
                    >
                      <Plus className="mr-1 h-4 w-4" /> Ajouter une plage
                    </Button>
                  </div>
                ) : (
                  <p className="pt-1.5 text-sm text-muted-foreground">Indisponible</p>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex justify-end border-t pt-4">
          <Button size="sm" onClick={() => void save()} disabled={saving || !dirty}>
            {saving ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-4 w-4" />
            )}
            Enregistrer
          </Button>
        </div>
      </div>

      {/* Exceptions de dates */}
      <div className="rounded-xl border bg-card p-4 shadow-sm lg:self-start">
        <h2 className="cal-tag text-muted-foreground">Exceptions de dates</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Congés, jours fériés, ou horaires différents un jour précis.
        </p>

        <div className="mt-3 space-y-2 rounded-xl border p-3">
          <Input type="date" value={ovDate} onChange={(e) => setOvDate(e.target.value)} />
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={ovUnavailable} onCheckedChange={setOvUnavailable} />
            Journée entière indisponible
          </label>
          {!ovUnavailable ? (
            <div className="flex items-center gap-2">
              <Input
                type="time"
                className="w-28"
                value={ovStart}
                onChange={(e) => setOvStart(e.target.value)}
              />
              <span className="text-muted-foreground">–</span>
              <Input
                type="time"
                className="w-28"
                value={ovEnd}
                onChange={(e) => setOvEnd(e.target.value)}
              />
            </div>
          ) : null}
          <Button size="sm" className="w-full" onClick={() => void addOverride()} disabled={!ovDate}>
            <Plus className="mr-1 h-4 w-4" /> Ajouter l&apos;exception
          </Button>
        </div>

        <div className="mt-4 space-y-2">
          {overrides.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarOff className="h-4 w-4" /> Aucune exception.
            </p>
          ) : (
            overrides.map((o) => (
              <div
                key={o.date}
                className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {new Intl.DateTimeFormat("fr-FR", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      timeZone: "UTC",
                    }).format(new Date(`${o.date}T00:00:00Z`))}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {o.is_unavailable
                      ? "Indisponible"
                      : (o.ranges ?? [])
                          .map((r) => `${minutesToTime(r.startMinute)}–${minutesToTime(r.endMinute)}`)
                          .join(", ") || "Indisponible"}
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-red-600"
                  onClick={async () => {
                    try {
                      await deleteOverride(o.date);
                      setOverrides((list) => list.filter((x) => x.date !== o.date));
                    } catch {
                      toast.error("Suppression impossible");
                    }
                  }}
                  aria-label="Supprimer l'exception"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
