"use client";

import { useEffect, useState, useCallback } from "react";
import { Volume2, Headphones, Users, Info } from "lucide-react";
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
  return name || number || "Numéro inconnu";
}
function org(c: LiveCall): string {
  return c.contact ? (c.entreprise?.name ?? "") : "";
}
function num(c: LiveCall): string {
  return (c.direction === "outbound" ? c.from_e164 : c.to_e164) ?? "";
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

function LiveWave() {
  return (
    <div className="wave on">
      {Array.from({ length: 34 }).map((_, i) => (
        <span key={i} style={{ animationDelay: `${(i % 8) * 0.1}s` }} />
      ))}
    </div>
  );
}

/** Live supervision (skin prototype sup-*): in-progress calls + team presence. */
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
    const t = setInterval(() => setNow(Date.now()), 1000);
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

  if (loading)
    return (
      <div className="tel-skin">
        <p style={{ fontSize: 13, color: "var(--text-3)" }}>Chargement…</p>
      </div>
    );

  return (
    <div className="tel-skin">
      <div className="sup-page">
        <div className="page-hd">
          <div>
            <h1>Supervision live</h1>
            <div className="sub">
              {live.length} appel(s) en cours · écoute, chuchotement &amp; intervention
            </div>
          </div>
          <div className="actions">
            <span className="sup-live-tag">
              <span className="d" />
              EN DIRECT
            </span>
          </div>
        </div>

        <div className="jr-norec" style={{ marginBottom: 18 }}>
          <Info className="ico-lg" />
          Écoute discrète, chuchotement et intervention se déclenchent par code-fonction depuis le
          softphone (Zadarma n&apos;expose pas d&apos;API REST pour ces actions).
        </div>

        {live.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 22 }}>
            Aucun appel en cours.
          </p>
        ) : (
          <div className="sup-grid">
            {live.map((c) => {
              const active = Boolean(c.answered_at);
              const name = agentName(c.agent_id);
              return (
                <div key={c.id} className={`sup-card ${active ? "active" : "ringing"}`}>
                  <div className="sup-card-hd">
                    <span className="av" style={{ background: colorOf(name) }}>
                      {initials(name)}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="an">{name}</div>
                      <div className="ar">{num(c)}</div>
                    </div>
                    <span className={`sup-state ${active ? "active" : "ringing"}`}>
                      {active ? (
                        <>
                          <span className="rd" />
                          En ligne
                        </>
                      ) : (
                        <>
                          <span className="rd ring" />
                          Sonnerie
                        </>
                      )}
                    </span>
                  </div>

                  <div className="sup-conn">
                    <div className="sup-with">
                      <span className="lb">en appel avec</span>
                      <span className="nm">{counterpart(c)}</span>
                      {org(c) && <span className="org">{org(c)}</span>}
                    </div>
                    {active && (
                      <span className="sup-dur">{elapsed(c.answered_at ?? c.started_at, now)}</span>
                    )}
                  </div>

                  {active && (
                    <div className="sup-wave">
                      <LiveWave />
                    </div>
                  )}

                  <div className="sup-foot">
                    <div className="sup-actions">
                      <button
                        type="button"
                        className="sup-act"
                        disabled
                        title="Depuis le softphone (code-fonction)"
                      >
                        <Volume2 className="ico-xs" />
                        Écouter
                      </button>
                      <button
                        type="button"
                        className="sup-act whisper"
                        disabled
                        title="Depuis le softphone (code-fonction)"
                      >
                        <Headphones className="ico-xs" />
                        Chuchoter
                      </button>
                      <button
                        type="button"
                        className="sup-act barge"
                        disabled
                        title="Depuis le softphone (code-fonction)"
                      >
                        <Users className="ico-xs" />
                        Intervenir
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="card">
          <div className="card-hd">
            <h3>Présence de l&apos;équipe</h3>
            <span className="meta">Supabase Realtime</span>
          </div>
          <div className="sup-presence">
            {agents.length === 0 ? (
              <p style={{ padding: 18, fontSize: 13, color: "var(--text-3)" }}>Aucun agent.</p>
            ) : (
              agents.map((a) => {
                const name = a.full_name || a.email || a.id;
                const isBusy = busy.has(a.id);
                return (
                  <div
                    key={a.id}
                    className="sup-pres-row"
                    style={{ gridTemplateColumns: "30px 1fr auto" }}
                  >
                    <span className="av" style={{ background: colorOf(name) }}>
                      {initials(name)}
                    </span>
                    <span className="n">{name}</span>
                    <span className={`pres-badge ${isBusy ? "in-call" : "online"}`}>
                      <span className="d" />
                      {isBusy ? "En appel" : "Disponible"}
                    </span>
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
