/**
 * The telephony provider abstraction.
 *
 * This is the single seam between the CRM and any voice/SMS carrier. Adding a
 * new provider (Twilio, Telnyx, a SIM bridge) means implementing this interface
 * in a new adapter under `providers/<name>/` and registering it in `factory.ts`
 * — nothing else in the app should need to change.
 *
 * Providers advertise what they can do via `supports(cap)`. Methods for
 * unsupported capabilities must throw `NotSupportedError`; callers/UI check
 * `supports()` first.
 */

import type {
  CallEvent,
  MintBrowserKeyParams,
  MintedBrowserKey,
  PhoneNumberInfo,
  PlaceCallbackParams,
  RecordingRef,
  SendSmsParams,
  StartTranscriptionParams,
  TranscriptionResult,
  WebhookRequest,
} from "./types";

export type Capability =
  | "browserWebRTC" // in-browser softphone (WebRTC widget / SIP)
  | "callback" // server-bridged click-to-call (no WebRTC)
  | "nativeSms" // outbound SMS via API
  | "inboundSms" // inbound SMS via webhook
  | "recording" // call recording
  | "transcription" // speech-to-text
  | "listNumbers" // enumerate connected numbers
  | "portNumber" // programmatic number porting
  | "dynamicIvr" // per-call routing via webhook responses
  | "supervisionApi"; // REST-driven listen/whisper/barge

export type TelephonyProviderId = "zadarma" | "twilio" | "telnyx" | "sim-bridge";

export interface TelephonyProvider {
  readonly id: TelephonyProviderId;

  /** Feature flag — true if the provider implements the given capability. */
  supports(cap: Capability): boolean;

  // --- Calling ---------------------------------------------------------------
  /** Click-to-call: bridge two legs server-side (rings `from`, then dials `to`). */
  placeCallback(p: PlaceCallbackParams): Promise<{ providerCallId: string }>;
  /** Mint a short-lived credential for the in-browser softphone. */
  mintBrowserKey(p: MintBrowserKeyParams): Promise<MintedBrowserKey>;

  // --- Messaging -------------------------------------------------------------
  sendSms(p: SendSmsParams): Promise<{ providerMessageId: string }>;

  // --- Media / AI ------------------------------------------------------------
  /** Resolve a (usually expiring) download URL for a call recording. */
  getRecording(providerCallId: string): Promise<RecordingRef>;
  startTranscription(p: StartTranscriptionParams): Promise<{ jobId: string }>;
  getTranscription(jobId: string): Promise<TranscriptionResult>;

  // --- Numbers ---------------------------------------------------------------
  listNumbers(): Promise<PhoneNumberInfo[]>;

  // --- Browser widget domains ------------------------------------------------
  /** Allow the in-browser widget to run on a domain (origin allow-listing). */
  registerWebrtcDomain(domain: string): Promise<{ ok: boolean; detail?: string }>;
  /** List domains currently allowed to run the in-browser widget. */
  listWebrtcDomains(): Promise<string[]>;

  // --- Webhooks --------------------------------------------------------------
  /** Verify an inbound webhook's authenticity (HMAC signature, etc.). */
  verifyWebhook(req: WebhookRequest): Promise<boolean>;
  /** Translate a raw webhook body into a normalised event, or null to ignore. */
  normalizeWebhookEvent(rawBody: string): CallEvent | null;
  /**
   * Some providers validate the callback URL at save time by GETting it with an
   * echo token that must be returned verbatim. Return that token, or null if the
   * request isn't a save-time handshake.
   */
  webhookChallengeResponse(req: WebhookRequest): string | null;
}
