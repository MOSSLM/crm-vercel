"use client";

import { useEffect, useState } from "react";
import { Icon, Pill } from "./DemIcon";
import { authedFetch } from "@/utils/authedFetch";
import { fetchCalls, type CallRow } from "@/lib/telephony/client";

type Row = {
  id: string;
  at: string;
  k: "call" | "email" | "wa" | "linkedin" | "note";
  dir: "in" | "out";
  label: string;
  text?: string;
  meta?: string;
  callOut?: "answered" | "voicemail" | "missed";
};

type LogRow = {
  id: string;
  channel?: "email" | "whatsapp" | "linkedin" | "note";
  subject: string;
  body_text?: string;
  to_email?: string;
  to_name?: string;
  status: string;
  sent_at: string;
};

const ICON: Record<Row["k"], string> = {
  call: "phone",
  email: "mail",
  wa: "whatsapp",
  linkedin: "linkedin",
  note: "note",
};

const CALLOUT: Record<string, string> = {
  answered: "répondu",
  voicemail: "répondeur",
  missed: "pas de réponse",
};

const dayKey = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = d.getTime();
  if (t >= start) return "aujourd'hui";
  if (t >= start - 86400000) return "hier";
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" }).format(d);
};

const hm = (iso: string) => {
  try {
    return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  } catch {
    return "";
  }
};

function callRow(c: CallRow): Row {
  const out =
    c.disposition === "answered"
      ? "answered"
      : c.disposition === "voicemail"
        ? "voicemail"
        : "missed";
  const dur = c.duration_sec && c.duration_sec > 0
    ? `${Math.floor(c.duration_sec / 60)}:${String(c.duration_sec % 60).padStart(2, "0")}`
    : null;
  return {
    id: `call-${c.id}`,
    at: c.started_at ?? c.created_at,
    k: "call",
    dir: c.direction === "inbound" ? "in" : "out",
    label: c.direction === "inbound" ? "Appel entrant" : "Appel sortant",
    meta: dur ? `durée ${dur}` : undefined,
    callOut: out,
  };
}

function logRow(l: LogRow): Row {
  const k = l.channel === "whatsapp" ? "wa" : l.channel === "linkedin" ? "linkedin" : l.channel === "note" ? "note" : "email";
  const label = k === "wa" ? "WhatsApp envoyé" : k === "linkedin" ? "Message LinkedIn" : k === "note" ? "Note" : "Email envoyé";
  return {
    id: `log-${l.id}`,
    at: l.sent_at,
    k,
    dir: "out",
    label: k === "note" ? l.subject || "Note" : label,
    text: k === "note" ? l.body_text : l.body_text || l.subject,
    meta: k === "email" ? l.to_email : undefined,
  };
}

/** L'historique complet de l'entreprise — appels et messages dans le même fil. */
export function DemHisto({ entrepriseId, companyName, refreshKey }: { entrepriseId: number; companyName: string; refreshKey: number }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [f, setF] = useState("all");

  useEffect(() => {
    let active = true;
    setRows(null);
    (async () => {
      try {
        const [calls, res] = await Promise.all([
          fetchCalls({ entreprise_id: entrepriseId }),
          authedFetch(`/api/agent/history?entreprise_id=${entrepriseId}`)
            .then((r) => r.json())
            .catch(() => ({ logs: [] })),
        ]);
        if (!active) return;
        const logs = ((res?.logs ?? []) as LogRow[]).filter((l) => !!l.sent_at);
        setRows(
          [...calls.map(callRow), ...logs.map(logRow)].sort(
            (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
          ),
        );
      } catch {
        if (active) setRows([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [entrepriseId, refreshKey]);

  const keep = (r: Row) =>
    f === "all" ? true : f === "msg" ? ["wa", "email", "linkedin"].includes(r.k) : f === "call" ? r.k === "call" : r.k === "note";
  const shown = (rows ?? []).filter(keep);
  let lastDay: string | null = null;

  return (
    <section className="dm-his" id="messages-history">
      <div className="dm-his-h">
        <Icon name="layers" className="ico-sm" style={{ color: "var(--text-3)" }} />
        <span className="ti">Historique — {companyName}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-3)" }}>
          {(rows ?? []).length} événements
        </span>
        <span className="fl">
          {([["all", "Tout"], ["msg", "Messages"], ["call", "Appels"], ["note", "Notes"]] as [string, string][]).map(
            ([id, lb]) => (
              <button key={id} className="dm-chip" aria-pressed={f === id} onClick={() => setF(id)}>
                {lb}
              </button>
            ),
          )}
        </span>
      </div>
      <div className="dm-hb">
        {rows === null && (
          <div style={{ padding: "14px", fontSize: 12, color: "var(--text-3)" }}>Chargement…</div>
        )}
        {rows !== null && shown.length === 0 && (
          <div style={{ padding: "14px", fontSize: 12, color: "var(--text-3)" }}>
            Aucun échange enregistré pour l&apos;instant.
          </div>
        )}
        {shown.map((r) => {
          const d = dayKey(r.at);
          const showDay = d !== lastDay;
          lastDay = d;
          return (
            <div key={r.id}>
              {showDay && (
                <div className="dm-hday">
                  <span className="l">{d}</span>
                  <span className="ln" />
                </div>
              )}
              <div className="dm-hr" data-k={r.k} data-dir={r.dir}>
                <span className="h">{hm(r.at)}</span>
                <span className="ic">
                  <Icon name={ICON[r.k]} className="ico-xs" />
                </span>
                <div className="bd">
                  <div className="tp">
                    <b>{r.label}</b>
                    {r.callOut && (
                      <Pill kind={r.callOut === "answered" ? "ok" : r.callOut === "voicemail" ? "warn" : "danger"}>
                        {CALLOUT[r.callOut]}
                      </Pill>
                    )}
                  </div>
                  {r.text && <div className={`tx ${r.k === "wa" ? "qt" : ""}`.trim()}>{r.text}</div>}
                  {r.meta && <div className="mt">{r.meta}</div>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
