"use client";

/**
 * Recent call list. Reads /api/twilio/calls (admins see all, agents see their
 * own). Optionally scoped to a contact/company/opportunity for entity timelines.
 */
import { useEffect, useState } from "react";
import { PhoneIncoming, PhoneOutgoing, PhoneMissed } from "lucide-react";
import { authedFetch } from "@/utils/authedFetch";
import { CallDetailDialog } from "@/components/telephone/CallDetailDialog";

export interface CallRow {
  id: string;
  direction: "inbound" | "outbound";
  from_e164: string | null;
  to_e164: string | null;
  status: string;
  disposition: string | null;
  started_at: string;
  duration_seconds: number | null;
}

const MISSED = new Set(["no-answer", "busy", "failed", "canceled"]);

const fmtDuration = (s: number | null) => {
  if (!s) return "—";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m${sec.toString().padStart(2, "0")}` : `${sec}s`;
};

export function CallHistory({
  contactId,
  entrepriseId,
  opportuniteId,
  limit = 25,
  refreshKey,
}: {
  contactId?: string;
  entrepriseId?: number;
  opportuniteId?: string;
  limit?: number;
  refreshKey?: number;
}) {
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const qs = new URLSearchParams({ limit: String(limit) });
      if (contactId) qs.set("contactId", contactId);
      if (entrepriseId != null) qs.set("entrepriseId", String(entrepriseId));
      if (opportuniteId) qs.set("opportuniteId", opportuniteId);
      try {
        const res = await authedFetch(`/api/twilio/calls?${qs.toString()}`);
        const data = res.ok ? ((await res.json()) as CallRow[]) : [];
        if (!cancelled) setCalls(data);
      } catch {
        if (!cancelled) setCalls([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contactId, entrepriseId, opportuniteId, limit, refreshKey]);

  if (loading) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Chargement…</p>;
  }
  if (calls.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Aucun appel pour l&apos;instant.</p>;
  }

  return (
    <>
    <ul className="divide-y divide-border">
      {calls.map((c) => {
        const missed = MISSED.has(c.status) || MISSED.has(c.disposition ?? "");
        const Icon = missed
          ? PhoneMissed
          : c.direction === "inbound"
            ? PhoneIncoming
            : PhoneOutgoing;
        const counterpart = c.direction === "inbound" ? c.from_e164 : c.to_e164;
        return (
          <li
            key={c.id}
            className="flex cursor-pointer items-center gap-3 py-2.5 transition hover:bg-muted/40"
            onClick={() => {
              setSelectedCallId(c.id);
              setDialogOpen(true);
            }}
          >
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                missed ? "bg-red-100 text-red-600" : "bg-muted text-muted-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{counterpart ?? "Inconnu"}</div>
              <div className="text-xs text-muted-foreground">
                {new Date(c.started_at).toLocaleString("fr-FR", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                · {fmtDuration(c.duration_seconds)}
              </div>
            </div>
            <span className="shrink-0 text-xs capitalize text-muted-foreground">{c.status}</span>
          </li>
        );
      })}
    </ul>
    <CallDetailDialog
      callId={selectedCallId}
      open={dialogOpen}
      onOpenChange={setDialogOpen}
    />
    </>
  );
}

export default CallHistory;
