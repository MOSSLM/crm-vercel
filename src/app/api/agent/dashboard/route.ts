import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { stageRole } from "@/lib/opportunites/stage-roles";
import { getAgentPipelines } from "../_lib";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

// KPI du tableau de bord agent, cadrés sur l'appelant (owner_id = user.id).
//
// Deux corrections liées au modèle « une entreprise = une affaire, qui reste
// dans son pipeline » :
//   1. plus de filtre `pipeline_id` — les affaires de l'agent vivent dans leur
//      pipeline d'origine, le filtre mettait tous les compteurs à zéro ;
//   2. plus de reconnaissance d'étape par nom exact (« RDV calé », « Client
//      signé », « Perdu ») : ces libellés n'existent que dans « Agent SAMA ».
//      On classe par rôle sémantique, valable dans n'importe quel pipeline.
//
// `byStage` est indexé par `stage_id` (unique globalement) et non plus par nom :
// deux pipelines ont chacun leur « Perdu », et l'indexation par nom les fusionnait
// dans le même compteur.
export const GET = withAuth({ role: "freelance" }, async ({ user, cors }) => {
  const sc = getServiceClient();

  const [oppsRes, poolRes, tasksRes, pipelines] = await Promise.all([
    // Même double cadrage que /api/agent/pipeline : c'est `entreprises.owner_id`
    // qui a le dernier mot, donc les KPI collent au board carte pour carte.
    sc
      .from("opportunites")
      .select("id, stage_id, pipeline_id, montant, entreprise:entreprises!inner(owner_id)")
      .eq("owner_id", user.id)
      .eq("entreprise.owner_id", user.id)
      .not("is_test", "is", true),
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
    getAgentPipelines(user.id),
  ]);

  if (oppsRes.error) return jsonError(oppsRes.error.message, 500, {}, cors);

  const opps = oppsRes.data ?? [];

  // Étapes de TOUS les pipelines où l'agent a des affaires, à plat mais chacune
  // porteuse de son pipeline pour que le front puisse regrouper.
  const stages = pipelines.flatMap((p) =>
    p.stages.map((s) => ({
      id: s.id,
      nom: s.nom,
      ordre: s.ordre,
      pipeline_id: p.pipelineId,
      pipeline_nom: p.nom,
    })),
  );
  const stageName = new Map(stages.map((s) => [s.id, s.nom]));

  const byStage: Record<number, number> = {};
  for (const s of stages) byStage[s.id] = 0;

  let rdv = 0;
  let signes = 0;
  let perdus = 0;
  let pipelineValue = 0;

  for (const o of opps) {
    const stageId = o.stage_id as number | null;
    if (stageId != null) byStage[stageId] = (byStage[stageId] ?? 0) + 1;

    const role = stageRole(stageId != null ? stageName.get(stageId) : undefined);
    if (role === "rdv") rdv += 1;
    if (role === "signe") signes += 1;
    if (role === "perdu") perdus += 1;
    if (role !== "signe" && role !== "perdu") pipelineValue += Number(o.montant ?? 0);
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
      stages,
      pipelines: pipelines.map((p) => ({ id: p.pipelineId, nom: p.nom, ordre: p.ordre })),
      poolDisponible: poolRes.count ?? 0,
      tachesEnAttente: tasksRes.count ?? 0,
    },
    { headers: cors },
  );
});
