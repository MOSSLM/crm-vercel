import { json, jsonError } from "@/app/api/_lib/respond";
import { withAuth } from "@/app/api/_lib/with-auth";
import { STAFF_ROLES } from "@/app/api/_lib/require-role";
import { preflight } from "@/app/api/_lib/cors";
import { hasVoiceCredentials } from "@/lib/twilio/config";
import { mintVoiceAccessToken, clientIdentityForUser } from "@/lib/twilio/token";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

/**
 * Mints a short-lived Voice AccessToken for the caller's browser softphone.
 * Returns 503 `{ mock: true }` when Voice isn't configured so the client can
 * fall back to simulation instead of failing.
 */
export const GET = withAuth({ role: STAFF_ROLES }, async ({ user, cors }) => {
  if (!hasVoiceCredentials()) {
    return jsonError("twilio_voice_not_configured", 503, { mock: true }, cors);
  }
  const identity = clientIdentityForUser(user.id);
  try {
    const token = mintVoiceAccessToken(identity);
    return json({ token, identity, ttl: 3600 }, { headers: cors });
  } catch {
    return jsonError("token_mint_failed", 500, {}, cors);
  }
});
