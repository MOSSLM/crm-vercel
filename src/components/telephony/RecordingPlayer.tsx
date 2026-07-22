"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause, Loader2, AlertCircle, Download, Disc3 } from "lucide-react";
import { fetchRecordingUrl } from "@/lib/telephony/client";

type Status = "none" | "pending" | "stored" | "failed";

function fmt(s: number): string {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}

/** Deterministic bar height (%) so the waveform is stable across renders. */
function barH(i: number, seed: number): number {
  return 20 + (Math.abs(Math.sin(i * 12.9898 + seed * 4.14) * 43) % 60);
}

/**
 * Lazily fetches a signed recording URL on first play, then drives a real
 * <audio> element behind the prototype's player skin (jr-player / vm-player).
 * Nothing is requested until the user presses play.
 */
export function RecordingPlayer({
  callId,
  status,
  variant = "jr",
}: {
  callId: string;
  status: Status;
  variant?: "jr" | "vm";
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [wantPlay, setWantPlay] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);

  // Once the src is set and we wanted to play, start playback.
  useEffect(() => {
    if (url && wantPlay && audioRef.current) {
      void audioRef.current.play().catch(() => setError(true));
      setWantPlay(false);
    }
  }, [url, wantPlay]);

  if (status === "none") return null;

  const seed = callId.length + callId.charCodeAt(0);
  const bars = variant === "jr" ? 64 : 44;
  const pct = dur > 0 ? (t / dur) * 100 : 0;

  const toggle = async () => {
    const a = audioRef.current;
    if (url && a) {
      if (playing) a.pause();
      else void a.play().catch(() => setError(true));
      return;
    }
    if (loading || status === "pending") return;
    setLoading(true);
    setError(false);
    const u = await fetchRecordingUrl(callId);
    setLoading(false);
    if (u) {
      setUrl(u);
      setWantPlay(true);
    } else {
      setError(true);
    }
  };

  const PlayIcon = loading ? Loader2 : error ? AlertCircle : playing ? Pause : Play;
  const playIconCls = variant === "jr" ? "ico-lg" : "ico-sm";

  const audioEl = (
    <audio
      ref={audioRef}
      src={url ?? undefined}
      onPlay={() => setPlaying(true)}
      onPause={() => setPlaying(false)}
      onEnded={() => setPlaying(false)}
      onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
      onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
      style={{ display: "none" }}
    />
  );

  const waveBars = () =>
    Array.from({ length: bars }).map((_, i) => (
      <span
        key={i}
        className={(i / bars) * 100 <= pct ? "on" : ""}
        style={{ height: `${barH(i, seed)}%` }}
      />
    ));

  // Voicemail variant: children of an existing .vm-player flex row.
  if (variant === "vm") {
    return (
      <>
        <button
          type="button"
          className="vm-play"
          onClick={toggle}
          disabled={loading || status === "pending"}
          title={status === "pending" ? "En attente" : "Écouter"}
        >
          <PlayIcon className={playIconCls} style={loading ? { animation: "spin 1s linear infinite" } : undefined} />
        </button>
        <div className="vm-wave">{waveBars()}</div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-3)" }}>
          {url ? `${fmt(t)} / ${fmt(dur)}` : status === "pending" ? "en attente" : error ? "indispo." : "écouter"}
        </span>
        {audioEl}
      </>
    );
  }

  // Journal / detail variant: full player card.
  return (
    <div className="jr-player">
      <button
        type="button"
        className="jr-play"
        onClick={toggle}
        disabled={loading || status === "pending"}
        title={status === "pending" ? "En attente" : "Écouter"}
      >
        <PlayIcon className={playIconCls} style={loading ? { animation: "spin 1s linear infinite" } : undefined} />
      </button>
      <div className="jr-player-mid">
        <div className="jr-waveform">{waveBars()}</div>
        <div className="jr-player-meta">
          <span className="tm">
            {fmt(t)} / {fmt(dur)}
          </span>
          <span className="rec-tag">
            <Disc3 className="ico-xs" />
            {status === "pending"
              ? "Enregistrement en attente"
              : error
                ? "Enregistrement indisponible"
                : "Enregistré · consentement diffusé"}
          </span>
          <span className="spd">1×</span>
        </div>
      </div>
      {url ? (
        <a
          href={url}
          download
          className="btn outline sm icon"
          title="Télécharger"
          onClick={(e) => e.stopPropagation()}
        >
          <Download className="ico-sm" />
        </a>
      ) : (
        <span className="btn outline sm icon" style={{ opacity: 0.5 }} title="Télécharger">
          <Download className="ico-sm" />
        </span>
      )}
      {audioEl}
    </div>
  );
}
