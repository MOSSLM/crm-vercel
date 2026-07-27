import { json } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { isMissingTable, resolveAgentContext } from "@/app/api/_lib/require-capability";
import { buildBoard } from "@/app/api/marketing-pipeline/_board";
import { loadPendingEntrepriseIds } from "../qualification/_lib";
import {
  dayStartIso,
  summarizeMarketingBoard,
  summarizeQualification,
  weekStartIso,
  type AgentProgress,
  type MarketingProgress,
  type QualificationProgress,
} from "@/lib/agent-progress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = (req: Request) => preflight(req);

/**
 * GET /api/agent/progress
 *
 * Les compteurs d'avancement de l'agent connecté, un par capacité déléguée.
 * Servi à part de `/api/agent/dashboard` pour deux raisons : l'agrégation du
 * board marketing est lourde et ne doit pas retarder les KPI de pipeline, et
 * un agent sans aucune capacité n'a rien à charger ici.
 *
 * Aucune capacité n'est *exigée* : la route rapporte celles qui sont accordées
 * et ne calcule que les compteurs correspondants. Une capacité refusée renvoie
 * `null`, jamais des zéros — l'UI n'affiche alors pas la carte.
 */
export const GET = withAuth({ role: "freelance" }, async ({ user, cors }) => {
  const ctx = await resolveAgentContext(user.id);

  const [qualification, marketing_pipeline] = await Promise.all([
    ctx.canQualify ? loadQualificationProgress(user.id) : Promise.resolve(null),
    ctx.canUseMarketingPipeline ? loadMarketingProgress(user.id) : Promise.resolve(null),
  ]);

  const payload: AgentProgress = {
    capabilities: {
      qualify: ctx.canQualify,
      marketing_pipeline: ctx.canUseMarketingPipeline,
    },
    qualification,
    marketing_pipeline,
  };

  return json(payload, { headers: cors });
});

/**
 * Compteurs de qualification. Des `count` plutôt qu'un chargement des lignes :
 * l'index `idx_aqd_agent` les sert, et le total reste juste quel que soit le
 * nombre de décisions accumulées.
 *
 * Renvoie `null` si la migration 20260727 n'est pas encore appliquée — même
 * dégradation silencieuse que le reste des routes agent.
 */
async function loadQualificationProgress(agentId: string): Promise<QualificationProgress | null> {
  const sc = getServiceClient();
  const now = new Date();

  const decisions = () =>
    sc
      .from("agent_qualification_decisions")
      .select("id", { count: "exact", head: true })
      .eq("agent_id", agentId);

  const [traitees, qualifiees, en_attente, validees, aujourdhui, semaine, restante] =
    await Promise.all([
      decisions(),
      decisions().eq("decision", "qualify"),
      decisions().eq("review_status", "pending"),
      decisions().eq("review_status", "confirmed"),
      decisions().gte("created_at", dayStartIso(now)),
      decisions().gte("created_at", weekStartIso(now)),
      countQueueRemaining(),
    ]);

  if (traitees.error) {
    if (isMissingTable(traitees.error)) return null;
    console.warn("agent progress: qualification counts failed:", traitees.error.message);
    return null;
  }

  return summarizeQualification({
    traitees: traitees.count ?? 0,
    qualifiees: qualifiees.count ?? 0,
    en_attente: en_attente.count ?? 0,
    validees: validees.count ?? 0,
    aujourdhui: aujourdhui.count ?? 0,
    semaine: semaine.count ?? 0,
    file_restante: restante,
  });
}

/**
 * Ce qui reste à trier dans la file commune, avec les filtres par défaut de
 * l'écran de qualification (`url_filter = with-url` : sans site, il n'y a ni
 * refonte à proposer ni audit à produire). Approximatif comme le `total` de
 * `/api/agent/qualification/queue`, dont il reprend le calcul : les
 * blacklistées et les doublons de domaine ne sont pas déduits.
 */
async function countQueueRemaining(): Promise<number> {
  const [{ count, error }, pending] = await Promise.all([
    getServiceClient()
      .from("entreprises")
      .select("id", { count: "exact", head: true })
      .filter("qualifie", "eq", false)
      .filter("hidden_in_qualification", "not.is", true)
      .filter("canonical_url", "not.is", null),
    loadPendingEntrepriseIds(),
  ]);

  if (error) return 0;
  return Math.max(0, (count ?? 0) - pending.size);
}

/**
 * Avancement du marketing pipeline, calculé sur le board de l'agent lui-même
 * (`buildBoard({ ownerId })`) : les compteurs du dashboard et les colonnes du
 * board sortent ainsi de la même agrégation et ne peuvent pas diverger.
 */
async function loadMarketingProgress(agentId: string): Promise<MarketingProgress | null> {
  const board = await buildBoard({ ownerId: agentId });
  if (!board.ok) {
    console.warn("agent progress: board build failed:", board.error);
    return null;
  }

  const items = (board.data.items ?? []) as Array<{ column?: number | null }>;
  return summarizeMarketingBoard(items);
}
