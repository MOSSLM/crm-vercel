"use client";

import "./tel-skin.css";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/AuthContext";
import { supabase } from "@/utils/supabase/client";
import { authedFetch } from "@/utils/authedFetch";
import { placeCallback } from "@/lib/telephony/client";
import { toE164, phoneSuffix } from "@/lib/telephony/phone";
import { ZadarmaWidget } from "./ZadarmaWidget";
import { SoftphonePanel } from "./SoftphonePanel";
import { webphone, useWebphone, type WebphoneState } from "./zadarmaWebphone";
import { useSoftphoneWidgetHidden } from "@/hooks/useSoftphoneWidgetHidden";

export interface DialInput {
  to: string;
  contactId?: string | null;
  entrepriseId?: number | null;
  opportuniteId?: string | null;
}

/** Best-effort CRM match for a live call's counterpart number. */
export interface CallMatch {
  who: string | null;
  contactId: string | null;
  entrepriseId: number | null;
}

interface TelephonyProfile {
  configured: boolean;
  hasExtension: boolean;
  sip: string | null;
  call_mode: "browser" | "callback";
}

interface TelephonyContextValue {
  profile: TelephonyProfile | null;
  calling: boolean;
  /** Live softphone state (in-browser WebRTC), or the idle default. */
  phone: WebphoneState;
  /** CRM record matched to the current call's counterpart, if any. */
  match: CallMatch | null;
  dial: (input: DialInput) => Promise<void>;
  hangup: () => void;
  answer: () => void;
  reject: () => void;
  sendDtmf: (digit: string) => void;
  toggleMute: () => void;
}

const TelephonyContext = createContext<TelephonyContextValue | null>(null);

/** Throws if used outside a CallProvider. */
export function useTelephony(): TelephonyContextValue {
  const ctx = useContext(TelephonyContext);
  if (!ctx) throw new Error("useTelephony must be used within a CallProvider");
  return ctx;
}

/** Returns the context, or null when no CallProvider is mounted (safe fallback). */
export function useTelephonyOptional(): TelephonyContextValue | null {
  return useContext(TelephonyContext);
}

/** Best-effort lookup of a CRM contact/company by the last significant digits. */
async function matchNumber(number: string): Promise<CallMatch> {
  const empty: CallMatch = { who: null, contactId: null, entrepriseId: null };
  const suffix = phoneSuffix(number);
  if (suffix.length < 6) return empty;
  const { data } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, entreprise_id, tel")
    .ilike("tel", `%${suffix}%`)
    .limit(1);
  const c = data?.[0] as
    | { id: string; first_name: string | null; last_name: string | null; entreprise_id: number | null }
    | undefined;
  if (c) {
    return {
      who: [c.first_name, c.last_name].filter(Boolean).join(" ") || null,
      contactId: c.id,
      entrepriseId: c.entreprise_id,
    };
  }
  return empty;
}

/**
 * Global telephony context, mounted inside the admin/agent shells (never on the
 * public site). It:
 *  - loads the headless Zadarma WebRTC client (our own softphone UI, no Zadarma
 *    widget) when the agent has an extension,
 *  - routes click-to-call to the browser softphone or the server callback,
 *  - surfaces in-browser incoming calls (answer/reject) with a CRM match.
 */
export function CallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const isStaff = user?.role === "admin" || user?.role === "freelance";

  const [profile, setProfile] = useState<TelephonyProfile | null>(null);
  const [calling, setCalling] = useState(false);
  const [match, setMatch] = useState<CallMatch | null>(null);
  const phone = useWebphone();
  const [widgetHidden] = useSoftphoneWidgetHidden();

  // Load the agent's telephony profile (extension + preferred call mode).
  useEffect(() => {
    if (!isStaff) return;
    let active = true;
    (async () => {
      try {
        const res = await authedFetch("/api/telephony/me");
        const data = await res.json().catch(() => null);
        if (active && res.ok) setProfile(data);
      } catch {
        /* leave profile null → callback-only */
      }
    })();
    return () => {
      active = false;
    };
  }, [isStaff]);

  const dial = useCallback(
    async (input: DialInput) => {
      const e164 = toE164(input.to);
      if (!e164) return;

      // Browser mode: place the call through the in-browser softphone when it's
      // registered. Our own UI (SoftphonePanel) shows the live call.
      if (profile?.call_mode !== "callback" && webphone.isReady()) {
        webphone.call(e164);
        return;
      }

      // Callback mode (or softphone not ready): server bridges the two legs.
      setCalling(true);
      const res = await placeCallback({
        to: e164,
        contact_id: input.contactId ?? null,
        entreprise_id: input.entrepriseId ?? null,
        opportunite_id: input.opportuniteId ?? null,
      });
      setCalling(false);
      if (res.ok) {
        toast.success("Appel lancé", {
          description: "Votre téléphone va sonner, puis le correspondant sera appelé.",
        });
      } else {
        toast.error("Appel impossible", { description: res.error });
      }
    },
    [profile],
  );

  // Resolve who the live call is with (counterpart number → CRM record).
  const activeNumber =
    phone.status === "incoming" || phone.status === "ringing" || phone.status === "in_call"
      ? phone.peerNumber
      : null;
  useEffect(() => {
    if (!activeNumber) {
      setMatch(null);
      return;
    }
    let active = true;
    void (async () => {
      const m = await matchNumber(activeNumber);
      if (active) setMatch(m);
    })();
    return () => {
      active = false;
    };
  }, [activeNumber]);

  // Flash a short toast when a call ends.
  useEffect(() => {
    if (!phone.lastEnded) return;
    const { reason, durationSec } = phone.lastEnded;
    if (reason) toast.info(`Appel terminé — ${reason}`);
    else if (durationSec != null)
      toast.success(`Appel terminé (${new Date(durationSec * 1000).toISOString().substr(14, 5)})`);
  }, [phone.lastEnded]);

  const controls = {
    hangup: () => webphone.hangup(),
    answer: () => webphone.answer(),
    reject: () => webphone.reject(),
    sendDtmf: (d: string) => webphone.sendDtmf(d),
    toggleMute: () => webphone.toggleMute(),
  };

  if (!isStaff) return <>{children}</>;

  return (
    <TelephonyContext.Provider value={{ profile, calling, phone, match, dial, ...controls }}>
      {children}
      {profile?.configured && profile?.hasExtension && profile?.sip && (
        <ZadarmaWidget sip={profile.sip} />
      )}
      <SoftphonePanel hideWhenIdle={widgetHidden} />
    </TelephonyContext.Provider>
  );
}
