import { getServiceClient } from "@/app/api/_lib/service-client";
import { findStageByRole, stageRole, type StageRole } from "@/lib/opportunites/stage-roles";

type ServiceClient = ReturnType<typeof getServiceClient>;

export type AgentStage = { id: number; nom: string; ordre: number };

/** Un pipeline où l'agent a des affaires, avec ses étapes visibles. */
export type AgentPipeline = {
  pipelineId: string;
  nom: string;
  ordre: number;
  stages: AgentStage[];
};

/**
 * Le pipeline « Agent SAMA » (créé par sql/20260603_agent_portal_ownership.sql).
 *
 * Il n'est plus le périmètre de l'agent : depuis qu'une affaire attribuée reste
 * dans son pipeline d'origine, il ne sert QUE de valeur par défaut pour ouvrir
 * l'affaire d'une entreprise qui n'en a aucune. Retourne null s'il n'existe pas,
 * ce qui n'empêche plus d'attribuer — seulement de créer.
 */
export async function getAgentPipeline(): Promise<{ pipelineId: string; stages: AgentStage[] } | null> {
  const sc = getServiceClient();
  const { data: pipeline, error } = await sc
    .from("pipelines")
    .select("id")
    .eq("nom", "Agent SAMA")
    .maybeSingle();
  if (error || !pipeline) return null;

  const { data: stages } = await sc
    .from("etapes_pipeline")
    .select("id, nom, ordre")
    .eq("pipeline_id", pipeline.id)
    .eq("visible", true)
    .order("ordre", { ascending: true });

  return { pipelineId: pipeline.id as string, stages: (stages ?? []) as AgentStage[] };
}

/**
 * Les pipelines où l'agent a effectivement des affaires, avec leurs étapes.
 *
 * C'est ce qui remplace « le » pipeline de l'agent : ses prospects vivent
 * désormais là où leur affaire a toujours été (« Streak Mars/Avril », le
 * pipeline par défaut, « Agent SAMA » pour les prospects vierges…). Un board
 * bâti sur un seul pipeline afficherait des colonnes vides et laisserait les
 * cartes sans colonne d'accueil.
 *
 * Retourne une liste vide — jamais null — quand l'agent n'a aucune affaire :
 * c'est un board vide, pas une erreur.
 */
export async function getAgentPipelines(agentId: string): Promise<AgentPipeline[]> {
  const sc = getServiceClient();

  const { data: deals } = await sc
    .from("opportunites")
    .select("pipeline_id")
    .eq("owner_id", agentId)
    .not("pipeline_id", "is", null);

  const pipelineIds = [...new Set((deals ?? []).map((d) => d.pipeline_id as string).filter(Boolean))];
  if (pipelineIds.length === 0) return [];

  const [pipelinesRes, stagesRes] = await Promise.all([
    sc.from("pipelines").select("id, nom, ordre").in("id", pipelineIds),
    sc
      .from("etapes_pipeline")
      .select("id, nom, ordre, pipeline_id")
      .in("pipeline_id", pipelineIds)
      .eq("visible", true)
      .order("ordre", { ascending: true }),
  ]);

  const stagesByPipeline = new Map<string, AgentStage[]>();
  for (const s of stagesRes.data ?? []) {
    const pid = s.pipeline_id as string;
    const list = stagesByPipeline.get(pid) ?? [];
    list.push({ id: s.id as number, nom: (s.nom as string) ?? "", ordre: (s.ordre as number) ?? 0 });
    stagesByPipeline.set(pid, list);
  }

  return (pipelinesRes.data ?? [])
    .map((p) => ({
      pipelineId: p.id as string,
      nom: (p.nom as string) ?? "Sans nom",
      ordre: (p.ordre as number) ?? 0,
      stages: stagesByPipeline.get(p.id as string) ?? [],
    }))
    .sort((a, b) => a.ordre - b.ordre);
}

