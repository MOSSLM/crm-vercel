import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { googleAuthUrl } from "@/lib/scheduling/google-calendar";
import { requireStaff } from "../../_lib";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

/**
 * Démarre l'OAuth Google Calendar : renvoie l'URL de consentement (le client
 * fait la redirection). 503 si GOOGLE_CALENDAR_CLIENT_ID/SECRET absents —
 * même pattern que Stripe/Zadarma.
 */
export const GET = withAuth({}, async ({ user, cors }) => {
  const sc = getServiceClient();
  const staff = await requireStaff(sc, user.id, cors);
  if (!staff.ok) return staff.response;

  const url = googleAuthUrl(user.id);
  if (!url) return jsonError("google_calendar_non_configure", 503, {}, cors);
  return json({ url }, { headers: cors });
});
