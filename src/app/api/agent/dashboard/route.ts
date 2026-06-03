import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { getAgentPipeline } from "../_lib";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

const LOST = "Perdu";
const SIGNED = "Client signé";
const RDV = "RDV calé";

// Per-agent dashboard KPIs, scoped to the caller (owner_id = ctx.user.id).
export const GET = withAuth({ role: "freelance" }, async ({ user, cors }) => {
  const sc = getServiceClient();
  const agent = await getAgentPipeline();
  if (!agent) return jsonError("pipeline_introuvable", 500, {}, cors);

  const stageName = new Map(agent.stages.map((s) => [s.id, s.nom]));

  const [oppsRes, poolRes, tasksRes] = await Promise.all([
    sc
      .from("opportunites")
      .select("id, stage_id, montant")
      .eq("owner_id", user.id)
      .eq("pipeline_id", agent.pipelineId),
    sc
      .from("entreprises")
      .select("id", { count: "exact", head: true })
      .is("owner_id", null)
      .eq("qualifie", true),
    sc
      .from("prospection_tasks")
      .select("id", { count: "exact", head: true })
      .eq("assignee_id", user.id)
      .eq("status", "pending"),
  ]);

  if (oppsRes.error) return jsonError(oppsRes.error.message, 500, {}, cors);

  const opps = oppsRes.data ?? [];
  const byStage: Record<string, number> = {};
  for (const s of agent.stages) byStage[s.nom] = 0;

  let rdv = 0;
  let signes = 0;
  let perdus = 0;
  let pipelineValue = 0;

  for (const o of opps) {
    const nom = o.stage_id != null ? stageName.get(o.stage_id) : undefined;
    if (nom) byStage[nom] = (byStage[nom] ?? 0) + 1;
    if (nom === RDV) rdv += 1;
    if (nom === SIGNED) signes += 1;
    if (nom === LOST) perdus += 1;
    if (nom !== SIGNED && nom !== LOST) pipelineValue += Number(o.montant ?? 0);
  }

  return json(
    {
      total: opps.length,
      actifs: opps.length - signes - perdus,
      rdv,
      signes,
      perdus,
      pipelineValue,
      byStage,
      stages: agent.stages,
      poolDisponible: poolRes.count ?? 0,
      tachesEnAttente: tasksRes.count ?? 0,
    },
    { headers: cors },
  );
});
