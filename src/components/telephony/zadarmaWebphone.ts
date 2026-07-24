"use client";

/**
 * Headless Zadarma softphone controller.
 *
 * Zadarma's web-phone is two layers: a Vue UI widget (`loader-phone-fn.js`) and,
 * underneath it, a UI-less JsSIP client — the "WebRTC API widget"
 * (`widget-api.min.js`, global `ZadarmaWebphoneAPI` → `window.zdrmWebPhone`). We
 * load ONLY that headless layer and drive it from our own React panel, so no
 * Zadarma UI ever renders. This mirrors what Zadarma's own TeamSale CRM does.
 *
 * Reverse-engineered from widget-api.min.js (v8). Public API used:
 *   new ZadarmaWebphoneAPI()  → sets window.zdrmWebPhone
 *   .init({key, sip, type, language, getStatusMessage, getSipsCallback,
 *          callbackEndCall})  → loads labels/sips, checks WebRTC support
 *   .reg(sip)                 → registers the extension + opens the push socket
 *                               (ws.zadarma.com) that delivers INCOMING calls
 *   .call(number)             → outbound (JsSIP over wss://<dc>:4443)
 *   .answer() / .finishCall() → accept / hang-up (finishCall also rejects a
 *                               ringing inbound call)
 *   .sendDTMF(0-9) / .micSwitch("on"|"off")  → in-call keypad / mute
 * Events arrive through the `getStatusMessage(msg, data)` callback and
 * `callbackEndCall({type,duration,timer,cost})`.
 *
 * The controller is a browser singleton exposing an immutable snapshot for
 * `useSyncExternalStore`; React never talks to `window.zdrmWebPhone` directly.
 */

import { useSyncExternalStore } from "react";
import { authedFetch } from "@/utils/authedFetch";

const V8_BASE = "https://my.zadarma.com/webphoneWebRTCWidget/v8/js";
// Order matters: widget-api.min.js reads window.md5 at evaluation time, and uses
// io / JsSIP / DetectRTC later — so every dependency loads before it.
const V8_SCRIPTS = [
  `${V8_BASE}/socket.io.js`,
  `${V8_BASE}/detectWebRTC.min.js`,
  `${V8_BASE}/jssip.min.js?v=7`,
  `${V8_BASE}/md5.min.js`,
  `${V8_BASE}/widget-api.min.js?sub_v=68`,
];

// The hidden media elements the API drives by id: the call audio attaches to
// #zdrm-webRTCRemoteView (a MediaStream, so display:none still plays), the rest
// are ring/keypad sounds. Copied from Zadarma's loader-widget-api.js.
const MEDIA_HTML = `
<video id="zdrm-webRTCSelfView" autoplay playsinline muted style="display:none"></video>
<video id="zdrm-webRTCRemoteView" autoplay playsinline style="position:fixed;z-index:-2;width:1px;height:1px;left:0;top:0;opacity:0;pointer-events:none"></video>
<audio id="zdrm-incomingRing" preload="auto" src="https://my.zadarma.com/assets/incoming-call.mp3"></audio>
<audio id="zdrm-outgoingRing" preload="auto" src="https://my.zadarma.com/assets/out.wav"></audio>
<audio id="zdrm-busy" preload="auto" src="https://my.zadarma.com/assets/busy.wav"></audio>
<audio id="zdrm-hangup" preload="auto" src="https://my.zadarma.com/assets/hangup.wav"></audio>
${Array.from({ length: 10 }, (_, i) =>
  `<audio id="zdrm-dtmf${i}" preload="auto" src="https://my.zadarma.com/assets/dtmf-${i}.wav"></audio>`,
).join("")}
`;

// --- Types for the (untyped) Zadarma global --------------------------------

interface ZdrmInitOptions {
  key: string;
  sip: string;
  type?: "CRM" | "site" | "my";
  language?: string;
  getStatusMessage?: (msg: string, data?: ZdrmStatusData) => void;
  getSipsCallback?: (sips: unknown, errorCode?: unknown, error?: string) => void;
  callbackGetPrice?: (price: unknown) => void;
  callbackEndCall?: (info: ZdrmEndCallInfo) => void;
}
interface ZdrmStatusData {
  dst?: string;
  caller?: string;
  callername?: string;
  calledDid?: string;
  descr?: string;
}
interface ZdrmEndCallInfo {
  type?: string;
  duration?: number;
  timer?: string;
  cost?: unknown;
}
interface ZdrmApi {
  init(o: ZdrmInitOptions): string;
  reg(sip: string): void;
  unreg(): void;
  call(n: string): unknown;
  finishCall(): void;
  answer(): void;
  cancel(): void;
  sendDTMF(d: string | number): void;
  micSwitch(s: "on" | "off"): void;
  volumeSwitch(s: "on" | "off"): void;
}
declare global {
  interface Window {
    ZadarmaWebphoneAPI?: new () => ZdrmApi;
    zdrmWebPhone?: ZdrmApi;
    ZDRMscriptDiv?: HTMLElement;
    JsSIP?: unknown;
    io?: unknown;
    DetectRTC?: unknown;
    md5?: unknown;
  }
}

