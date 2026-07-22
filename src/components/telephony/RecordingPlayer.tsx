"use client";

import { useState } from "react";
import { Play, Loader2, AlertCircle } from "lucide-react";
import { fetchRecordingUrl } from "@/lib/telephony/client";

/**
 * Lazily fetches a signed recording URL on click, then renders an inline audio
 * player. Nothing is requested until the user asks to listen (keeps the journal
 * cheap and avoids minting URLs for calls nobody plays).
 */
export function RecordingPlayer({
  callId,
  status,
}: {
  callId: string;
  status: "none" | "pending" | "stored" | "failed";
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  if (status === "none") return <span className="text-xs text-muted-foreground">—</span>;

  const load = async () => {
    if (url || loading) return;
    setLoading(true);
    setError(false);
    const u = await fetchRecordingUrl(callId);
    if (u) setUrl(u);
    else setError(true);
    setLoading(false);
  };

  if (url) return <audio controls src={url} className="h-8 w-52 max-w-full" />;

  return (
    <button
      type="button"
      onClick={load}
      disabled={loading || status === "pending"}
      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-60"
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : error ? (
        <AlertCircle className="h-3.5 w-3.5 text-destructive" />
      ) : (
        <Play className="h-3.5 w-3.5" />
      )}
      {status === "pending" ? "En attente" : error ? "Indispo." : "Écouter"}
    </button>
  );
}
