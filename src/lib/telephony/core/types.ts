/**
 * Provider-agnostic telephony domain types.
 *
 * Everything the rest of the CRM touches is expressed here. Carrier-specific
 * shapes (Zadarma payloads, Twilio objects, …) never leak past an adapter —
 * adapters translate to/from these types.
 */

export type CallDirection = "inbound" | "outbound" | "internal";

export type CallDisposition =
  | "answered"
  | "no_answer"
  | "busy"
  | "failed"
  | "cancelled"
  | "voicemail";

/** Normalised event emitted from any provider webhook payload. */
export type CallEventType =
  | "ringing"
  | "answered"
  | "ended"
  | "recording_ready"
  | "ivr"
  | "sms_inbound";

export interface CallEvent {
  type: CallEventType;
  /** Provider's stable id for the call (Zadarma `pbx_call_id`). */
  providerCallId: string;
  direction: CallDirection;
  /** E.164 where the provider gives it; raw otherwise. */
  from: string;
  to: string;
  /** Internal extension / SIP the call is routed to, when known. */
  extension?: string;
  disposition?: CallDisposition;
  startedAt?: string;
  answeredAt?: string;
  endedAt?: string;
  durationSec?: number;
  /** Provider id used later to fetch the recording (Zadarma `call_id_with_rec`). */
  recordingProviderId?: string;
  ivr?: { nodeId?: string; dtmf?: string };
  sms?: { messageId?: string; body?: string };
  /** Untouched original payload, kept for audit / debugging. */
  raw: unknown;
}

/** A short-lived credential for the in-browser softphone (Zadarma: 72h key). */
export interface MintedBrowserKey {
  key: string;
  sip: string;
  /** ISO timestamp; consumers re-mint before this. */
  expiresAt: string;
}

export interface TranscriptWord {
  channel: number;
  startTime: number;
  endTime: number;
  word: string;
  confidence?: number;
}

export interface TranscriptPhrase {
  channel: number;
  startTime: number;
  endTime: number;
  phrase: string;
}

export interface TranscriptionResult {
  status: "pending" | "done" | "failed";
  lang?: string;
  phrases?: TranscriptPhrase[];
  words?: TranscriptWord[];
  /** Denormalised plain text, convenient for search/indexing. */
  fullText?: string;
}

export type PhoneNumberType = "landline" | "mobile" | "tollfree" | "unknown";

export interface PhoneNumberInfo {
  e164: string;
  providerNumberId?: string;
  country?: string;
  type?: PhoneNumberType;
  status?: string;
  capabilities?: { voice?: boolean; sms?: boolean };
}

export interface RecordingRef {
  url: string;
  /** ISO timestamp after which the provider link stops working. */
  expiresAt: string;
}

export interface PlaceCallbackParams {
  /** The agent side to ring first (their phone / SIP / extension). */
  from: string;
  /** The customer number to dial and bridge. */
  to: string;
  /** Optional SIP/extension override. */
  ext?: string;
}

export interface MintBrowserKeyParams {
  /** The agent's PBX extension login. */
  ext: string;
  /** The SIP login the widget authenticates as. */
  sip: string;
}

export interface SendSmsParams {
  /** Our sender number (E.164) or registered alphanumeric SenderID. */
  from: string;
  to: string;
  text: string;
}

export interface StartTranscriptionParams {
  providerCallId: string;
  /** Recording id, when the provider keys recognition off the recording. */
  recordingProviderId?: string;
  lang?: string;
}

/** Minimal shape a webhook handler passes to the provider for verification. */
export interface WebhookRequest {
  headers: Headers;
  rawBody: string;
  /** Parsed query string, if the route captured it (used for save-time echo). */
  query?: URLSearchParams;
}
