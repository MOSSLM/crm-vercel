"use client";

import { useEffect, useState, useCallback, useMemo, Fragment } from "react";
import {
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  ArrowLeftRight,
  Voicemail as VoicemailIcon,
  RefreshCw,
} from "lucide-react";
import { fetchCalls, type CallRow, type CallFilters } from "@/lib/telephony/client";
import { CallDetailPanel } from "./CallDetailPanel";

function formatDuration(s: number | null): string {
  if (!s || s <= 0) return "";
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function relTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  if (min < 1440) return `il y a ${Math.round(min / 60)} h`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

function dayLabel(iso: string | null): string {
  if (!iso) return "Plus ancien";
  const d = new Date(iso);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = d.getTime();
  if (t >= startToday) return "Aujourd'hui";
  if (t >= startToday - 86400000) return "Hier";
  if (t >= startToday - 7 * 86400000) return "Cette semaine";
  return "Plus ancien";
}

function counterpart(c: CallRow): string {
  const name = c.contact
    ? [c.contact.first_name, c.contact.last_name].filter(Boolean).join(" ")
    : c.entreprise?.name;
  const number = c.direction === "outbound" ? c.to_e164 : c.from_e164;
  return name || number || "Inconnu";
}

function subline(c: CallRow): string {
  if (c.contact) return c.entreprise?.name ?? "Contact";
  if (c.entreprise) return "Entreprise";
  return "Numéro non identifié";
}

/** answered | voicemail | no-answer | (neutral) — drives the .jr-dir tint. */
function statusClass(c: CallRow): string {
  if (c.disposition === "answered") return "answered";
  if (c.disposition === "voicemail") return "voicemail";
  if (c.disposition === "no_answer" || c.disposition === "failed" || c.disposition === "cancelled")
    return "no-answer";
  return "";
}

function DirectionIcon({ call }: { call: CallRow }) {
  const missed = call.direction === "inbound" && call.disposition === "no_answer";
  if (missed) return <PhoneMissed className="ico-sm" aria-label="Manqué" />;
  if (call.disposition === "voicemail") return <VoicemailIcon className="ico-sm" aria-label="Messagerie" />;
  if (call.direction === "outbound") return <PhoneOutgoing className="ico-sm" aria-label="Sortant" />;
  if (call.direction === "internal") return <ArrowLeftRight className="ico-sm" aria-label="Interne" />;
  return <PhoneIncoming className="ico-sm" aria-label="Entrant" />;
}

const DISPO_PILL: Record<string, { label: string; kind: string }> = {
  answered: { label: "Répondu", kind: "ok" },
  no_answer: { label: "Sans réponse", kind: "danger" },
  busy: { label: "Occupé", kind: "warn" },
  failed: { label: "Échec", kind: "danger" },
  cancelled: { label: "Annulé", kind: "muted" },
  voicemail: { label: "Messagerie", kind: "info" },
};

type FilterId = "all" | "answered" | "rec" | "in";

/**
 * Call journal / history (skin prototype jr-*). Compact selectable list with an
 * inline expandable detail. Used full-page (admin/agent) and scoped to a record
 * (pass entreprise_id / contact_id).
 */
export function CallJournal({ filters = {} }: { filters?: CallFilters }) {
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterId>("all");

  const key = JSON.stringify(filters);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCalls(await fetchCalls(filters));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const rows = await fetchCalls(filters);
      if (active) {
        setCalls(rows);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const recCount = useMemo(() => calls.filter((c) => c.recording_status !== "none").length, [calls]);
  const filterDefs = useMemo(
    () => [
      { id: "all" as const, l: "Tous", n: calls.length },
      { id: "answered" as const, l: "Répondus", n: calls.filter((c) => c.disposition === "answered").length },
      { id: "rec" as const, l: "Enregistrés", n: recCount },
      { id: "in" as const, l: "Entrants", n: calls.filter((c) => c.direction === "inbound").length },
    ],
    [calls, recCount],
  );

  const shown = useMemo(
    () =>
      calls.filter((c) =>
        filter === "all"
          ? true
          : filter === "rec"
            ? c.recording_status !== "none"
            : filter === "in"
              ? c.direction === "inbound"
              : c.disposition === "answered",
      ),
    [calls, filter],
  );

  if (loading)
    return (
      <div className="tel-skin">
        <p style={{ fontSize: 13, color: "var(--text-3)" }}>Chargement…</p>
      </div>
    );
  if (calls.length === 0)
    return (
      <div className="tel-skin">
        <p style={{ fontSize: 13, color: "var(--text-3)" }}>Aucun appel enregistré.</p>
      </div>
    );

  let lastDay: string | null = null;

  return (
    <div className="tel-skin">
      <div className="jr-list" style={{ border: "1px solid var(--border)", borderRadius: 14 }}>
        <div className="jr-list-hd">
          <div>
            <div className="subline">
              {calls.length} appel(s) · {recCount} enregistré(s)
            </div>
          </div>
          <button type="button" className="btn subtle sm icon" onClick={load} title="Actualiser">
            <RefreshCw className="ico-sm" />
          </button>
        </div>

        <div className="jr-filters">
          {filterDefs.map((f) => (
            <button
              key={f.id}
              type="button"
              className="jr-filter"
              aria-selected={f.id === filter}
              onClick={() => setFilter(f.id)}
            >
              {f.l}
              <span className="n">{f.n}</span>
            </button>
          ))}
        </div>

        <div className="jr-rows">
          {shown.map((c) => {
            const day = dayLabel(c.started_at ?? c.created_at);
            const showDay = day !== lastDay;
            lastDay = day;
            const open = expanded === c.id;
            const dur = formatDuration(c.duration_sec);
            const pill = c.disposition ? DISPO_PILL[c.disposition] : null;
            return (
              <Fragment key={c.id}>
                {showDay && <div className="jr-day">{day}</div>}
                <div
                  className="jr-row"
                  aria-selected={open}
                  onClick={() => setExpanded(open ? null : c.id)}
                >
                  <span className={`jr-dir ${statusClass(c)}`}>
                    <DirectionIcon call={c} />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div className="nm">
                      {counterpart(c)}
                      {c.recording_status !== "none" && (
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: "var(--danger)",
                            display: "inline-block",
                            marginLeft: 6,
                          }}
                        />
                      )}
                    </div>
                    <div className="sb">{subline(c)}</div>
                  </div>
                  <div className="jr-row-r">
                    <span className="tm">{relTime(c.started_at ?? c.created_at)}</span>
                    {pill && <span className={`pilltiny ${pill.kind}`}>{pill.label}</span>}
                    {dur && <span className="dur">{dur}</span>}
                  </div>
                </div>
                {open && (
                  <div style={{ padding: "0 16px 14px" }} onClick={(e) => e.stopPropagation()}>
                    <CallDetailPanel callId={c.id} recordingStatus={c.recording_status} />
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
