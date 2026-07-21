/**
 * Recent call history for the phone center and contact/company timelines.
 * Admins see every call; a freelance agent sees only their own.
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
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
  const contactId = url.searchParams.get("contactId");
  const entrepriseId = url.searchParams.get("entrepriseId");
  const opportuniteId = url.searchParams.get("opportuniteId");

  const { data: profile } = await db
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const isAdmin = (profile as { role?: string } | null)?.role === "admin";

  let query = db
    .from("calls")
    .select(
      "id, twilio_call_sid, direction, from_e164, to_e164, agent_id, contact_id, entreprise_id, opportunite_id, status, disposition, started_at, answered_at, ended_at, duration_seconds, recording_url",
    )
    .order("started_at", { ascending: false })
    .limit(limit);

  if (!isAdmin) query = query.eq("agent_id", user.id);
  if (contactId) query = query.eq("contact_id", contactId);
  if (entrepriseId) query = query.eq("entreprise_id", Number(entrepriseId));
  if (opportuniteId) query = query.eq("opportunite_id", opportuniteId);

  const { data, error } = await query;
  if (error) return jsonError(error.message, 500, {}, cors);
  return json(data ?? [], { headers: cors });
});
