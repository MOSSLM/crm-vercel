/**
 * Zadarma implementation of `TelephonyProvider`.
 *
 * Every Zadarma-specific request/response shape is contained here and in the
 * sibling `client.ts` / `webhook.ts` / `map.ts` files. The rest of the CRM only
 * ever sees the provider-agnostic types.
 *
 * Endpoint shapes marked `CONFIRM` should be validated against the live Zadarma
 * OpenAPI spec before the corresponding feature ships; they are unused until a
 * route wires them, so they cannot break anything before then.
 */

import type { Capability, TelephonyProvider, TelephonyProviderId } from "../../core/provider";
import type {
  CallEvent,
  MintBrowserKeyParams,
  MintedBrowserKey,
  PhoneNumberInfo,
  PhoneNumberType,
  PlaceCallbackParams,
  RecordingRef,
  SendSmsParams,
  StartTranscriptionParams,
  TranscriptionResult,
  WebhookRequest,
} from "../../core/types";
import { TelephonyError } from "../../core/errors";
import { ZadarmaClient, type ZadarmaClientOptions } from "./client";
import {
  challengeResponse,
  normalizeEvent,
  parseWebhookBody,
  verifySignature,
} from "./webhook";

const WEBRTC_KEY_TTL_MS = 72 * 60 * 60 * 1000; // Zadarma keys live 72h.

const SUPPORTED: Record<Capability, boolean> = {
  browserWebRTC: true,
  callback: true,
  nativeSms: true,
  inboundSms: true,
  recording: true,
  transcription: true,
  listNumbers: true,
  // Porting exists but is a manual/KYC panel flow — not programmatic.
  portNumber: false,
  // Static IVR is panel-configured; per-call routing is done via webhook replies.
  dynamicIvr: true,
  // Supervision (listen/whisper/barge) is feature-code driven, no REST API.
  supervisionApi: false,
};

export interface ZadarmaAdapterOptions extends ZadarmaClientOptions {
  /** Secret used to verify inbound webhooks; defaults to the API secret. */
  webhookSecret?: string;
}

export class ZadarmaAdapter implements TelephonyProvider {
  readonly id: TelephonyProviderId = "zadarma";
  private readonly client: ZadarmaClient;
  private readonly webhookSecret: string;

  constructor(opts: ZadarmaAdapterOptions) {
    this.client = new ZadarmaClient(opts);
    this.webhookSecret = opts.webhookSecret ?? opts.secret;
  }

  supports(cap: Capability): boolean {
    return SUPPORTED[cap] ?? false;
  }

  // --- Calling ---------------------------------------------------------------

  async placeCallback(p: PlaceCallbackParams): Promise<{ providerCallId: string }> {
    const res = await this.client.request<{ pbx_call_id?: string; call_id?: string }>(
      "/v1/request/callback/",
      { from: p.from, to: p.to, ...(p.ext ? { sip: p.ext } : {}) },
      "GET",
    );
    return { providerCallId: res.pbx_call_id ?? res.call_id ?? "" };
  }

  async mintBrowserKey(p: MintBrowserKeyParams): Promise<MintedBrowserKey> {
    const res = await this.client.request<{ key?: string }>(
      "/v1/webrtc/get_key/",
      { sip: p.sip || p.ext },
      "GET",
    );
    if (!res.key) throw new TelephonyError("zadarma_no_webrtc_key", "webrtc_key_failed");
    return {
      key: res.key,
      sip: p.sip || p.ext,
      expiresAt: new Date(Date.now() + WEBRTC_KEY_TTL_MS).toISOString(),
    };
  }

  // --- Messaging -------------------------------------------------------------

  async sendSms(p: SendSmsParams): Promise<{ providerMessageId: string }> {
    // CONFIRM: param names (number/message/caller_id) against live spec.
    const res = await this.client.request<{ messages?: Array<{ id?: string }> }>(
      "/v1/sms/send/",
      { number: p.to, message: p.text, caller_id: p.from },
      "POST",
    );
    return { providerMessageId: res.messages?.[0]?.id ?? "" };
  }

  // --- Media / AI ------------------------------------------------------------

  async getRecording(providerCallId: string): Promise<RecordingRef> {
    // `providerCallId` here is Zadarma's `call_id_with_rec`.
    const res = await this.client.request<{ links?: string[]; link?: string }>(
      "/v1/pbx/record/request/",
      { call_id: providerCallId, lifetime: 3600 },
      "GET",
    );
    const url = res.link ?? res.links?.[0];
    if (!url) throw new TelephonyError("zadarma_no_recording_link", "recording_failed");
    return { url, expiresAt: new Date(Date.now() + 3600 * 1000).toISOString() };
  }

  async startTranscription(p: StartTranscriptionParams): Promise<{ jobId: string }> {
    // CONFIRM: speech_recognition request shape against live spec.
    await this.client.request(
      "/v1/speech_recognition/",
      {
        call_id: p.recordingProviderId ?? p.providerCallId,
        ...(p.lang ? { lang: p.lang } : {}),
      },
      "PUT",
    );
    return { jobId: p.recordingProviderId ?? p.providerCallId };
  }

  async getTranscription(jobId: string): Promise<TranscriptionResult> {
    const res = await this.client.request<{
      recognitionStatus?: string;
      lang?: string;
      phrases?: Array<{ channel: number; startTime: number; endTime: number; phrase: string }>;
      words?: Array<{
        channel: number;
        startTime: number;
        endTime: number;
        word: string;
        confidence?: number;
      }>;
    }>("/v1/speech_recognition/", { call_id: jobId }, "GET");

    const done = res.recognitionStatus === "success" || res.recognitionStatus === "done";
    const fullText = res.phrases?.map((ph) => ph.phrase).join(" ");
    return {
      status: done ? "done" : "pending",
      lang: res.lang,
      phrases: res.phrases,
      words: res.words,
      fullText,
    };
  }

  // --- Numbers ---------------------------------------------------------------

  async listNumbers(): Promise<PhoneNumberInfo[]> {
    const res = await this.client.request<{
      info?: Array<{
        number?: string;
        type?: string;
        status?: string;
        country?: string;
        is_sms?: boolean;
      }>;
    }>("/v1/direct_numbers/", {}, "GET");
    return (res.info ?? []).map((n) => ({
      e164: n.number ?? "",
      country: n.country,
      type: mapNumberType(n.type),
      status: n.status,
      capabilities: { voice: true, sms: Boolean(n.is_sms) },
    }));
  }

  // --- Webhooks --------------------------------------------------------------

  async verifyWebhook(req: WebhookRequest): Promise<boolean> {
    // A save-time GET handshake carries no signature and is authenticated by
    // echoing the token — treat as verified so the route can respond.
    if (challengeResponse(req.query) !== null) return true;
    const payload = parseWebhookBody(req.rawBody);
    return verifySignature(payload, this.webhookSecret);
  }

  normalizeWebhookEvent(rawBody: string): CallEvent | null {
    return normalizeEvent(parseWebhookBody(rawBody));
  }

  webhookChallengeResponse(req: WebhookRequest): string | null {
    return challengeResponse(req.query);
  }
}

function mapNumberType(type?: string): PhoneNumberType {
  switch ((type ?? "").toLowerCase()) {
    case "mobile":
      return "mobile";
    case "tollfree":
    case "toll-free":
      return "tollfree";
    case "common":
    case "landline":
    case "geo":
      return "landline";
    default:
      return "unknown";
  }
}
