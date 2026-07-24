"use client";

import { useEffect } from "react";
import { webphone } from "./zadarmaWebphone";

/**
 * Boots the headless Zadarma softphone for the given extension: the controller
 * mints a short-lived WebRTC key server-side (the API secret never reaches the
 * client), loads Zadarma's UI-less JsSIP client and registers the extension.
 * Renders nothing — all call UI is our own (SoftphonePanel), driven by the
 * controller's state.
 *
 * `webphone.start()` is idempotent (shared loadPromise guard), so the React
 * StrictMode setup→cleanup→setup remount in dev loads exactly once.
 *
 * Security: the key + SIP end up client-side, so this must only mount inside the
 * authenticated admin/agent shells, never on a public page.
 */
export function ZadarmaWidget({ sip }: { sip: string }) {
  useEffect(() => {
    void webphone.start(sip);
  }, [sip]);

  return null;
}
