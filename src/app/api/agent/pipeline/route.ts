import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { getAgentPipelines } from "../_lib";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

// Données du kanban : les affaires de l'agent, TOUS PIPELINES CONFONDUS, avec
// les étapes de chacun des pipelines concernés.
//
// Le filtre `.eq("pipeline_id", pipeline « Agent SAMA »)` a disparu : une
// affaire attribuée reste désormais dans son pipeline d'origine, et le filtre
// vidait donc le board d'un agent qui possède pourtant ses prospects. Les
// étapes sont renvoyées par pipeline, jamais à plat : les libellés se répètent
// d'un pipeline à l'autre (« Perdu », « RDV… ») et une liste plate ne dirait
// pas à quelle colonne rattacher une carte.
//
// Le scoping reste double — `opportunites.owner_id` ET `entreprises.owner_id` :
// l'attribution écrit les deux, donc exiger les deux fait sortir du board un
// prospect repris par l'admin même si une ligne périmée a survécu.
export const GET = withAuth({ role: "freelance" }, async ({ user, cors }) => {
  const sc = getServiceClient();

  const { data, error } = await sc
    .from("opportunites")
    .select(
      "id, name, stage_id, pipeline_id, montant, priorite, type, mrr, date_prochain_suivi, " +
        "entreprise:entreprises!inner(id, name, ville, telephone, site_web_canonique, owner_id), " +
        "contact:contacts(id, first_name, last_name, tel, email)",
    )
    .eq("owner_id", user.id)
    .eq("entreprise.owner_id", user.id)
    .not("is_test", "is", true)
    .order("updated_at", { ascending: false });

  if (error) return jsonError(error.message, 500, {}, cors);

  const pipelines = await getAgentPipelines(user.id);

  // `stages` à plat est conservé pour compatibilité : la page Démarchage s'en
  // sert encore pour proposer des libellés. Il agrège les étapes de tous les
  // pipelines de l'agent, chacune portant son `pipeline_id`.
  const stages = pipelines.flatMap((p) =>
    p.stages.map((s) => ({ ...s, pipeline_id: p.pipelineId, pipeline_nom: p.nom })),
  );

  return json({ pipelines, stages, opportunities: data ?? [] }, { headers: cors });
});
