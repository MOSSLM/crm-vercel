"use client";

import { useEffect, useState, useCallback } from "react";
import { Fragment } from "react";
import {
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  ArrowLeftRight,
  RefreshCw,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { fetchCalls, type CallRow, type CallFilters } from "@/lib/telephony/client";
import { RecordingPlayer } from "./RecordingPlayer";
import { CallDetailPanel } from "./CallDetailPanel";

function formatDuration(s: number | null): string {
  if (!s || s <= 0) return "—";
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function counterpart(c: CallRow): string {
  const name = c.contact
    ? [c.contact.first_name, c.contact.last_name].filter(Boolean).join(" ")
    : c.entreprise?.name;
  const number = c.direction === "outbound" ? c.to_e164 : c.from_e164;
  return name || number || "—";
}

function DirectionIcon({ call }: { call: CallRow }) {
  const missed = call.direction === "inbound" && call.disposition === "no_answer";
  if (missed) return <PhoneMissed className="h-4 w-4 text-destructive" aria-label="Manqué" />;
  if (call.direction === "outbound")
    return <PhoneOutgoing className="h-4 w-4 text-info" aria-label="Sortant" />;
  if (call.direction === "internal")
    return <ArrowLeftRight className="h-4 w-4 text-muted-foreground" aria-label="Interne" />;
  return <PhoneIncoming className="h-4 w-4 text-success" aria-label="Entrant" />;
}

const DISPOSITION_LABELS: Record<string, string> = {
  answered: "Répondu",
  no_answer: "Sans réponse",
  busy: "Occupé",
  failed: "Échec",
  cancelled: "Annulé",
  voicemail: "Messagerie",
};

function DispositionBadge({ disposition }: { disposition: string | null }) {
  if (!disposition) return <span className="text-xs text-muted-foreground">—</span>;
  const tone =
    disposition === "answered"
      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
      : disposition === "failed" || disposition === "cancelled"
        ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
        : disposition === "voicemail"
          ? "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300"
          : "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
      {DISPOSITION_LABELS[disposition] ?? disposition}
    </span>
  );
}

/**
 * Call journal / history table. Used both as the full page (admin sees all,
 * agent sees own) and scoped to a record (pass entreprise_id / contact_id).
 */
export function CallJournal({ filters = {} }: { filters?: CallFilters }) {
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

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

  if (loading) return <p className="text-sm text-muted-foreground">Chargement…</p>;
  if (calls.length === 0)
    return <p className="text-sm text-muted-foreground">Aucun appel enregistré.</p>;

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Actualiser
        </button>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="w-8 px-2 py-2" />
              <th className="px-3 py-2 font-medium">Sens</th>
              <th className="px-3 py-2 font-medium">Interlocuteur</th>
              <th className="px-3 py-2 font-medium">État</th>
              <th className="px-3 py-2 font-medium">Durée</th>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Enregistrement</th>
            </tr>
          </thead>
          <tbody>
            {calls.map((c) => {
              const open = expanded === c.id;
              return (
                <Fragment key={c.id}>
                  <tr
                    className="cursor-pointer border-b last:border-0 hover:bg-muted/30"
                    onClick={() => setExpanded(open ? null : c.id)}
                  >
                    <td className="px-2 py-2 text-muted-foreground">
                      {open ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <DirectionIcon call={c} />
                    </td>
                    <td className="px-3 py-2 font-medium">{counterpart(c)}</td>
                    <td className="px-3 py-2">
                      <DispositionBadge disposition={c.disposition} />
                    </td>
                    <td className="px-3 py-2 tabular-nums">{formatDuration(c.duration_sec)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                      {formatDate(c.started_at ?? c.created_at)}
                    </td>
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <RecordingPlayer callId={c.id} status={c.recording_status} />
                    </td>
                  </tr>
                  {open && (
                    <tr className="border-b last:border-0">
                      <td colSpan={7} className="px-3 py-3">
                        <CallDetailPanel callId={c.id} recordingStatus={c.recording_status} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
