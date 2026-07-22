/**
 * Voicemail inbox. Zadarma has no dedicated voicemail API, so we model it as
 * inbound calls that were not answered (disposition voicemail / no_answer),
 * surfacing any recording the caller left. Role-scoped like the call journal.
 */

import { withAuth } from "@/app/api/_lib/with-auth";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { isAdminUser } from "@/app/api/telephony/_lib";

export const runtime = "nodejs";

const SELECT =
  "id, from_e164, to_e164, agent_id, contact_id, entreprise_id, started_at, created_at, " +
  "duration_sec, disposition, recording_status, transcript_status, " +
  "entreprise:entreprises(id, name), contact:contacts(id, first_name, last_name)";

export const GET = withAuth({}, async ({ user, cors }) => {
  const sc = getServiceClient();
  const admin = await isAdminUser(sc, user.id);

  let query = sc
    .from("calls")
    .select(SELECT)
    .eq("direction", "inbound")
    .in("disposition", ["voicemail", "no_answer"])
    .order("created_at", { ascending: false })
    .limit(100);

  if (!admin) query = query.or(`agent_id.eq.${user.id},agent_id.is.null`);

  const { data, error } = await query;
  if (error) return jsonError(error.message, 500, {}, cors);
  return json({ voicemails: data ?? [] }, { headers: cors });
});
