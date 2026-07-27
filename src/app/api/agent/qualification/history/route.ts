import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = (req: Request) => preflight(req);

const LIMIT = 200;

/**
 * GET /api/agent/qualification/history
 *
 * Les décisions de l'agent connecté et le verdict de l'admin sur chacune, pour
 * qu'il voie ce qui a été validé et ce qui a été corrigé.
 */
export const GET = withAuth({ role: "freelance", capability: "qualify" }, async ({ user, cors }) => {
  const { data, error } = await getServiceClient()
    .from("agent_qualification_decisions")
    .select(
      "id, entreprise_id, decision, note, created_at, review_status, review_action, reviewed_at, entreprises(id, name, ville, canonical_url)",
    )
    .eq("agent_id", user.id)
    .order("created_at", { ascending: false })
    .limit(LIMIT);

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      return json({ decisions: [], migration_applied: false }, { headers: cors });
    }
    return jsonError(error.message, 500, {}, cors);
  }

  return json({ decisions: data ?? [], migration_applied: true }, { headers: cors });
});
