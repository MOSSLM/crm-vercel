import { jsonError } from "./respond";
import { getServiceClient } from "./service-client";

/**
 * Capacités déléguées aux agents freelance, accordées agent par agent depuis
 * Relations › Agents (table `agent_settings`, cf.
 * sql/20260727_agent_qualification_and_pipeline.sql).
 *
 * Règle : **défaut = refus**. Un agent sans ligne dans `agent_settings` — ou
 * quand la migration n'a pas encore été appliquée — n'a aucune capacité. Un
 * admin les a toutes, toujours.
 */
export type AgentCapability = "qualify" | "marketing_pipeline" | "self_assign";

export type BudgetPeriod = "month" | "total";

export type AgentContext = {
  role: "admin" | "freelance" | "client" | null;
  isAdmin: boolean;
  canQualify: boolean;
  canUseMarketingPipeline: boolean;
  /**
   * L'agent peut se servir lui-même dans le pool d'entreprises non attribuées.
   *
   * Le défaut reste la demande d'attribution (`/api/agent/claim`, validée par
   * l'admin) : le pool est commun, et un agent qui s'en sert sans limite le
   * vide pour les autres. Ouvrir ce droit, c'est dire « celui-là décide seul de
   * qui il démarche » — une décision d'admin, agent par agent.
   */
  canSelfAssign: boolean;
  /** null = pas de plafond (toujours le cas pour un admin). */
  enrichmentBudgetCents: number | null;
  budgetPeriod: BudgetPeriod;
};

const DENIED: Omit<AgentContext, "role" | "isAdmin"> = {
  canQualify: false,
  canUseMarketingPipeline: false,
  canSelfAssign: false,
  enrichmentBudgetCents: null,
  budgetPeriod: "month",
};

/** `true` quand la table n'existe pas encore (migration non appliquée). */
export const isMissingTable = (error: { code?: string; message?: string } | null): boolean => {
  if (!error) return false;
  // 42P01 = undefined_table (Postgres), PGRST205 = table absente du cache PostgREST.
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /does not exist|could not find the table/i.test(error.message ?? "")
  );
};

/**
 * Résout le rôle du caller et les capacités qui en découlent. Ne lève jamais :
 * en cas de problème, renvoie un contexte sans aucune capacité.
 */
export const resolveAgentContext = async (userId: string): Promise<AgentContext> => {
  const sc = getServiceClient();

  const { data: profile } = await sc
    .from("user_profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  const role = (profile?.role as AgentContext["role"]) ?? null;

  if (role === "admin") {
    return {
      role,
      isAdmin: true,
      canQualify: true,
      canUseMarketingPipeline: true,
      canSelfAssign: true,
      enrichmentBudgetCents: null,
      budgetPeriod: "total",
    };
  }

  if (role !== "freelance") {
    return { role, isAdmin: false, ...DENIED };
  }

  const { data: settings, error } = await sc
    .from("agent_settings")
    .select(
      "can_qualify, can_use_marketing_pipeline, can_self_assign, enrichment_budget_cents, budget_period",
    )
    .eq("agent_id", userId)
    .maybeSingle();

  // Migration non appliquée ou pas de ligne → aucune capacité.
  if (error || !settings) {
    if (error && !isMissingTable(error)) {
      // Erreur inattendue : on reste en refus, mais on la laisse visible.
      console.warn("agent_settings lookup failed:", error.message);
    }
    return { role, isAdmin: false, ...DENIED };
  }

  return {
    role,
    isAdmin: false,
    canQualify: settings.can_qualify === true,
    canUseMarketingPipeline: settings.can_use_marketing_pipeline === true,
    canSelfAssign: settings.can_self_assign === true,
    enrichmentBudgetCents:
      typeof settings.enrichment_budget_cents === "number" ? settings.enrichment_budget_cents : null,
    budgetPeriod: settings.budget_period === "total" ? "total" : "month",
  };
};

export const hasCapability = (ctx: AgentContext, capability: AgentCapability): boolean => {
  switch (capability) {
    case "qualify":
      return ctx.canQualify;
    case "marketing_pipeline":
      return ctx.canUseMarketingPipeline;
    case "self_assign":
      return ctx.canSelfAssign;
  }
};

export type CapabilityResult =
  | { ok: true; context: AgentContext }
  | { ok: false; response: Response };

/**
 * Vérifie qu'une capacité est accordée au caller. Renvoie un 403 prêt à
 * retourner sinon. Appelé par `withAuth` quand l'option `capability` est posée ;
 * le code de route n'a normalement pas à l'appeler directement.
 */
export const requireCapability = async (
  user: { id: string },
  capability: AgentCapability,
  extraHeaders: Record<string, string> = {},
): Promise<CapabilityResult> => {
  const context = await resolveAgentContext(user.id);
  if (!hasCapability(context, capability)) {
    return {
      ok: false,
      response: jsonError("capability_refusee", 403, { capability }, extraHeaders),
    };
  }
  return { ok: true, context };
};

/** Début de la période de budget courante, en ISO. `total` → epoch. */
export const budgetPeriodStart = (period: BudgetPeriod, now: Date = new Date()): string => {
  if (period === "total") return new Date(0).toISOString();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
};

/**
 * Dépense déjà engagée par un agent sur la période. Renvoie 0 si la table
 * n'existe pas encore — un budget ne peut pas bloquer sur une base incomplète.
 */
export const spentCentsForAgent = async (
  agentId: string,
  period: BudgetPeriod,
): Promise<number> => {
  const { data, error } = await getServiceClient()
    .from("agent_usage_events")
    .select("cost_cents")
    .eq("agent_id", agentId)
    .gte("created_at", budgetPeriodStart(period));

  if (error || !data) return 0;
  return data.reduce((sum, row) => sum + (Number(row.cost_cents) || 0), 0);
};
