"use client";

import { useEffect, useRef } from "react";
import { authedFetch } from "@/utils/authedFetch";

/**
 * Loads Zadarma's OFFICIAL WebRTC web-phone widget (the supported embed) behind
 * authentication. The widget injects its own floating button + audio + in-call
 * controls — we render nothing ourselves.
 *
 * Flow: mint a short-lived key server-side (/api/telephony/webrtc-key, keeps the
 * API secret off the client), load the two v9 loader scripts at runtime, then
 * call window.zadarmaWidgetFn(key, sip, 'rounded', 'fr', true, {position}).
 *
 * Security: the key + SIP end up client-side, so this must never render on a
 * public page — it is only mounted inside the authenticated admin/agent shells.
 */

const LIB_SRC = "https://my.zadarma.com/webphoneWebRTCWidget/v9/js/loader-phone-lib.js?sub_v=1";
const FN_SRC = "https://my.zadarma.com/webphoneWebRTCWidget/v9/js/loader-phone-fn.js?sub_v=1";

type ZadarmaGlobals = {
  zadarmaWidgetFn?: (
    hash: string,
    sip: string,
    shape: string,
    lang: string,
    fixed: boolean,
    position: { right?: string; bottom?: string; left?: string; top?: string },
  ) => void;
  zdrmWebrtcPhone?: {
    setCallingNumber?: (n: string) => void;
    callNum?: () => void;
  };
  __zadarmaWidgetInited?: boolean;
};

function zwin(): ZadarmaGlobals {
  return window as unknown as ZadarmaGlobals;
}

/**
 * Programmatically place a call through the loaded widget (in-browser audio).
 * Uses the widget's runtime globals (undocumented but used in production).
 * Returns true if the call was initiated, false if the widget isn't ready
 * (caller should fall back to the server callback).
 */
export function dialViaWidget(number: string): boolean {
  if (typeof window === "undefined") return false;
  const w = zwin();
  const phone = w.zdrmWebrtcPhone;
  if (!phone || typeof phone.callNum !== "function") return false;
  try {
    phone.setCallingNumber?.(number);
    phone.callNum();
    return true;
  } catch {
    return false;
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === "1") resolve();
      else {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () => reject(new Error("script_error")));
      }
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.addEventListener("load", () => {
      s.dataset.loaded = "1";
      resolve();
    });
    s.addEventListener("error", () => reject(new Error("script_error")));
    document.body.appendChild(s);
  });
}

export function ZadarmaWidget({ sip }: { sip: string }) {
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;

    (async () => {
      // Mint the per-session key server-side.
      let key: string | null = null;
      try {
        const res = await authedFetch("/api/telephony/webrtc-key");
        const data = await res.json().catch(() => null);
        if (res.ok && data?.key) key = data.key;
      } catch {
        return;
      }
      if (!key || cancelled) return;

      try {
        await loadScript(LIB_SRC);
        await loadScript(FN_SRC);
      } catch {
        return;
      }
      if (cancelled) return;

      const w = zwin();
      if (w.__zadarmaWidgetInited) return; // process-wide dedupe (StrictMode / remounts)
      if (typeof w.zadarmaWidgetFn !== "function") return;

      w.zadarmaWidgetFn(key, sip, "rounded", "fr", true, { right: "22px", bottom: "22px" });
      w.__zadarmaWidgetInited = true;
    })();

    return () => {
      cancelled = true;
    };
  }, [sip]);

  return null;
}
