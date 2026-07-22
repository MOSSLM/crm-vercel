"use client";

import { useEffect, useState, useCallback } from "react";
import { PhoneIncoming, PhoneOutgoing, Radio, Info } from "lucide-react";
import { authedFetch } from "@/utils/authedFetch";
import { supabase } from "@/utils/supabase/client";

interface LiveCall {
  id: string;
  direction: string;
  from_e164: string | null;
  to_e164: string | null;
  agent_id: string | null;
  started_at: string | null;
  answered_at: string | null;
  entreprise?: { id: number; name: string | null } | null;
  contact?: { id: string; first_name: string | null; last_name: string | null } | null;
}
interface Agent {
  id: string;
  full_name: string | null;
  email: string | null;
}

function elapsed(fromIso: string | null, now: number): string {
  if (!fromIso) return "0:00";
  const s = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function counterpart(c: LiveCall): string {
  const name = c.contact
    ? [c.contact.first_name, c.contact.last_name].filter(Boolean).join(" ")
    : c.entreprise?.name;
  const number = c.direction === "outbound" ? c.to_e164 : c.from_e164;
  return name || number || "—";
}

export function Supervision() {
  const [live, setLive] = useState<LiveCall[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    const res = await authedFetch("/api/telephony/supervision");
    const json = await res.json().catch(() => null);
    if (res.ok && json) {
      setLive(json.live ?? []);
      setAgents(json.agents ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    // tick the live timers
    const t = setInterval(() => setNow(Date.now()), 1000);
    // refresh the feed on any call change
    const channel = supabase
      .channel("telephony-supervision")
      .on("postgres_changes", { event: "*", schema: "public", table: "calls" }, () => void load())
      .subscribe();
    return () => {
      clearInterval(t);
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const agentName = (id: string | null) => {
    const a = agents.find((x) => x.id === id);
    return a ? a.full_name || a.email || a.id : "Agent";
  };
  const busy = new Set(live.map((c) => c.agent_id).filter(Boolean) as string[]);

  if (loading) return <p className="text-sm text-muted-foreground">Chargement…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-red-600 dark:bg-red-950 dark:text-red-300">
          <Radio className="h-3.5 w-3.5" /> EN DIRECT
        </span>
        <span className="text-muted-foreground">{live.length} appel(s) en cours</span>
      </div>

      <div className="flex items-start gap-2 rounded-md border bg-[var(--surface-2)] p-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Écoute discrète, chuchotement et intervention se font par code-fonction depuis le
          softphone (Zadarma n’expose pas d’API REST pour ces actions).
        </span>
      </div>

      {live.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun appel en cours.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {live.map((c) => (
            <div key={c.id} className="rounded-lg border p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold">{agentName(c.agent_id)}</span>
                {c.direction === "outbound" ? (
                  <PhoneOutgoing className="h-4 w-4 text-info" />
                ) : (
                  <PhoneIncoming className="h-4 w-4 text-success" />
                )}
              </div>
              <div className="text-sm text-muted-foreground">avec {counterpart(c)}</div>
              <div className="mt-2 flex items-center justify-between">
                <span className="font-mono text-sm tabular-nums">
                  {elapsed(c.answered_at ?? c.started_at, now)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {c.answered_at ? "en ligne" : "sonnerie"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg border p-4">
        <h2 className="mb-3 text-sm font-semibold">Présence de l’équipe</h2>
        <div className="space-y-1">
          {agents.map((a) => (
            <div key={a.id} className="flex items-center justify-between py-1 text-sm">
              <span>{a.full_name || a.email}</span>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                  busy.has(a.id)
                    ? "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                    : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                }`}
              >
                {busy.has(a.id) ? "En appel" : "Disponible"}
              </span>
            </div>
          ))}
          {agents.length === 0 && (
            <p className="text-sm text-muted-foreground">Aucun agent.</p>
          )}
        </div>
      </div>
    </div>
  );
}
