/**
 * Voice AccessToken minting for the browser softphone.
 *
 * The token is a JWT signed locally with the Twilio API key pair — no REST call.
 * It carries a VoiceGrant tying the browser Device to our TwiML App (outbound)
 * and allowing inbound calls addressed to this identity.
 */
import twilio from "twilio";
import { twilioConfig, hasVoiceCredentials } from "./config";

/** Twilio client identities allow [A-Za-z0-9-_.]; a Supabase UUID qualifies. */
export const clientIdentityForUser = (userId: string): string =>
  userId.replace(/[^A-Za-z0-9\-_.]/g, "");

export const mintVoiceAccessToken = (identity: string, ttlSeconds = 3600): string => {
  const { accountSid, apiKeySid, apiKeySecret, twimlAppSid } = twilioConfig;
  if (!hasVoiceCredentials() || !accountSid || !apiKeySid || !apiKeySecret || !twimlAppSid) {
    throw new Error("Twilio Voice non configuré (API key / TwiML App manquants)");
  }

  const AccessToken = twilio.jwt.AccessToken;
  const VoiceGrant = AccessToken.VoiceGrant;

  const token = new AccessToken(accountSid, apiKeySid, apiKeySecret, {
    identity,
    ttl: ttlSeconds,
  });
  token.addGrant(
    new VoiceGrant({
      outgoingApplicationSid: twimlAppSid,
      incomingAllow: true,
    }),
  );
  return token.toJwt();
};