// --- Public state ----------------------------------------------------------

export type WebphoneStatus =
  | "idle" // controller not started
  | "loading" // fetching the Zadarma scripts
  | "registering" // scripts up, registering the extension
  | "ready" // registered, idle, can place a call
  | "ringing" // outbound call, waiting for the callee
  | "incoming" // inbound call ringing
  | "in_call" // media established, talking
  | "error";

export interface WebphoneCallEnd {
  at: number;
  reason: string | null;
  durationSec: number | null;
}

export interface WebphoneState {
  status: WebphoneStatus;
  ready: boolean;
  direction: "outgoing" | "incoming" | null;
  peerNumber: string | null;
  peerName: string | null;
  calledDid: string | null;
  muted: boolean;
  /** Epoch ms when talking began (drives the live in-call timer). */
  startedAt: number | null;
  error: string | null;
  /** Last finished call — lets the UI flash a short summary/toast. */
  lastEnded: WebphoneCallEnd | null;
}

const INITIAL: WebphoneState = {
  status: "idle",
  ready: false,
  direction: null,
  peerNumber: null,
  peerName: null,
  calledDid: null,
  muted: false,
  startedAt: null,
  error: null,
  lastEnded: null,
};

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === "1") resolve();
      else {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () => reject(new Error(`script_error:${src}`)));
      }
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    // Not async: we await sequentially so the dependency order above holds.
    s.addEventListener("load", () => {
      s.dataset.loaded = "1";
      resolve();
    });
    s.addEventListener("error", () => reject(new Error(`script_error:${src}`)));
    document.head.appendChild(s);
  });
}

function injectMediaHost(): void {
  if (document.getElementById("zdrm-webphone-host")) return;
  const host = document.createElement("div");
  host.id = "zdrm-webphone-host";
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;left:-9999px;top:-9999px;";
  host.innerHTML = MEDIA_HTML;
  document.body.appendChild(host);
  // The API appends its JSONP <script> tags to `ZDRMscriptDiv` (a global).
  window.ZDRMscriptDiv = host;
}

