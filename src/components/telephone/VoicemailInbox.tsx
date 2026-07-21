"use client";

/** Voicemail inbox: list messages, play them, mark as listened. */
import { useCallback, useEffect, useState } from "react";
import { Voicemail as VoicemailIcon, Check } from "lucide-react";
import { authedFetch } from "@/utils/authedFetch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Voicemail {
  id: string;
  from_e164: string | null;
  recording_url: string | null;
  duration_seconds: number | null;
  transcription: string | null;
  listened: boolean;
  created_at: string;
}

export function VoicemailInbox() {
  const [items, setItems] = useState<Voicemail[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch("/api/twilio/voicemails");
      if (res.ok) {
        const data = (await res.json()) as { voicemails: Voicemail[] };
        setItems(data.voicemails);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const markListened = async (id: string) => {
    setItems((prev) => prev.map((v) => (v.id === id ? { ...v, listened: true } : v)));
    await authedFetch("/api/twilio/voicemails", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, listened: true }),
    });
  };

  if (loading) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Chargement…</p>;
  }
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Aucun message vocal.</p>;
  }

  return (
    <ul className="divide-y divide-border">
      {items.map((v) => (
        <li key={v.id} className="flex flex-wrap items-center gap-3 py-3">
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
              v.listened ? "bg-muted text-muted-foreground" : "bg-amber-100 text-amber-600"
            }`}
          >
            <VoicemailIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm font-medium">
              {v.from_e164 ?? "Inconnu"}
              {!v.listened && <Badge className="text-[10px]">Nouveau</Badge>}
            </div>
            <div className="text-xs text-muted-foreground">
              {new Date(v.created_at).toLocaleString("fr-FR", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
              {v.duration_seconds ? ` · ${v.duration_seconds}s` : ""}
            </div>
            {v.transcription && (
              <p className="mt-1 text-xs italic text-muted-foreground">“{v.transcription}”</p>
            )}
            {v.recording_url && (
              <audio
                controls
                preload="none"
                src={`${v.recording_url}.mp3`}
                className="mt-2 h-8 w-full max-w-xs"
                onPlay={() => !v.listened && void markListened(v.id)}
              />
            )}
          </div>
          {!v.listened && (
            <Button variant="ghost" size="sm" onClick={() => markListened(v.id)} className="gap-1">
              <Check className="h-4 w-4" /> Lu
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

export default VoicemailInbox;
