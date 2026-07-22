"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Voicemail as VoicemailIcon, MessageSquare, UserPlus } from "lucide-react";
import { fetchVoicemails, type VoicemailRow } from "@/lib/telephony/client";
import { RecordingPlayer } from "./RecordingPlayer";
import { ClickToCallButton } from "./ClickToCallButton";

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function who(v: VoicemailRow): string {
  const name = v.contact
    ? [v.contact.first_name, v.contact.last_name].filter(Boolean).join(" ")
    : v.entreprise?.name;
  return name || v.from_e164 || "Numéro inconnu";
}

/** Voicemail inbox: missed inbound calls with any recording the caller left. */
export function VoicemailList() {
  const [items, setItems] = useState<VoicemailRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const rows = await fetchVoicemails();
      if (active) {
        setItems(rows);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (loading) return <p className="text-sm text-muted-foreground">Chargement…</p>;
  if (items.length === 0)
    return <p className="text-sm text-muted-foreground">Aucun message vocal.</p>;

  const unheard = items.filter((v) => v.recording_status !== "none").length;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {items.length} appel(s) manqué(s) · {unheard} avec message · transcription à la demande
      </p>
      {items.map((v) => {
        const known = Boolean(v.contact || v.entreprise);
        return (
          <div key={v.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <VoicemailIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{who(v)}</span>
                {!known && (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                    Nouveau lead
                  </span>
                )}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {v.from_e164} · {formatWhen(v.started_at ?? v.created_at)}
              </div>
              <div className="mt-2">
                <RecordingPlayer callId={v.id} status={v.recording_status} />
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <ClickToCallButton
                to={v.from_e164}
                contactId={v.contact_id}
                entrepriseId={v.entreprise_id}
                size="sm"
                variant="outline"
              />
              {v.contact_id ? (
                <Link
                  href={`/espace-agent/contacts/${v.contact_id}`}
                  className="inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs hover:bg-muted"
                >
                  <MessageSquare className="h-3.5 w-3.5" /> Fiche
                </Link>
              ) : v.entreprise_id ? (
                <Link
                  href={`/espace-agent/entreprises/${v.entreprise_id}`}
                  className="inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs hover:bg-muted"
                >
                  <MessageSquare className="h-3.5 w-3.5" /> Fiche
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs text-muted-foreground">
                  <UserPlus className="h-3.5 w-3.5" /> Inconnu
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
