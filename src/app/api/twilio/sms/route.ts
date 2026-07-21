/**
 * SMS history for the inbox. Admins see all messages; agents see their own.
 * Optional filters: contactId, counterpart (external number).
 */
import { json, jsonError } from "@/app/api/_lib/respond";
import { withAuth } from "@/app/api/_lib/with-auth";
import { STAFF_ROLES } from "@/app/api/_lib/require-role";
import { preflight } from "@/app/api/_lib/cors";
import { getServiceClient } from "@/app/api/_lib/service-client";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

export const GET = withAuth({ role: STAFF_ROLES }, async ({ user, req, cors }) => {
  const db = getServiceClient();
  const url = new URL(req.url);
  const contactId = url.searchParams.get("contactId");
  const counterpart = url.searchParams.get("counterpart");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 200), 500);

  const { data: profile } = await db
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const isAdmin = (profile as { role?: string } | null)?.role === "admin";

  let query = db
    .from("sms_messages")
    .select(
      "id, twilio_sid, direction, from_e164, to_e164, agent_id, contact_id, entreprise_id, body, media, status, sent_at",
    )
    .order("sent_at", { ascending: false })
    .limit(limit);

  if (!isAdmin) query = query.eq("agent_id", user.id);
  if (contactId) query = query.eq("contact_id", contactId);
  if (counterpart) query = query.or(`from_e164.eq.${counterpart},to_e164.eq.${counterpart}`);

  const { data, error } = await query;
  if (error) return jsonError(error.message, 500, {}, cors);
  return json({ messages: data ?? [] }, { headers: cors });
});
