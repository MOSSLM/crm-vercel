"use client";

import { useEffect, useState, useCallback } from "react";
import { CalendarClock, Shield, User } from "lucide-react";
import { fetchAppointments, type Appointment } from "@/lib/telephony/client";
import { AppointmentDialog } from "./AppointmentDialog";

function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long" });
}
function hm(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

/** Team calendar (admin): every upcoming appointment, grouped by day. */
export function TeamCalendar() {
  const [items, setItems] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setItems(await fetchAppointments());
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = items.reduce<Record<string, Appointment[]>>((acc, a) => {
    const k = dayKey(a.start_at);
    (acc[k] ||= []).push(a);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{items.length} rendez-vous à venir</p>
        <AppointmentDialog defaultTitle="RDV équipe" onBooked={load} />
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun rendez-vous programmé.</p>
      ) : (
        <div className="space-y-5">
          {Object.entries(groups).map(([day, appts]) => (
            <div key={day}>
              <h3 className="mb-2 text-sm font-semibold capitalize">{day}</h3>
              <div className="space-y-2">
                {appts.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 rounded-md border px-3 py-2">
                    <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="w-14 shrink-0 font-mono text-sm">{hm(a.start_at)}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{a.title}</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      {a.created_for_role === "admin" ? (
                        <Shield className="h-3 w-3" />
                      ) : (
                        <User className="h-3 w-3" />
                      )}
                      {a.created_for_role === "admin" ? "Admin" : "Agent"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
