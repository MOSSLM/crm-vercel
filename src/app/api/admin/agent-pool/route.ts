import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import {
  dealsByEntreprise,
  fetchDeals,
  fetchOwnedCounts,
  fetchPool,
  type PipelineRow,
  type StageRow,
} from "../_agent-pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = (req: Request) => preflight(req);

/**
 * Admin : le pool d'entreprises attribuables, chacune avec le ou les pipelines
 * CRM où elle a une affaire. C'est ce qui permet de n'envoyer à un agent que
 * les entreprises d'un pipeline donné (« Entreprises sans site web », …) au
 * lieu de piocher à l'aveugle dans une liste à plat.
 */
export const GET = withAuth({ role: "admin" }, async ({ cors }) => {
  const sc = getServiceClient();

  const [poolRes, pipelinesRes, stagesRes, ownedCounts] = await Promise.all([
    fetchPool(sc),
    sc.from("pipelines").select("id, nom, ordre").order("ordre", { ascending: true }),
    sc
      .from("etapes_pipeline")
      .select("id, nom, pipeline_id, ordre")
      .order("ordre", { ascending: true }),
    fetchOwnedCounts(sc),
  ]);

  if (poolRes.error) return jsonError(poolRes.error, 500, {}, cors);
  if (pipelinesRes.error) return jsonError(pipelinesRes.error.message, 500, {}, cors);

  const pipelineRows = (pipelinesRes.data ?? []) as PipelineRow[];
  const stageRows = (stagesRes.data ?? []) as StageRow[];
  const pipelineById = new Map(pipelineRows.map((p) => [p.id, p]));
  const stageById = new Map(stageRows.map((s) => [s.id, s]));

  const entIds = poolRes.rows.map((e) => e.id);
  const opps = entIds.length > 0 ? await fetchDeals(sc, entIds) : [];
  const dealsByEnt = dealsByEntreprise(opps, pipelineById, stageById);

  const prospects = poolRes.rows.map((e) => ({
    id: e.id,
    name: e.name,
    ville: e.ville,
    telephone: e.telephone,
    deals: dealsByEnt.get(e.id) ?? [],
  }));

  return json(
    {
      prospects,
      pipelines: pipelineRows.map((p) => ({
        id: p.id,
        nom: p.nom ?? "Sans nom",
        ordre: p.ordre ?? 0,
      })),
      stages: stageRows.map((s) => ({
        id: s.id,
        nom: s.nom ?? "Sans nom",
        pipeline_id: s.pipeline_id,
        ordre: s.ordre ?? 0,
      })),
      owned_counts: ownedCounts,
      truncated: poolRes.truncated,
    },
    { headers: cors },
  );
});