class ZadarmaWebphone {
  private state: WebphoneState = INITIAL;
  private listeners = new Set<() => void>();
  private loadPromise: Promise<void> | null = null;
  private api: ZdrmApi | null = null;

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };
  getSnapshot = (): WebphoneState => this.state;
  getServerSnapshot = (): WebphoneState => INITIAL;

  isReady(): boolean {
    return this.state.ready;
  }

  private set(patch: Partial<WebphoneState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  /**
   * Idempotent: mints the WebRTC key, loads the headless client and registers
   * `sip`. Safe to call repeatedly (React StrictMode double-mount, remounts) —
   * only the first call does the work, via the shared loadPromise guard. A failed
   * attempt clears the guard so a later call can retry.
   */
  start(sip: string): Promise<void> {
    if (typeof window === "undefined") return Promise.resolve();
    if (this.loadPromise) return this.loadPromise;
    this.set({ status: "loading", error: null });
    this.loadPromise = this._start(sip).catch((e: unknown) => {
      this.set({
        status: "error",
        error: e instanceof Error ? e.message : "webphone_load_failed",
      });
      this.loadPromise = null; // allow a later retry
    });
    return this.loadPromise;
  }

  private async _start(sip: string): Promise<void> {
    // Mint the short-lived key server-side (the API secret never reaches here).
    const res = await authedFetch("/api/telephony/webrtc-key");
    const data = (await res.json().catch(() => null)) as { key?: string; sip?: string } | null;
    if (!res.ok || !data?.key) throw new Error("webrtc_key_unavailable");
    await this._load({ key: data.key, sip: data.sip || sip, language: "fr" });
  }

  private async _load(opts: { key: string; sip: string; language?: string }): Promise<void> {
    injectMediaHost();
    for (const src of V8_SCRIPTS) await loadScript(src);
    const Ctor = window.ZadarmaWebphoneAPI;
    if (typeof Ctor !== "function") throw new Error("zadarma_api_unavailable");

    this.set({ status: "registering" });
    const api = new Ctor(); // constructor sets window.zdrmWebPhone = api
    this.api = api;

    api.init({
      key: opts.key,
      sip: opts.sip,
      type: "site",
      language: opts.language ?? "fr",
      getStatusMessage: this.onStatus,
      getSipsCallback: this.onSips,
      callbackEndCall: this.onEndCall,
      // Required: the API invokes this UNGUARDED on repeat provisional responses
      // during a call — omitting it throws mid-call. We don't surface prices.
      callbackGetPrice: this.onPrice,
    });
    // reg() is independent of the async label/sip fetches init() kicks off; it
    // sets the username used by call() and opens the inbound push socket.
    api.reg(opts.sip);
  }

  // --- API-event handlers (bound; called by the Zadarma runtime) -----------

  private onStatus = (msg: string, data?: ZdrmStatusData): void => {
    switch (msg) {
      case "BROWSER_NOT_SUPPORTED":
        this.set({ status: "error", error: "Navigateur sans support WebRTC." });
        break;
      case "registered":
        this.set({ ready: true });
        break;
      case "connected":
        // Registration confirmed; also re-fired on cancel — only reset to the
        // idle "ready" state when we aren't mid-call.
        this.set(
          this.isIdleStatus()
            ? { ready: true, status: "ready" }
            : { ready: true },
        );
        break;
      case "outgoing":
        this.set({
          status: "ringing",
          direction: "outgoing",
          peerNumber: data?.dst ?? this.state.peerNumber,
          error: null,
        });
        break;
      case "incoming":
        this.set({
          status: "incoming",
          direction: "incoming",
          peerNumber: data?.caller ?? null,
          peerName: data?.callername || null,
          calledDid: data?.calledDid || null,
          error: null,
        });
        break;
      case "accepted":
        // We answered an inbound call; media isn't up yet, so no timer until
        // 'confirmed' — this keeps in/out call durations consistent.
        this.set({ status: "in_call" });
        break;
      case "confirmed":
        this.set({ status: "in_call", startedAt: this.state.startedAt ?? Date.now() });
        break;
      case "busy":
        this.endCall("Occupé");
        break;
      case "rejected":
        this.endCall("Refusé");
        break;
      case "canceled":
        this.endCall(null);
        break;
      default:
        break;
    }
  };

  private onSips = (): void => {
    // We register a fixed extension, so we don't need the SIP list; providing
    // the callback is still required (the API calls it unconditionally).
  };

  private onPrice = (): void => {
    // We don't display call prices; this only exists so the API's unguarded
    // callbackGetPrice(...) invocations during a call don't throw.
  };

  private onEndCall = (info: ZdrmEndCallInfo): void => {
    this.endCall(null, typeof info?.duration === "number" ? info.duration : null);
  };

  private isIdleStatus(): boolean {
    const s = this.state.status;
    return s === "loading" || s === "registering" || s === "ready" || s === "idle";
  }

  private endCall(reason: string | null, durationSec: number | null = null): void {
    // Only record a "call ended" summary when a call was actually up.
    const wasActive =
      this.state.status === "ringing" ||
      this.state.status === "incoming" ||
      this.state.status === "in_call";
    this.set({
      status: this.state.ready ? "ready" : "registering",
      direction: null,
      peerNumber: null,
      peerName: null,
      calledDid: null,
      startedAt: null,
      muted: false,
      lastEnded: wasActive ? { at: Date.now(), reason, durationSec } : this.state.lastEnded,
    });
  }

  // --- Commands (called by React) ------------------------------------------

  call(number: string): void {
    if (!this.api || !number) return;
    // Optimistic: reflect the outbound attempt instantly; the API confirms with
    // an "outgoing" event shortly after.
    this.set({
      status: "ringing",
      direction: "outgoing",
      peerNumber: number,
      peerName: null,
      startedAt: null,
      muted: false,
      error: null,
    });
    try {
      this.api.call(number);
    } catch {
      this.endCall("Échec de l'appel");
    }
  }

  hangup(): void {
    const { status, startedAt } = this.state;
    try {
      this.api?.finishCall();
    } catch {
      /* no-op */
    }
    // When no JsSIP session exists yet (early ringing, or an inbound call
    // answered but not yet connected) the API emits no end event, so clear
    // optimistically — the panel must never stick. Established calls still get
    // their duration recorded here.
    if (status === "ringing" || status === "incoming" || status === "in_call") {
      const dur =
        status === "in_call" && startedAt
          ? Math.round((Date.now() - startedAt) / 1000)
          : null;
      this.endCall(null, dur);
    }
  }

  answer(): void {
    try {
      this.api?.answer();
    } catch {
      /* no-op */
    }
  }

  reject(): void {
    // finishCall() cancels a ringing inbound call. The API only emits "connected"
    // on this path (no end event — no media session existed), so clear here.
    try {
      this.api?.finishCall();
    } catch {
      /* no-op */
    }
    this.endCall(null);
  }

  sendDtmf(digit: string | number): void {
    try {
      this.api?.sendDTMF(digit);
    } catch {
      /* no-op */
    }
  }

  toggleMute(): void {
    const next = !this.state.muted;
    try {
      this.api?.micSwitch(next ? "on" : "off"); // "on" mutes
      this.set({ muted: next });
    } catch {
      /* no-op */
    }
  }
}

/** Process-wide singleton — one softphone per tab. */
export const webphone = new ZadarmaWebphone();

/** Subscribe a component to the live softphone state. */
export function useWebphone(): WebphoneState {
  return useSyncExternalStore(
    webphone.subscribe,
    webphone.getSnapshot,
    webphone.getServerSnapshot,
  );
}
