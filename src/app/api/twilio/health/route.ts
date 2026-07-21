import { json } from "@/app/api/_lib/respond";
import { withAuth } from "@/app/api/_lib/with-auth";
import { STAFF_ROLES } from "@/app/api/_lib/require-role";
import { preflight } from "@/app/api/_lib/cors";
import { isMockMode, hasRestCredentials, hasVoiceCredentials } from "@/lib/twilio/config";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

/**
 * Reports the Twilio integration state to staff UIs (setup page, softphone).
 * Returns only booleans — never any secret value.
 */
export const GET = withAuth({ role: STAFF_ROLES }, async ({ cors }) => {
  return json(
    {
      mock: isMockMode(),
      restConfigured: hasRestCredentials(),
      voiceConfigured: hasVoiceCredentials(),
    },
    { headers: cors },
  );
});
