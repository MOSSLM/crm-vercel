/**
 * Twilio adapter — STUB.
 *
 * This file exists to prove the abstraction: a second provider is added by
 * implementing `TelephonyProvider` here and registering it in `factory.ts`,
 * touching nothing else. Methods throw `NotSupportedError` until implemented.
 *
 * When built out, Twilio would flip several capabilities Zadarma lacks (notably
 * `supervisionApi` via its conference/coaching APIs) — the interface stays the
 * same, only this file changes.
 */

import type { Capability, TelephonyProvider, TelephonyProviderId } from "../../core/provider";
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
} from "../../core/types";
import { NotSupportedError } from "../../core/errors";

const SUPPORTED: Record<Capability, boolean> = {
  browserWebRTC: false,
  callback: false,
  nativeSms: false,
  inboundSms: false,
  recording: false,
  transcription: false,
  listNumbers: false,
  portNumber: false,
  dynamicIvr: false,
  supervisionApi: false,
};

export class TwilioAdapter implements TelephonyProvider {
  readonly id: TelephonyProviderId = "twilio";

  supports(cap: Capability): boolean {
    return SUPPORTED[cap] ?? false;
  }

  private unsupported(cap: Capability): never {
    throw new NotSupportedError(cap, this.id);
  }

  // `async` so the throw surfaces as a rejected promise (matches the interface).
  async placeCallback(_p: PlaceCallbackParams): Promise<{ providerCallId: string }> {
    this.unsupported("callback");
  }
  async mintBrowserKey(_p: MintBrowserKeyParams): Promise<MintedBrowserKey> {
    this.unsupported("browserWebRTC");
  }
  async sendSms(_p: SendSmsParams): Promise<{ providerMessageId: string }> {
    this.unsupported("nativeSms");
  }
  async getRecording(_providerCallId: string): Promise<RecordingRef> {
    this.unsupported("recording");
  }
  async startTranscription(_p: StartTranscriptionParams): Promise<{ jobId: string }> {
    this.unsupported("transcription");
  }
  async getTranscription(_jobId: string): Promise<TranscriptionResult> {
    this.unsupported("transcription");
  }
  async listNumbers(): Promise<PhoneNumberInfo[]> {
    this.unsupported("listNumbers");
  }
  verifyWebhook(_req: WebhookRequest): Promise<boolean> {
    return Promise.resolve(false);
  }
  normalizeWebhookEvent(_rawBody: string): CallEvent | null {
    return null;
  }
  webhookChallengeResponse(_req: WebhookRequest): string | null {
    return null;
  }
}
