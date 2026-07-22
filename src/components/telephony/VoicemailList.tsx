"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Voicemail as VoicemailIcon, MessageSquare, UserPlus, Sparkles } from "lucide-react";
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
function initials(name: string): string {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "?") + (p[1]?.[0] ?? "")).toUpperCase();
}

/** Voicemail inbox (prototype vm-* skin): missed inbound calls with a recording. */
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

  if (loading) return <div className="tel-skin"><p className="text-sm text-muted-foreground">Chargement…</p></div>;
  if (items.length === 0)
    return <div className="tel-skin"><p style={{ color: "var(--text-3)", fontSize: 13 }}>Aucun message vocal.</p></div>;

  const unheard = items.filter((v) => v.recording_status !== "none").length;

  return (
    <div className="tel-skin">
      <p style={{ color: "var(--text-3)", fontSize: 12.5, marginBottom: 12 }}>
        {items.length} appel(s) manqué(s) · {unheard} avec message · transcription à la demande
      </p>
      <div className="vm-list">
        {items.map((v) => {
          const name = who(v);
          const known = Boolean(v.contact || v.entreprise);
          const isNew = v.recording_status !== "none";
          return (
            <div key={v.id} className={`vm-card${isNew ? " new" : ""}`}>
              <div className="vm-l">
                {isNew && <span className="vm-dot" />}
                {known ? (
                  <span className="av" style={{ background: "var(--accent)" }}>
                    {initials(name)}
                  </span>
                ) : (
                  <span className="av" style={{ background: "var(--text-3)" }}>
                    <VoicemailIcon style={{ width: 18, height: 18 }} />
                  </span>
                )}
              </div>
              <div className="vm-body">
                <div className="vm-hd">
                  <div className="vm-who">
                    <span className="nm">{name}</span>
                    <span className="ph">{v.from_e164}</span>
                    {!known && (
                      <span className="vm-new-lead">
                        <UserPlus style={{ width: 12, height: 12 }} /> Nouveau lead
                      </span>
                    )}
                  </div>
                  <div className="vm-meta">
                    <span className="tm">{formatWhen(v.started_at ?? v.created_at)}</span>
                  </div>
                </div>

                <div className="vm-player">
                  <RecordingPlayer callId={v.id} status={v.recording_status} />
                </div>

                {v.transcript_status === "done" && (
                  <div className="vm-trans">
                    <Sparkles style={{ width: 14, height: 14, color: "var(--magic)" }} />
                    <span>Transcription disponible</span>
                  </div>
                )}

                <div className="vm-actions">
                  <ClickToCallButton
                    to={v.from_e164}
                    contactId={v.contact_id}
                    entrepriseId={v.entreprise_id}
                    size="sm"
                    variant="outline"
                    label="Rappeler"
                  />
                  {v.contact_id ? (
                    <Link href={`/espace-agent/contacts/${v.contact_id}`} className="btn outline xs">
                      <MessageSquare style={{ width: 14, height: 14 }} /> Fiche
                    </Link>
                  ) : v.entreprise_id ? (
                    <Link href={`/espace-agent/entreprises/${v.entreprise_id}`} className="btn outline xs">
                      <MessageSquare style={{ width: 14, height: 14 }} /> Fiche
                    </Link>
                  ) : (
                    <span className="btn ghost xs">
                      <UserPlus style={{ width: 14, height: 14 }} /> Inconnu
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
