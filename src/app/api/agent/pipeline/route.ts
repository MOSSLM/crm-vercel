import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { getAgentPipeline } from "../_lib";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

// Kanban data: the agent pipeline stages + the caller's opportunities, joined
// with their company and primary contact. Scoped by owner_id.
export const GET = withAuth({ role: "freelance" }, async ({ user, cors }) => {
  const sc = getServiceClient();
  const agent = await getAgentPipeline();
  if (!agent) return jsonError("pipeline_introuvable", 500, {}, cors);

  const { data, error } = await sc
    .from("opportunites")
    .select(
      "id, name, stage_id, montant, priorite, type, mrr, date_prochain_suivi, " +
        "entreprise:entreprises(id, name, ville, telephone, site_web_canonique), " +
        "contact:contacts(id, first_name, last_name, tel, email)",
    )
    .eq("owner_id", user.id)
    .eq("pipeline_id", agent.pipelineId)
    .order("updated_at", { ascending: false });

  if (error) return jsonError(error.message, 500, {}, cors);

  return json({ stages: agent.stages, opportunities: data ?? [] }, { headers: cors });
});