/** L'affaire, son pipeline et les étapes visibles de CE pipeline. */
async function dealWithStages(
  sc: ServiceClient,
  opportuniteId: string,
): Promise<{ stageId: number | null; stages: AgentStage[] } | null> {
  const { data: opp } = await sc
    .from("opportunites")
    .select("id, stage_id, pipeline_id")
    .eq("id", opportuniteId)
    .maybeSingle();
  if (!opp || !opp.pipeline_id) return null;

  const { data: stages } = await sc
    .from("etapes_pipeline")
    .select("id, nom, ordre")
    .eq("pipeline_id", opp.pipeline_id)
    .order("ordre", { ascending: true });
  if (!stages || stages.length === 0) return null;

  return { stageId: (opp.stage_id as number | null) ?? null, stages: stages as AgentStage[] };
}

/**
 * L'étape du pipeline de CETTE affaire qui porte l'un des rôles demandés.
 * Exposé pour que les actions du portail agent (« RDV calé », « Perdu »…)
 * expriment une INTENTION et laissent le serveur trouver l'étape correspondante
 * dans le bon pipeline, au lieu d'envoyer un `stage_id` deviné par nom côté
 * client — qui déplaçait l'affaire de pipeline via
 * `trg_sync_opportunity_pipeline_from_stage`.
 */
export async function resolveStageForRole(
  sc: ServiceClient,
  opportuniteId: string,
  ...roles: StageRole[]
): Promise<AgentStage | null> {
  const deal = await dealWithStages(sc, opportuniteId);
  if (!deal) return null;
  return findStageByRole(deal.stages, ...roles);
}

/**
 * L'étape visée appartient-elle bien au pipeline de l'affaire ?
 *
 * Garde-fou indispensable : `trg_sync_opportunity_pipeline_from_stage`
 * (sql/20260326_multi_pipeline_support.sql) réécrit `pipeline_id` à partir de
 * l'étape à chaque update de `stage_id`. Écrire une étape étrangère ne lève
 * aucune erreur — ça DÉPLACE l'affaire, silencieusement. Sans cette
 * vérification, les affaires historiques repartiraient une à une vers « Agent
 * SAMA » au fil des clics des agents, défaisant la fusion des doublons.
 */
export async function stageBelongsToDeal(
  sc: ServiceClient,
  opportuniteId: string,
  stageId: number,
): Promise<boolean> {
  const { data: opp } = await sc
    .from("opportunites")
    .select("pipeline_id")
    .eq("id", opportuniteId)
    .maybeSingle();
  if (!opp?.pipeline_id) return false;

  const { data: stage } = await sc
    .from("etapes_pipeline")
    .select("pipeline_id")
    .eq("id", stageId)
    .maybeSingle();
  return stage?.pipeline_id === opp.pipeline_id;
}

/**
 * Premier email/WhatsApp sur une affaire → on la fait avancer à l'étape
 * d'approche de SON pipeline, et seulement si elle est encore à la toute
 * première étape : on ne revient jamais en arrière ni ne double un avancement
 * manuel. No-op si le pipeline n'a pas d'étape d'approche. Best-effort.
 */
export async function advanceToFirstApproach(sc: ServiceClient, opportuniteId: string): Promise<void> {
  const deal = await dealWithStages(sc, opportuniteId);
  if (!deal) return;

  const target = findStageByRole(deal.stages, "approche", "contacte");
  if (!target || deal.stageId === target.id) return;

  const firstStage = deal.stages[0];
  const isAtFirst = deal.stageId == null || deal.stageId === firstStage.id;
  if (!isAtFirst) return;

  await sc.from("opportunites").update({ stage_id: target.id }).eq("id", opportuniteId);
}

/**
 * Appel téléphonique abouti → étape « contacté » de SON pipeline, en marche
 * avant uniquement (jamais en deçà d'une étape plus avancée). No-op si le
 * pipeline n'a pas d'étape de ce rôle. Best-effort.
 */
export async function advanceToContacted(sc: ServiceClient, opportuniteId: string): Promise<void> {
  const deal = await dealWithStages(sc, opportuniteId);
  if (!deal) return;

  const target = findStageByRole(deal.stages, "contacte");
  if (!target) return;

  const current = deal.stages.find((s) => s.id === deal.stageId);
  if (current && current.ordre >= target.ordre) return; // déjà à/au-delà
  // Une affaire déjà signée ou perdue ne redescend pas à « contacté ».
  if (current && (stageRole(current.nom) === "signe" || stageRole(current.nom) === "perdu")) return;

  await sc.from("opportunites").update({ stage_id: target.id }).eq("id", opportuniteId);
}
