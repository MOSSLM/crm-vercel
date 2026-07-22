/**
 * Call journal / history listing.
 *
 * Role-scoped: admins see every call (with optional agent/record filters); an
 * agent sees their own calls plus unassigned inbound, mirroring the RLS policy.
 * Each row is enriched with the linked contact/company name for display.
 */

import { withAuth } from "@/app/api/_lib/with-auth";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { parseQuery, telephonyCallsQuerySchema } from "@/app/api/_lib/schemas";
import { isAdminUser } from "@/app/api/telephony/_lib";

export const runtime = "nodejs";

const SELECT =
  "id, provider_call_id, direction, disposition, from_e164, to_e164, extension, " +
  "agent_id, contact_id, entreprise_id, opportunite_id, started_at, answered_at, " +
  "ended_at, duration_sec, ring_sec, recording_status, transcript_status, " +
  "evaluation_status, created_at, " +
  "entreprise:entreprises(id, name), contact:contacts(id, first_name, last_name)";

export const GET = withAuth({}, async ({ user, req, cors }) => {
  const url = new URL(req.url);
  const parsed = parseQuery(url, telephonyCallsQuerySchema, cors);
  if (!parsed.ok) return parsed.response;
  const q = parsed.data;

  const sc = getServiceClient();
  const admin = await isAdminUser(sc, user.id);

  let query = sc
    .from("calls")
    .select(SELECT)
    .order("created_at", { ascending: false })
    .limit(q.limit);

  if (q.contact_id) query = query.eq("contact_id", q.contact_id);
  if (q.entreprise_id) query = query.eq("entreprise_id", q.entreprise_id);
  if (q.opportunite_id) query = query.eq("opportunite_id", q.opportunite_id);
  if (q.direction) query = query.eq("direction", q.direction);

  if (admin) {
    if (q.agent_id) query = query.eq("agent_id", q.agent_id);
  } else {
    // Own calls + unassigned inbound (same shape as the RLS read policy).
    query = query.or(`agent_id.eq.${user.id},agent_id.is.null`);
  }

  const { data, error } = await query;
  if (error) return jsonError(error.message, 500, {}, cors);
  return json({ calls: data ?? [] }, { headers: cors });
});
