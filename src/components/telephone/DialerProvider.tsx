"use client";

/**
 * Softphone runtime — owns the Twilio Voice Device and exposes a simple dialer
 * API to the whole app via context (`useDialer`). Mounted once, globally, for
 * staff users; renders the floating {@link SoftphoneWidget}.
 *
 * Two runtimes behind one API:
 *   - live: a real Twilio Device (WebRTC). Requires Voice credentials.
 *   - mock: no Device; calls are simulated locally and logged through
 *     /api/twilio/mock-call so the CRM records them like real calls.
 *
 * The Twilio SDK is imported dynamically inside an effect so it never evaluates
 * during SSR (it touches browser globals at import time).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Call, Device } from "@twilio/voice-sdk";
import { toast } from "sonner";
import { useAuth } from "@/components/AuthContext";
import { authedFetch } from "@/utils/authedFetch";
import { SoftphoneWidget } from "./Softphone";

export type DialerStatus =
  | "offline" // no device yet / not staff
  | "ready" // registered, idle
  | "connecting" // placing a call
  | "incall" // call in progress
  | "error";

export type DialerMode = "live" | "mock";

export interface ActiveCall {
  to: string;
  direction: "outbound" | "inbound";
  label?: string;
  contactId?: string;
  entrepriseId?: number;
  opportuniteId?: string;
  callSid?: string;
  startedAt: number | null; // epoch ms when answered
}

export interface DialTarget {
  to: string;
  label?: string;
  contactId?: string;
  entrepriseId?: number;
  opportuniteId?: string;
}

export interface IncomingInfo {
  from: string;
}

interface DialerContextValue {
  available: boolean; // staff + widget mounted
  status: DialerStatus;
  mode: DialerMode;
  muted: boolean;
  activeCall: ActiveCall | null;
  incoming: IncomingInfo | null;
  widgetOpen: boolean;
  openWidget: () => void;
  closeWidget: () => void;
  dial: (target: DialTarget) => Promise<void>;
  hangup: () => void;
  acceptIncoming: () => void;
  rejectIncoming: () => void;
  transfer: (to: string) => Promise<void>;
  toggleMute: () => void;
  sendDigit: (digit: string) => void;
}

const DialerContext = createContext<DialerContextValue | null>(null);

export const useDialer = (): DialerContextValue => {
  const ctx = useContext(DialerContext);
  if (!ctx) {
    // Safe no-op fallback so click-to-call buttons never crash when the
    // provider isn't mounted (e.g. client portal).
    return {
      available: false,
      status: "offline",
      mode: "mock",
      muted: false,
      activeCall: null,
      incoming: null,
      widgetOpen: false,
      openWidget: () => {},
      closeWidget: () => {},
      dial: async () => {
        toast.error("Le téléphone n'est pas disponible ici.");
      },
      hangup: () => {},
      acceptIncoming: () => {},
      rejectIncoming: () => {},
      transfer: async () => {},
      toggleMute: () => {},
      sendDigit: () => {},
    };
  }
  return ctx;
};

const isStaff = (role?: string) => role === "admin" || role === "freelance";

export function DialerProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const staff = isAuthenticated && isStaff(user?.role);

  const [status, setStatus] = useState<DialerStatus>("offline");
  const [mode, setMode] = useState<DialerMode>("mock");
  const [muted, setMuted] = useState(false);
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [incoming, setIncoming] = useState<IncomingInfo | null>(null);
  const [widgetOpen, setWidgetOpen] = useState(false);

  const deviceRef = useRef<Device | null>(null);
  const callRef = useRef<Call | null>(null);
  const incomingRef = useRef<Call | null>(null);
  const mockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeCallRef = useRef<ActiveCall | null>(null);
  activeCallRef.current = activeCall;

  // --- token helper -------------------------------------------------------
  const fetchToken = useCallback(async (): Promise<string | null> => {
    const res = await authedFetch("/api/twilio/token");
    if (res.status === 503) return null; // not configured → mock
    if (!res.ok) throw new Error(`token ${res.status}`);
    const data = (await res.json()) as { token: string };
    return data.token;
  }, []);

  // --- device init --------------------------------------------------------
  useEffect(() => {
    if (!staff) {
      setStatus("offline");
      return;
    }
    let cancelled = false;

    (async () => {
      let token: string | null = null;
      try {
        token = await fetchToken();
      } catch {
        token = null;
      }
      if (cancelled) return;

      if (!token) {
        setMode("mock");
        setStatus("ready");
        return;
      }

      try {
        const { Device } = await import("@twilio/voice-sdk");
        if (cancelled) return;
        const device = new Device(token, {
          codecPreferences: ["opus", "pcmu"] as never,
          logLevel: "error",
        });
        device.on("registered", () => !cancelled && setStatus("ready"));
        device.on("error", (err: { message?: string }) => {
          console.error("[softphone] device error:", err?.message);
          if (!cancelled) setStatus("error");
        });
        device.on("tokenWillExpire", async () => {
          try {
            const fresh = await fetchToken();
            if (fresh) device.updateToken(fresh);
          } catch {
            /* keep current token; next call will refetch */
          }
        });
        device.on("incoming", (call: Call) => {
          incomingRef.current = call;
          const fromParam = (call.parameters?.From as string | undefined) ?? "Appel entrant";
          setIncoming({ from: fromParam });
          setWidgetOpen(true);
          const clearIncoming = () => {
            if (incomingRef.current === call) {
              incomingRef.current = null;
              setIncoming(null);
            }
          };
          call.on("cancel", clearIncoming);
          call.on("disconnect", clearIncoming);
          call.on("reject", clearIncoming);
        });
        await device.register();
        deviceRef.current = device;
        setMode("live");
        if (!cancelled) setStatus("ready");
      } catch (e) {
        console.error("[softphone] init failed:", e);
        if (!cancelled) {
          setMode("mock");
          setStatus("ready");
        }
      }
    })();

    return () => {
      cancelled = true;
      if (mockTimerRef.current) clearTimeout(mockTimerRef.current);
      try {
        callRef.current?.disconnect();
      } catch {
        /* ignore */
      }
      try {
        deviceRef.current?.destroy();
      } catch {
        /* ignore */
      }
      deviceRef.current = null;
      callRef.current = null;
    };
  }, [staff, fetchToken]);

  // --- reset helpers ------------------------------------------------------
  const endLocalState = useCallback(() => {
    setActiveCall(null);
    setMuted(false);
    setStatus(deviceRef.current || mode === "mock" ? "ready" : "offline");
  }, [mode]);

  const wireCallEnd = useCallback(
    (call: Call) => {
      const onEnd = () => {
        callRef.current = null;
        endLocalState();
      };
      call.on("disconnect", onEnd);
      call.on("cancel", onEnd);
      call.on("reject", onEnd);
      call.on("error", (err: { message?: string }) => {
        toast.error(`Erreur d'appel: ${err?.message ?? "inconnue"}`);
        onEnd();
      });
    },
    [endLocalState],
  );

  const logMockCall = useCallback(
    async (call: ActiveCall, durationSeconds: number) => {
      try {
        await authedFetch("/api/twilio/mock-call", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: call.to,
            direction: call.direction,
            contactId: call.contactId,
            entrepriseId: call.entrepriseId,
            opportuniteId: call.opportuniteId,
            durationSeconds,
            status: "completed",
          }),
        });
      } catch {
        /* logging is best-effort */
      }
    },
    [],
  );

  // --- dial ---------------------------------------------------------------
  const dial = useCallback(
    async (target: DialTarget) => {
      if (!staff) {
        toast.error("Réservé aux utilisateurs internes.");
        return;
      }
      if (status === "connecting" || status === "incall") {
        toast.info("Un appel est déjà en cours.");
        return;
      }
      const to = target.to.replace(/[^\d+]/g, "");
      if (!to) {
        toast.error("Numéro invalide.");
        return;
      }

      const call: ActiveCall = {
        to,
        direction: "outbound",
        label: target.label,
        contactId: target.contactId,
        entrepriseId: target.entrepriseId,
        opportuniteId: target.opportuniteId,
        startedAt: null,
      };
      setActiveCall(call);
      setWidgetOpen(true);
      setStatus("connecting");

      // Mock runtime: simulate connect → in-call. Logged on hangup.
      if (mode === "mock" || !deviceRef.current) {
        mockTimerRef.current = setTimeout(() => {
          setActiveCall((prev) => (prev ? { ...prev, startedAt: Date.now() } : prev));
          setStatus("incall");
          toast.success(`Appel (simulé) vers ${target.label ?? to}`);
        }, 700);
        return;
      }

      // Live runtime.
      try {
        const twilioCall = await deviceRef.current.connect({
          params: {
            To: to,
            ...(target.contactId ? { contactId: target.contactId } : {}),
            ...(target.entrepriseId != null ? { entrepriseId: String(target.entrepriseId) } : {}),
            ...(target.opportuniteId ? { opportuniteId: target.opportuniteId } : {}),
          },
        });
        callRef.current = twilioCall;
        twilioCall.on("accept", () => {
          const sid = twilioCall.parameters?.CallSid;
          setActiveCall((prev) => (prev ? { ...prev, startedAt: Date.now(), callSid: sid } : prev));
          setStatus("incall");
        });
        wireCallEnd(twilioCall);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "inconnue";
        toast.error(`Impossible de passer l'appel: ${msg}`);
        endLocalState();
      }
    },
    [staff, status, mode, endLocalState, wireCallEnd],
  );

  // --- hangup -------------------------------------------------------------
  const hangup = useCallback(() => {
    const current = activeCallRef.current;
    if (mockTimerRef.current) {
      clearTimeout(mockTimerRef.current);
      mockTimerRef.current = null;
    }
    if ((mode === "mock" || !callRef.current) && current) {
      const duration = current.startedAt ? Math.round((Date.now() - current.startedAt) / 1000) : 0;
      void logMockCall(current, duration);
      endLocalState();
      return;
    }
    try {
      callRef.current?.disconnect();
    } catch {
      /* ignore */
    }
    callRef.current = null;
    endLocalState();
  }, [mode, logMockCall, endLocalState]);

  // --- mute / DTMF --------------------------------------------------------
  const toggleMute = useCallback(() => {
    const next = !muted;
    setMuted(next);
    try {
      callRef.current?.mute(next);
    } catch {
      /* mock: no-op */
    }
  }, [muted]);

  const sendDigit = useCallback((digit: string) => {
    try {
      callRef.current?.sendDigits(digit);
    } catch {
      /* mock: no-op */
    }
  }, []);

  // --- incoming call ------------------------------------------------------
  const acceptIncoming = useCallback(() => {
    const call = incomingRef.current;
    if (!call) return;
    const from = incoming?.from ?? "Appel entrant";
    try {
      call.accept();
    } catch {
      /* ignore */
    }
    callRef.current = call;
    incomingRef.current = null;
    setIncoming(null);
    setActiveCall({
      to: from,
      direction: "inbound",
      label: from,
      callSid: call.parameters?.CallSid,
      startedAt: Date.now(),
    });
    setStatus("incall");
    wireCallEnd(call);
  }, [incoming, wireCallEnd]);

  // --- transfer (cold) ----------------------------------------------------
  const transfer = useCallback(
    async (to: string) => {
      const sid = activeCallRef.current?.callSid;
      if (!sid || mode === "mock") {
        toast.info("Transfert indisponible en simulation.");
        return;
      }
      const target = to.replace(/[^\d+]/g, "");
      if (!target) {
        toast.error("Numéro de transfert invalide.");
        return;
      }
      try {
        const res = await authedFetch("/api/twilio/transfer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callSid: sid, to: target }),
        });
        if (!res.ok) throw new Error(String(res.status));
        toast.success(`Appel transféré vers ${target}.`);
      } catch {
        toast.error("Transfert impossible.");
      }
    },
    [mode],
  );

  const rejectIncoming = useCallback(() => {
    try {
      incomingRef.current?.reject();
    } catch {
      /* ignore */
    }
    incomingRef.current = null;
    setIncoming(null);
  }, []);

  const value = useMemo<DialerContextValue>(
    () => ({
      available: !!staff,
      status,
      mode,
      muted,
      activeCall,
      incoming,
      widgetOpen,
      openWidget: () => setWidgetOpen(true),
      closeWidget: () => setWidgetOpen(false),
      dial,
      hangup,
      acceptIncoming,
      rejectIncoming,
      transfer,
      toggleMute,
      sendDigit,
    }),
    [
      staff,
      status,
      mode,
      muted,
      activeCall,
      incoming,
      widgetOpen,
      dial,
      hangup,
      acceptIncoming,
      rejectIncoming,
      transfer,
      toggleMute,
      sendDigit,
    ],
  );

  return (
    <DialerContext.Provider value={value}>
      {children}
      {staff && <SoftphoneWidget />}
    </DialerContext.Provider>
  );
}

export default DialerProvider;
