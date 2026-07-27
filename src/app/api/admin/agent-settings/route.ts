import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { adminAgentSettingsSchema, type AdminAgentSettingsPayload } from "@/app/api/_lib/schemas";
import { budgetPeriodStart, type BudgetPeriod } from "@/app/api/_lib/require-capability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = (req: Request) => preflight(req);

type SettingsRow = {
  agent_id: string;
  can_qualify: boolean;
  can_use_marketing_pipeline: boolean;
  enrichment_budget_cents: number | null;
  budget_period: BudgetPeriod;
};

const DEFAULTS = {
  can_qualify: false,
  can_use_marketing_pipeline: false,
  enrichment_budget_cents: null,
  budget_period: "month" as BudgetPeriod,
};

/** `true` quand la migration 20260727 n'a pas encore été appliquée. */
const isMissingTable = (error: { code?: string; message?: string } | null): boolean =>
  !!error &&
  (error.code === "42P01" ||
    error.code === "PGRST205" ||
    /does not exist|could not find the table/i.test(error.message ?? ""));

/**
 * GET /api/admin/agent-settings
 *
 * Capacités de tous les agents freelance + dépense d'enrichissement engagée sur
 * la période de chacun. Les agents sans ligne remontent avec les valeurs par
 * défaut (aucune capacité), pour que l'UI n'ait pas à gérer l'absence.
 *
 * Dégrade proprement : si la migration n'est pas appliquée, renvoie les
 * défauts avec `migration_applied: false` — l'écran affiche un avertissement
 * plutôt que de tomber en erreur.
 */
export const GET = withAuth({ role: "admin" }, async ({ cors }) => {
  const sc = getServiceClient();

  const { data: agents, error: agentsErr } = await sc
    .from("user_profiles")
    .select("id")
    .eq("role", "freelance");
  if (agentsErr) return jsonError(agentsErr.message, 500, {}, cors);

  const agentIds = (agents ?? []).map((a) => a.id as string);
  if (agentIds.length === 0) {
    return json({ settings: [], spend: {}, migration_applied: true }, { headers: cors });
  }

  const { data: rows, error } = await sc
    .from("agent_settings")
    .select("agent_id, can_qualify, can_use_marketing_pipeline, enrichment_budget_cents, budget_period")
    .in("agent_id", agentIds);

  if (error && isMissingTable(error)) {
    return json(
      {
        settings: agentIds.map((agent_id) => ({ agent_id, ...DEFAULTS })),
        spend: {},
        migration_applied: false,
      },
      { headers: cors },
    );
  }
  if (error) return jsonError(error.message, 500, {}, cors);

  const byAgent = new Map((rows ?? []).map((r) => [r.agent_id as string, r as SettingsRow]));
  const settings = agentIds.map((agent_id) => ({
    agent_id,
    ...DEFAULTS,
    ...(byAgent.get(agent_id) ?? {}),
  }));

  // Dépense engagée par agent, sur sa propre période de budget.
  const spend: Record<string, { period_cents: number; total_cents: number }> = {};
  const { data: usage } = await sc
    .from("agent_usage_events")
    .select("agent_id, cost_cents, created_at")
    .in("agent_id", agentIds);

  for (const s of settings) {
    const since = budgetPeriodStart(s.budget_period);
    const own = (usage ?? []).filter((u) => u.agent_id === s.agent_id);
    spend[s.agent_id] = {
      period_cents: own
        .filter((u) => String(u.created_at) >= since)
        .reduce((sum, u) => sum + (Number(u.cost_cents) || 0), 0),
      total_cents: own.reduce((sum, u) => sum + (Number(u.cost_cents) || 0), 0),
    };
  }

  return json({ settings, spend, migration_applied: true }, { headers: cors });
});

/**
 * POST /api/admin/agent-settings
 *
 * Accorde ou retire les capacités d'un agent et fixe son plafond de dépense.
 * Upsert : la première écriture crée la ligne.
 */
export const POST = withAuth<AdminAgentSettingsPayload>(
  { role: "admin", body: adminAgentSettingsSchema },
  async ({ body, user, cors }) => {
    const sc = getServiceClient();

    const { data: target } = await sc
      .from("user_profiles")
      .select("id, role")
      .eq("id", body.agent_id)
      .maybeSingle();
    if (!target) return jsonError("agent_introuvable", 404, {}, cors);
    if (target.role !== "freelance") {
      return jsonError("cible_non_freelance", 400, {}, cors);
    }

    const { error } = await sc.from("agent_settings").upsert(
      {
        agent_id: body.agent_id,
        can_qualify: body.can_qualify,
        can_use_marketing_pipeline: body.can_use_marketing_pipeline,
        enrichment_budget_cents: body.enrichment_budget_cents ?? null,
        budget_period: body.budget_period,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      },
      { onConflict: "agent_id" },
    );

    if (error) {
      if (isMissingTable(error)) {
        return jsonError("migration_non_appliquee", 503, { table: "agent_settings" }, cors);
      }
      return jsonError(error.message, 500, {}, cors);
    }

    return json({ ok: true }, { headers: cors });
  },
);
