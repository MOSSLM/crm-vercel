"use client";

/**
 * Floating softphone widget: a launcher button + a compact panel with a
 * dialpad, manual dialing, and live-call controls. Purely presentational — all
 * state and telephony live in {@link DialerProvider} via `useDialer`.
 */
import { useEffect, useState } from "react";
import {
  Phone,
  PhoneOff,
  PhoneCall,
  Mic,
  MicOff,
  X,
  Delete,
  FlaskConical,
  Radio,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useDialer } from "./DialerProvider";

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

export function SoftphoneWidget() {
  const dialer = useDialer();
  const [manual, setManual] = useState("");
  const [elapsed, setElapsed] = useState(0);

  const { status, mode, muted, activeCall, widgetOpen } = dialer;
  const inCall = status === "incall";
  const connecting = status === "connecting";
  const busy = inCall || connecting;

  // Tick the in-call timer.
  useEffect(() => {
    if (!inCall || !activeCall?.startedAt) {
      setElapsed(0);
      return;
    }
    const started = activeCall.startedAt;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(id);
  }, [inCall, activeCall?.startedAt]);

  if (!dialer.available) return null;

  const pressDigit = (d: string) => {
    if (busy) {
      dialer.sendDigit(d);
    } else {
      setManual((v) => v + d);
    }
  };

  const callManual = () => {
    if (!manual.trim()) return;
    void dialer.dial({ to: manual.trim(), label: manual.trim() });
  };

  return (
    <>
      {/* Launcher */}
      {!widgetOpen && (
        <button
          type="button"
          onClick={dialer.openWidget}
          className="fixed bottom-5 right-5 z-[60] flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:scale-105 hover:shadow-xl"
          aria-label="Ouvrir le téléphone"
        >
          {busy ? <PhoneCall className="h-6 w-6 animate-pulse" /> : <Phone className="h-6 w-6" />}
        </button>
      )}

      {/* Panel */}
      {widgetOpen && (
        <div className="fixed bottom-5 right-5 z-[60] w-[320px] overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
          <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-3">
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4" />
              <span className="text-sm font-semibold">Téléphone</span>
              {mode === "mock" ? (
                <Badge variant="secondary" className="gap-1 text-[10px]">
                  <FlaskConical className="h-3 w-3" /> Simulation
                </Badge>
              ) : (
                <Badge className="gap-1 bg-emerald-600 text-[10px] hover:bg-emerald-600">
                  <Radio className="h-3 w-3" /> En ligne
                </Badge>
              )}
            </div>
            <button
              type="button"
              onClick={dialer.closeWidget}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Fermer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-4">
            {/* Call state */}
            <div className="mb-3 min-h-[52px] rounded-lg bg-muted/40 px-3 py-2 text-center">
              {busy && activeCall ? (
                <>
                  <div className="truncate text-sm font-medium">
                    {activeCall.label ?? activeCall.to}
                  </div>
                  <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                    {connecting ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" /> Connexion…
                      </>
                    ) : (
                      <>En communication · {fmt(elapsed)}</>
                    )}
                  </div>
                </>
              ) : (
                <Input
                  value={manual}
                  onChange={(e) => setManual(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && callManual()}
                  placeholder="+33 6 12 34 56 78"
                  inputMode="tel"
                  className="border-0 bg-transparent text-center text-base shadow-none focus-visible:ring-0"
                />
              )}
            </div>

            {/* Dialpad */}
            <div className="grid grid-cols-3 gap-2">
              {DIGITS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => pressDigit(d)}
                  className="rounded-lg border border-border py-2.5 text-lg font-medium transition hover:bg-muted active:scale-95"
                >
                  {d}
                </button>
              ))}
            </div>

            {/* Controls */}
            <div className="mt-4 flex items-center justify-center gap-3">
              {busy ? (
                <>
                  <Button
                    type="button"
                    variant={muted ? "default" : "outline"}
                    size="icon"
                    onClick={dialer.toggleMute}
                    aria-label={muted ? "Réactiver le micro" : "Couper le micro"}
                  >
                    {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="lg"
                    className="rounded-full px-6"
                    onClick={dialer.hangup}
                  >
                    <PhoneOff className="mr-2 h-4 w-4" /> Raccrocher
                  </Button>
                </>
              ) : (
                <>
                  {manual && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setManual((v) => v.slice(0, -1))}
                      aria-label="Effacer"
                    >
                      <Delete className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="lg"
                    className="rounded-full bg-emerald-600 px-6 hover:bg-emerald-700"
                    onClick={callManual}
                    disabled={!manual.trim() || status === "offline"}
                  >
                    <Phone className="mr-2 h-4 w-4" /> Appeler
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default SoftphoneWidget;
