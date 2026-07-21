/**
 * Twilio webhook signature verification.
 *
 * Twilio signs every webhook with `X-Twilio-Signature` (HMAC-SHA1 over the full
 * URL + sorted POST params, keyed by the account auth token). This mirrors the
 * Stripe-webhook trust boundary already in the codebase.
 *
 * Fail-open/closed policy matches the cron route (`process-scheduled-actions`):
 *   - prod + no auth token → fail CLOSED (reject), so we never process unsigned
 *     traffic in production.
 *   - dev/test + no auth token → fail OPEN (allow), so the mock/local flow works
 *     without credentials.
 */
import { validateRequest } from "twilio";
import { twilioConfig, getWebhookBaseUrl } from "./config";

/** Parse an `application/x-www-form-urlencoded` Twilio body into a flat map. */
export const parseTwilioForm = (bodyText: string): Record<string, string> => {
  const params = new URLSearchParams(bodyText);
  const out: Record<string, string> = {};
  for (const [key, value] of params.entries()) out[key] = value;
  return out;
};

/**
 * Rebuild the exact URL Twilio signed. We combine the configured public base
 * URL (what we register as the webhook target) with the request's path + query,
 * because behind Vercel's proxy `req.url`'s host may be an internal one that
 * Twilio never saw.
 */
const reconstructUrl = (req: Request): string => {
  const reqUrl = new URL(req.url);
  return `${getWebhookBaseUrl()}${reqUrl.pathname}${reqUrl.search}`;
};

export interface ValidateOptions {
  /** Override the URL Twilio used (defaults to base URL + request path/query). */
  url?: string;
}

export const validateTwilioSignature = (
  req: Request,
  params: Record<string, string>,
  opts: ValidateOptions = {},
): boolean => {
  const authToken = twilioConfig.authToken;
  const isProd = process.env.NODE_ENV === "production";

  if (!authToken) return !isProd;

  const signature = req.headers.get("x-twilio-signature");
  if (!signature) return false;

  const url = opts.url ?? reconstructUrl(req);
  try {
    return validateRequest(authToken, signature, url, params);
  } catch {
    return false;
  }
};
