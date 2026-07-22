"use client";

import { useEffect, useState, useCallback } from "react";
import { CalendarClock, User, Shield } from "lucide-react";
import { fetchAppointments, type Appointment } from "@/lib/telephony/client";
import { AppointmentDialog } from "./AppointmentDialog";

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Agent's upcoming appointments + a quick "book a RDV" action. */
export function UpcomingAppointments() {
  const [items, setItems] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setItems(await fetchAppointments());
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Rendez-vous à venir</h2>
        <AppointmentDialog defaultTitle="RDV" onBooked={load} />
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun rendez-vous programmé.</p>
      ) : (
        <div className="space-y-2">
          {items.map((a) => (
            <div key={a.id} className="flex items-center gap-3 rounded-md border px-3 py-2">
              <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{a.title}</div>
                <div className="text-xs text-muted-foreground">{formatWhen(a.start_at)}</div>
              </div>
              <span
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                title={a.created_for_role === "admin" ? "Assigné au supérieur" : "Assigné à moi"}
              >
                {a.created_for_role === "admin" ? (
                  <Shield className="h-3 w-3" />
                ) : (
                  <User className="h-3 w-3" />
                )}
                {a.created_for_role === "admin" ? "Admin" : "Moi"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
