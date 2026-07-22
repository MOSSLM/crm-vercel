/**
 * Live supervision feed (admin): calls currently in progress + the agent roster.
 *
 * A call is "live" when it has started but not ended (recent, to avoid stale
 * rows from missed end events). Read-only: Zadarma exposes no REST API for
 * listen/whisper/barge, so those are done via feature codes from the softphone.
 */

import { withAuth } from "@/app/api/_lib/with-auth";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";

export const runtime = "nodejs";

const SELECT =
  "id, direction, from_e164, to_e164, agent_id, started_at, answered_at, disposition, " +
  "entreprise:entreprises(id, name), contact:contacts(id, first_name, last_name)";

export const GET = withAuth({ role: "admin" }, async ({ cors }) => {
  const sc = getServiceClient();
  const cutoff = new Date(Date.now() - 3 * 3600 * 1000).toISOString();

  const [{ data: live, error }, { data: agents }] = await Promise.all([
    sc
      .from("calls")
      .select(SELECT)
      .is("ended_at", null)
      .not("started_at", "is", null)
      .gte("started_at", cutoff)
      .order("started_at", { ascending: false })
      .limit(50),
    sc.from("user_profiles").select("id, full_name, email").eq("role", "freelance"),
  ]);

  if (error) return jsonError(error.message, 500, {}, cors);
  return json({ live: live ?? [], agents: agents ?? [] }, { headers: cors });
});
