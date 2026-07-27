import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { budgetPeriodStart, type BudgetPeriod } from "@/app/api/_lib/require-capability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = (req: Request) => preflight(req);

const LIMIT = 150;

const isMissingTable = (error: { code?: string; message?: string } | null): boolean =>
  !!error &&
  (error.code === "42P01" ||
    error.code === "PGRST205" ||
    /does not exist|could not find the table/i.test(error.message ?? ""));

/**
 * GET /api/admin/agent-activity?agent_id=
 *
 * Journal des actions d'un agent (décisions de qualification et étapes du
 * marketing pipeline) + sa dépense d'enrichissement, sur sa période de budget
 * et en cumul.
 */
export const GET = withAuth({ role: "admin" }, async ({ req, cors }) => {
  const agentId = new URL(req.url).searchParams.get("agent_id");
  if (!agentId) return jsonError("agent_id requis", 400, {}, cors);

  const sc = getServiceClient();

  const [eventsRes, usageRes, settingsRes] = await Promise.all([
    sc
      .from("agent_activity_events")
      .select("id, entreprise_id, action, metadata, created_at, entreprises(id, name, ville)")
      .eq("agent_id", agentId)
      .order("created_at", { ascending: false })
      .limit(LIMIT),
    sc
      .from("agent_usage_events")
      .select("id, entreprise_id, kind, provider, model, cost_cents, created_at")
      .eq("agent_id", agentId)
      .order("created_at", { ascending: false })
      .limit(LIMIT),
    sc
      .from("agent_settings")
      .select("enrichment_budget_cents, budget_period")
      .eq("agent_id", agentId)
      .maybeSingle(),
  ]);

  if (eventsRes.error && !isMissingTable(eventsRes.error)) {
    return jsonError(eventsRes.error.message, 500, {}, cors);
  }

  const migrationApplied = !isMissingTable(eventsRes.error) && !isMissingTable(usageRes.error);

  const period: BudgetPeriod = settingsRes.data?.budget_period === "total" ? "total" : "month";
  const since = budgetPeriodStart(period);
  const usage = usageRes.data ?? [];

  return json(
    {
      events: eventsRes.data ?? [],
      usage,
      spend: {
        period,
        period_cents: usage
          .filter((u) => String(u.created_at) >= since)
          .reduce((sum, u) => sum + (Number(u.cost_cents) || 0), 0),
        total_cents: usage.reduce((sum, u) => sum + (Number(u.cost_cents) || 0), 0),
        budget_cents:
          typeof settingsRes.data?.enrichment_budget_cents === "number"
            ? settingsRes.data.enrichment_budget_cents
            : null,
      },
      migration_applied: migrationApplied,
    },
    { headers: cors },
  );
});
