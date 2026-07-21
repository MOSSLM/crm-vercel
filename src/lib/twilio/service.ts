/**
 * High-level Twilio service — the seam every route handler should use.
 *
 * Two implementations sit behind one interface:
 *   - RealTwilioService  → wraps the Twilio REST client (`./client`).
 *   - MockTwilioService  → in-memory, deterministic-ish, zero-cost. Used when
 *     `isMockMode()` (no credentials, or TWILIO_MOCK forced), so the entire
 *     call-center works end-to-end in dev/demo without a Twilio account.
 *
 * The interface is intentionally narrow: it exposes only the operations the CRM
 * actually performs (provision/search/release numbers, send SMS, redirect live
 * calls). Voice AccessToken minting lives in `./token` because it signs a JWT
 * locally rather than calling the REST API.
 */
import { isMockMode } from "./config";
import { getTwilioRestClient } from "./client";

export type NumberType = "local" | "mobile" | "tollfree";

export interface NumberCapabilities {
  voice: boolean;
  sms: boolean;
  mms: boolean;
}

export interface AvailableNumber {
  phoneNumber: string; // E.164
  friendlyName: string;
  locality: string | null;
  region: string | null;
  isoCountry: string;
  capabilities: NumberCapabilities;
}

export interface ProvisionedNumber {
  sid: string;
  phoneNumber: string;
  friendlyName: string;
  capabilities: NumberCapabilities;
}

export interface SearchNumbersOptions {
  country: string; // ISO 3166 alpha-2, e.g. "FR"
  type: NumberType;
  areaCode?: string;
  contains?: string;
  smsEnabled?: boolean;
  voiceEnabled?: boolean;
  limit?: number;
}

export interface BuyNumberOptions {
  phoneNumber: string;
  friendlyName?: string;
  voiceUrl?: string;
  smsUrl?: string;
  statusCallback?: string;
}

export interface UpdateNumberOptions {
  friendlyName?: string;
  voiceUrl?: string;
  smsUrl?: string;
  statusCallback?: string;
}

export interface SendSmsOptions {
  from: string;
  to: string;
  body: string;
  mediaUrl?: string[];
  statusCallback?: string;
  messagingServiceSid?: string;
}

export interface SendSmsResult {
  sid: string;
  status: string;
}

export interface UpdateCallOptions {
  /** Inline TwiML to redirect the in-progress call. */
  twiml?: string;
  /** Or a URL returning TwiML. */
  url?: string;
  /** Or hang up / cancel. */
  status?: "completed" | "canceled";
}

export interface TwilioService {
  readonly mock: boolean;
  searchAvailableNumbers(opts: SearchNumbersOptions): Promise<AvailableNumber[]>;
  buyNumber(opts: BuyNumberOptions): Promise<ProvisionedNumber>;
  releaseNumber(sid: string): Promise<void>;
  updateNumber(sid: string, opts: UpdateNumberOptions): Promise<void>;
  sendSms(opts: SendSmsOptions): Promise<SendSmsResult>;
  updateCall(sid: string, opts: UpdateCallOptions): Promise<void>;
}

// ---------------------------------------------------------------------------
// Real implementation
// ---------------------------------------------------------------------------

type RawCapabilities = {
  voice?: boolean;
  sms?: boolean;
  mms?: boolean;
  SMS?: boolean;
  MMS?: boolean;
};

/** Common fields we read across Local/Mobile/TollFree available-number instances. */
type RawAvailableInstance = {
  phoneNumber: string;
  friendlyName: string | null;
  locality: string | null;
  region: string | null;
  isoCountry: string | null;
  capabilities: RawCapabilities | null;
};

const normalizeCapabilities = (c: RawCapabilities | null | undefined): NumberCapabilities => ({
  voice: Boolean(c?.voice),
  sms: Boolean(c?.sms ?? c?.SMS),
  mms: Boolean(c?.mms ?? c?.MMS),
});

class RealTwilioService implements TwilioService {
  readonly mock = false;

  async searchAvailableNumbers(opts: SearchNumbersOptions): Promise<AvailableNumber[]> {
    const client = getTwilioRestClient();
    const ctx = client.availablePhoneNumbers(opts.country);
    const listOpts = {
      areaCode: opts.areaCode ? Number(opts.areaCode) : undefined,
      contains: opts.contains,
      smsEnabled: opts.smsEnabled,
      voiceEnabled: opts.voiceEnabled,
      limit: opts.limit ?? 20,
    };
    // The mobile/tollFree/local list resources are distinct types; branch so we
    // call one concrete signature instead of an incompatible union.
    const results: RawAvailableInstance[] =
      opts.type === "mobile"
        ? await ctx.mobile.list(listOpts)
        : opts.type === "tollfree"
          ? await ctx.tollFree.list(listOpts)
          : await ctx.local.list(listOpts);
    return results.map((r) => ({
      phoneNumber: r.phoneNumber,
      friendlyName: r.friendlyName ?? r.phoneNumber,
      locality: r.locality ?? null,
      region: r.region ?? null,
      isoCountry: r.isoCountry ?? opts.country,
      capabilities: normalizeCapabilities(r.capabilities as RawCapabilities),
    }));
  }

