/**
 * Zadarma webhook verification + normalisation.
 *
 * Zadarma POSTs call events as `application/x-www-form-urlencoded` with a
 * `signature` field. The signature is:
 *
 *   base64( hmac_sha1_hex( signatureString, secret ) )
 *
 * where `signatureString` is a per-event concatenation of specific fields.
 * At URL-save time Zadarma GETs the endpoint with a `zd_echo` param that must be
 * echoed back verbatim.
 *
 * These functions are pure (no I/O) so they can be unit-tested against captured
 * payloads. The per-event signature strings are the detail most likely to need
 * confirmation against the live spec.
 */

import { createHmac, timingSafeEqual } from "crypto";
import type { CallEvent, CallDirection } from "../../core/types";
import { isZadarmaEvent, mapDisposition, type ZadarmaEvent } from "./map";

export type ZadarmaWebhookPayload = Record<string, string>;

export function parseWebhookBody(rawBody: string): ZadarmaWebhookPayload {
  const params = new URLSearchParams(rawBody);
  const out: ZadarmaWebhookPayload = {};
  for (const [k, v] of params.entries()) out[k] = v;
  return out;
}

/** The exact string Zadarma signs, keyed by event type. */
export function signatureStringFor(payload: ZadarmaWebhookPayload): string | null {
  const event = payload.event;
  if (!isZadarmaEvent(event)) return null;
  const p = payload;
  switch (event as ZadarmaEvent) {
    case "NOTIFY_START":
    case "NOTIFY_INTERNAL":
    case "NOTIFY_END":
    case "NOTIFY_IVR":
      return `${p.caller_id ?? ""}${p.called_did ?? ""}${p.call_start ?? ""}`;
    case "NOTIFY_ANSWER":
      return `${p.caller_id ?? ""}${p.destination ?? ""}${p.call_start ?? ""}`;
    case "NOTIFY_OUT_START":
    case "NOTIFY_OUT_END":
      return `${p.internal ?? ""}${p.destination ?? ""}${p.call_start ?? ""}`;
    case "NOTIFY_RECORD":
      return `${p.pbx_call_id ?? ""}${p.call_id_with_rec ?? ""}`;
    default:
      return null;
  }
}

export function computeSignature(signatureString: string, secret: string): string {
  const hex = createHmac("sha1", secret).update(signatureString).digest("hex");
  return Buffer.from(hex).toString("base64");
}

/** Constant-time compare of the provided vs expected signature. */
export function verifySignature(payload: ZadarmaWebhookPayload, secret: string): boolean {
  const provided = payload.signature;
  if (!provided) return false;
  const signatureString = signatureStringFor(payload);
  if (signatureString === null) return false;
  const expected = computeSignature(signatureString, secret);
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** The `zd_echo` handshake value, when this request is a save-time validation. */
export function challengeResponse(query?: URLSearchParams): string | null {
  if (!query) return null;
  return query.get("zd_echo");
}

const DIRECTION_BY_EVENT: Record<ZadarmaEvent, CallDirection> = {
  NOTIFY_START: "inbound",
  NOTIFY_INTERNAL: "internal",
  NOTIFY_ANSWER: "inbound",
  NOTIFY_END: "inbound",
  NOTIFY_OUT_START: "outbound",
  NOTIFY_OUT_END: "outbound",
  NOTIFY_RECORD: "inbound",
  NOTIFY_IVR: "inbound",
};

/** Translate a raw Zadarma payload into our normalised `CallEvent`. */
export function normalizeEvent(payload: ZadarmaWebhookPayload): CallEvent | null {
  const event = payload.event;
  if (!isZadarmaEvent(event)) return null;
  const ev = event as ZadarmaEvent;

  const direction = DIRECTION_BY_EVENT[ev];
  const providerCallId = payload.pbx_call_id ?? payload.call_id ?? "";
  const durationSec = payload.duration ? Number(payload.duration) : undefined;

  // from/to depend on direction: for outbound, `internal` is us and
  // `destination` is the customer; for inbound the reverse.
  const isOutbound = direction === "outbound";
  const from = isOutbound ? (payload.internal ?? "") : (payload.caller_id ?? "");
  const to = isOutbound
    ? (payload.destination ?? "")
    : (payload.called_did ?? payload.destination ?? "");

  const base: CallEvent = {
    type: "ringing",
    providerCallId,
    direction,
    from,
    to,
    extension: payload.internal ?? payload.destination,
    startedAt: payload.call_start,
    durationSec: Number.isFinite(durationSec) ? durationSec : undefined,
    disposition: mapDisposition(payload.disposition),
    raw: payload,
  };

  switch (ev) {
    case "NOTIFY_START":
    case "NOTIFY_OUT_START":
    case "NOTIFY_INTERNAL":
      return { ...base, type: "ringing" };
    case "NOTIFY_ANSWER":
      return { ...base, type: "answered", answeredAt: payload.call_start };
    case "NOTIFY_END":
    case "NOTIFY_OUT_END":
      return {
        ...base,
        type: "ended",
        endedAt: payload.call_start,
        recordingProviderId:
          payload.is_recorded === "1" ? payload.call_id_with_rec : undefined,
      };
    case "NOTIFY_RECORD":
      return {
        ...base,
        type: "recording_ready",
        recordingProviderId: payload.call_id_with_rec,
      };
    case "NOTIFY_IVR":
      return {
        ...base,
        type: "ivr",
        ivr: { dtmf: payload.wait_dtmf ?? payload.digits },
      };
    default:
      return null;
  }
}
