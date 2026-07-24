"use client";

import { useEffect, useRef } from "react";
import { authedFetch } from "@/utils/authedFetch";
import { webphone } from "./zadarmaWebphone";

/**
 * Mounts the headless Zadarma softphone: mints a short-lived WebRTC key
 * server-side (keeps the API secret off the client), then hands it to the
 * `webphone` controller which loads Zadarma's UI-less JsSIP client and registers
 * the agent's PBX extension. Renders nothing — all call UI is our own
 * (SoftphonePanel / incoming pop), driven by the controller's state.
 *
 * Security: the key + SIP end up client-side, so this must only mount inside the
 * authenticated admin/agent shells, never on a public page.
 */
export function ZadarmaWidget({ sip }: { sip: string }) {
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;

    (async () => {
      let key: string | null = null;
      let keySip: string | null = null;
      try {
        const res = await authedFetch("/api/telephony/webrtc-key");
        const data = await res.json().catch(() => null);
        if (res.ok && data?.key) {
          key = data.key;
          keySip = data.sip ?? null;
        }
      } catch {
        return;
      }
      if (!key || cancelled) return;
      await webphone.load({ key, sip: keySip || sip, language: "fr" });
    })();

    return () => {
      cancelled = true;
    };
  }, [sip]);

  return null;
}
