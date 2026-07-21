/**
 * Raw Twilio REST client (singleton).
 *
 * Prefer the high-level {@link getTwilioService} in `./service` from route
 * handlers — it abstracts real-vs-mock. Reach for this raw client only when a
 * feature needs a Twilio REST resource the service doesn't wrap yet, and always
 * gate on `hasRestCredentials()` / `isMockMode()` first.
 */
import twilio, { type Twilio } from "twilio";
import { twilioConfig, hasRestCredentials } from "./config";

let cached: Twilio | null = null;

export const getTwilioRestClient = (): Twilio => {
  if (cached) return cached;
  if (!hasRestCredentials() || !twilioConfig.accountSid || !twilioConfig.authToken) {
    throw new Error(
      "Twilio non configuré : TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN manquants",
    );
  }
  cached = twilio(twilioConfig.accountSid, twilioConfig.authToken);
  return cached;
};

/** Test-only: reset the cached client between cases. */
export const __resetTwilioClientForTests = () => {
  cached = null;
};