  async buyNumber(opts: BuyNumberOptions): Promise<ProvisionedNumber> {
    const client = getTwilioRestClient();
    const created = await client.incomingPhoneNumbers.create({
      phoneNumber: opts.phoneNumber,
      friendlyName: opts.friendlyName,
      voiceUrl: opts.voiceUrl,
      voiceMethod: opts.voiceUrl ? "POST" : undefined,
      smsUrl: opts.smsUrl,
      smsMethod: opts.smsUrl ? "POST" : undefined,
      statusCallback: opts.statusCallback,
      statusCallbackMethod: opts.statusCallback ? "POST" : undefined,
    });
    return {
      sid: created.sid,
      phoneNumber: created.phoneNumber,
      friendlyName: created.friendlyName ?? opts.phoneNumber,
      capabilities: normalizeCapabilities(created.capabilities as RawCapabilities),
    };
  }

  async releaseNumber(sid: string): Promise<void> {
    const client = getTwilioRestClient();
    await client.incomingPhoneNumbers(sid).remove();
  }

  async updateNumber(sid: string, opts: UpdateNumberOptions): Promise<void> {
    const client = getTwilioRestClient();
    await client.incomingPhoneNumbers(sid).update({
      friendlyName: opts.friendlyName,
      voiceUrl: opts.voiceUrl,
      voiceMethod: opts.voiceUrl ? "POST" : undefined,
      smsUrl: opts.smsUrl,
      smsMethod: opts.smsUrl ? "POST" : undefined,
      statusCallback: opts.statusCallback,
      statusCallbackMethod: opts.statusCallback ? "POST" : undefined,
    });
  }

  async sendSms(opts: SendSmsOptions): Promise<SendSmsResult> {
    const client = getTwilioRestClient();
    const msg = await client.messages.create({
      to: opts.to,
      body: opts.body,
      ...(opts.messagingServiceSid
        ? { messagingServiceSid: opts.messagingServiceSid }
        : { from: opts.from }),
      mediaUrl: opts.mediaUrl,
      statusCallback: opts.statusCallback,
    });
    return { sid: msg.sid, status: msg.status };
  }

  async updateCall(sid: string, opts: UpdateCallOptions): Promise<void> {
    const client = getTwilioRestClient();
    await client.calls(sid).update({
      twiml: opts.twiml,
      url: opts.url,
      method: opts.url ? "POST" : undefined,
      status: opts.status,
    });
  }
}

// ---------------------------------------------------------------------------
// Mock implementation (in-memory, zero-cost)
// ---------------------------------------------------------------------------

const randSid = (prefix: string): string =>
  prefix +
  Array.from({ length: 32 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");

/** Country → sample E.164 prefixes the mock generates numbers under. */
const MOCK_PREFIXES: Record<string, Record<NumberType, string>> = {
  FR: { local: "+331", mobile: "+336", tollfree: "+3380" },
  US: { local: "+1415", mobile: "+1415", tollfree: "+1800" },
};

class MockTwilioService implements TwilioService {
  readonly mock = true;

  async searchAvailableNumbers(opts: SearchNumbersOptions): Promise<AvailableNumber[]> {
    const country = MOCK_PREFIXES[opts.country] ? opts.country : "FR";
    const base = MOCK_PREFIXES[country][opts.type];
    const count = Math.min(opts.limit ?? 10, 20);
    const isTollFree = opts.type === "tollfree";
    return Array.from({ length: count }, (_, i) => {
      const suffix = String(100000 + Math.floor(Math.random() * 899999)).slice(-6);
      const phoneNumber = `${base}${suffix}`;
      return {
        phoneNumber,
        friendlyName: phoneNumber,
        locality: opts.type === "mobile" ? null : "Paris",
        region: country === "FR" ? "Île-de-France" : null,
        isoCountry: country,
        capabilities: {
          voice: true,
          sms: !isTollFree,
          mms: !isTollFree && country === "US",
        },
      };
    });
  }

  async buyNumber(opts: BuyNumberOptions): Promise<ProvisionedNumber> {
    return {
      sid: randSid("PN"),
      phoneNumber: opts.phoneNumber,
      friendlyName: opts.friendlyName ?? opts.phoneNumber,
      capabilities: { voice: true, sms: true, mms: false },
    };
  }

  async releaseNumber(_sid: string): Promise<void> {
    /* no-op */
  }

  async updateNumber(_sid: string, _opts: UpdateNumberOptions): Promise<void> {
    /* no-op */
  }

  async sendSms(_opts: SendSmsOptions): Promise<SendSmsResult> {
    return { sid: randSid("SM"), status: "queued" };
  }

  async updateCall(_sid: string, _opts: UpdateCallOptions): Promise<void> {
    /* no-op */
  }
}

let realCached: RealTwilioService | null = null;
let mockCached: MockTwilioService | null = null;

/**
 * Returns the active Twilio service: real when credentials are present and mock
 * is not forced, otherwise the in-memory mock.
 */
export const getTwilioService = (): TwilioService => {
  if (isMockMode()) {
    mockCached ??= new MockTwilioService();
    return mockCached;
  }
  realCached ??= new RealTwilioService();
  return realCached;
};

/** Test-only: drop cached instances so config changes take effect. */
export const __resetTwilioServiceForTests = () => {
  realCached = null;
  mockCached = null;
};
