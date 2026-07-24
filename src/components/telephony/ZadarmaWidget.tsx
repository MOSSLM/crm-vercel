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

/** A loaded web-phone controller — the shape varies across widget builds. */
type ZadarmaPhone = {
  setCallingNumber?: (n: string) => void;
  setNumber?: (n: string) => void;
  callNum?: () => void;
  call?: (n?: string) => void;
  makeCall?: (n?: string) => void;
  finishCall?: () => void;
  hangup?: () => void;
};

type ZadarmaGlobals = {
  zadarmaWidgetFn?: (
    hash: string,
    sip: string,
    shape: string,
    lang: string,
    fixed: boolean,
    position: { right?: string; bottom?: string; left?: string; top?: string },
  ) => void;
  // The runtime object the loaded widget exposes. Its name has drifted between
  // builds (`zdrmWebPhone` in the current v9 loader, `zdrmWebrtcPhone`/`zdrmWPhI`
  // in earlier ones), so we probe every known alias rather than hard-code one.
  zdrmWebPhone?: ZadarmaPhone;
  zdrmWebrtcPhone?: ZadarmaPhone;
  zdrmWPhI?: ZadarmaPhone;
  __zadarmaWidgetInited?: boolean;
};

function zwin(): ZadarmaGlobals {
  return window as unknown as ZadarmaGlobals;
}

/** The loaded web-phone controller under whichever global the build exposes. */
function widgetPhone(): ZadarmaPhone | null {
  if (typeof window === "undefined") return null;
  const w = zwin();
  return w.zdrmWebPhone ?? w.zdrmWebrtcPhone ?? w.zdrmWPhI ?? null;
}

/** First callable method on `obj` from `names`, bound to `obj`. */
function pickFn(obj: ZadarmaPhone | null, names: Array<keyof ZadarmaPhone>) {
  if (!obj) return null;
  for (const n of names) {
    const fn = obj[n];
    if (typeof fn === "function") return (fn as (...a: unknown[]) => unknown).bind(obj);
  }
  return null;
}

/**
 * Programmatically place a call through the loaded widget (in-browser audio).
 * Uses the widget's runtime globals (undocumented, and renamed across builds).
 * Returns true if the call was initiated, false if the widget isn't ready
 * (caller should fall back to the server callback).
 */
export function dialViaWidget(number: string): boolean {
  const phone = widgetPhone();
  const call = pickFn(phone, ["callNum", "call", "makeCall"]);
  if (!call) return false;
  try {
    pickFn(phone, ["setCallingNumber", "setNumber"])?.(number);
    call(number);
    return true;
  } catch {
    return false;
  }
}

/** Hang up the current in-browser widget call, if any. */
export function hangupViaWidget(): void {
  try {
    pickFn(widgetPhone(), ["finishCall", "hangup"])?.();
  } catch {
    /* no-op */
  }
}

/** True when the browser widget is loaded and ready to place a call. */
export function isWidgetReady(): boolean {
  return pickFn(widgetPhone(), ["callNum", "call", "makeCall"]) !== null;
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

      // We provide our own CRM launcher (SoftphonePanel), so hide Zadarma's
      // collapsed button — the widget stays active for audio + in-call UI.
      if (!document.getElementById("zadarma-hide-launcher")) {
        const style = document.createElement("style");
        style.id = "zadarma-hide-launcher";
        style.textContent = ".webphone-button-container{display:none !important;}";
        document.head.appendChild(style);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sip]);

  return null;
}
