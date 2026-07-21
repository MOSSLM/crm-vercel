/**
 * Central Twilio configuration + capability flags.
 *
 * Every Twilio secret is optional (see `src/env.ts`). This module turns the
 * raw env into a small set of booleans the rest of the codebase can branch on,
 * and decides whether we run against real Twilio or the in-memory mock.
 *
 * Design mirrors how the app treats Stripe/Resend: when credentials are absent,
 * server routes answer 503 and the UI degrades to a simulation instead of
 * crashing. This lets the whole call-center be developed and demoed with zero
 * Twilio account (greenfield), then flipped to production by filling env vars.
 */
import {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_API_KEY_SID,
  TWILIO_API_KEY_SECRET,
  TWILIO_TWIML_APP_SID,
  TWILIO_MOCK,
} from "@/env";
import { getAppUrl } from "@/lib/app-url";

export const twilioConfig = {
  accountSid: TWILIO_ACCOUNT_SID ?? null,
  authToken: TWILIO_AUTH_TOKEN ?? null,
  apiKeySid: TWILIO_API_KEY_SID ?? null,
  apiKeySecret: TWILIO_API_KEY_SECRET ?? null,
  twimlAppSid: TWILIO_TWIML_APP_SID ?? null,
} as const;

/** REST API + webhook-signature validation need the account SID + auth token. */
export const hasRestCredentials = (): boolean =>
  Boolean(twilioConfig.accountSid && twilioConfig.authToken);

/** Minting Voice SDK AccessTokens needs the API key pair + TwiML App SID. */
export const hasVoiceCredentials = (): boolean =>
  Boolean(
    twilioConfig.accountSid &&
      twilioConfig.apiKeySid &&
      twilioConfig.apiKeySecret &&
      twilioConfig.twimlAppSid,
  );

/**
 * True when we should NOT hit the real Twilio API. Either explicitly forced via
 * `TWILIO_MOCK`, or implicitly because REST credentials are missing. In mock
 * mode the softphone simulates calls and no PSTN/carrier cost is incurred.
 */
export const isMockMode = (): boolean => {
  const forced = TWILIO_MOCK === "true" || TWILIO_MOCK === "1";
  return forced || !hasRestCredentials();
};

/**
 * Absolute base URL Twilio uses to reach our webhooks (voice/status/sms).
 * Reuses the app-url helper so it is consistent with Stripe/auth callbacks.
 * Twilio must be able to reach this host publicly (prod or a tunnel).
 */
export const getWebhookBaseUrl = (): string => getAppUrl();

/** Convenience: full webhook URL for a given /api/twilio/* path. */
export const twilioWebhookUrl = (path: string): string =>
  `${getWebhookBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
