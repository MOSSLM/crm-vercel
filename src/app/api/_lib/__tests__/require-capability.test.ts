/**
 * @jest-environment node
 *
 * Garde de capacité : le point sensible est le **défaut = refus**. Un agent
 * sans réglage, ou une base où la migration n'est pas appliquée, ne doit ouvrir
 * aucun accès — et un admin doit toujours passer.
 */

const mockFrom = jest.fn();

jest.mock("@/env", () => ({
  SUPABASE_URL: "http://localhost",
  SUPABASE_SERVICE_ROLE_KEY: "service-role",
}));

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    from: (...args: unknown[]) => mockFrom(...args),
    auth: { getUser: jest.fn() },
  })),
}));

import {
  budgetPeriodStart,
  hasCapability,
  resolveAgentContext,
  type AgentContext,
} from "../require-capability";
import { __resetServiceClientForTests } from "../service-client";

/** `.from(table).select(...).eq(...).maybeSingle()` renvoyant une valeur fixe. */
const singleResult = (result: { data: unknown; error?: unknown }) => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    gte: () => chain,
    maybeSingle: async () => ({ data: result.data, error: result.error ?? null }),
  };
  return chain;
};

const routeTables =
  (byTable: Record<string, { data: unknown; error?: unknown }>) => (table: string) =>
    singleResult(byTable[table] ?? { data: null });

beforeEach(() => {
  __resetServiceClientForTests();
  mockFrom.mockReset();
});

describe("resolveAgentContext", () => {
  it("donne toutes les capacités à un admin, sans plafond", async () => {
    mockFrom.mockImplementation(routeTables({ user_profiles: { data: { role: "admin" } } }));

    const ctx = await resolveAgentContext("admin-1");

    expect(ctx.isAdmin).toBe(true);
    expect(ctx.canQualify).toBe(true);
    expect(ctx.canUseMarketingPipeline).toBe(true);
    expect(ctx.enrichmentBudgetCents).toBeNull();
  });

  it("refuse tout à un freelance sans ligne agent_settings", async () => {
    mockFrom.mockImplementation(
      routeTables({
        user_profiles: { data: { role: "freelance" } },
        agent_settings: { data: null },
      }),
    );

    const ctx = await resolveAgentContext("agent-1");

    expect(ctx.canQualify).toBe(false);
    expect(ctx.canUseMarketingPipeline).toBe(false);
  });

  it("refuse tout quand la table agent_settings n'existe pas encore", async () => {
    mockFrom.mockImplementation(
      routeTables({
        user_profiles: { data: { role: "freelance" } },
        agent_settings: {
          data: null,
          error: { code: "42P01", message: 'relation "agent_settings" does not exist' },
        },
      }),
    );

    const ctx = await resolveAgentContext("agent-1");

    expect(ctx.canQualify).toBe(false);
    expect(ctx.canUseMarketingPipeline).toBe(false);
  });

  it("lit les capacités et le plafond accordés à un freelance", async () => {
    mockFrom.mockImplementation(
      routeTables({
        user_profiles: { data: { role: "freelance" } },
        agent_settings: {
          data: {
            can_qualify: true,
            can_use_marketing_pipeline: false,
            enrichment_budget_cents: 2500,
            budget_period: "month",
          },
        },
      }),
    );

    const ctx = await resolveAgentContext("agent-1");

    expect(ctx.canQualify).toBe(true);
    expect(ctx.canUseMarketingPipeline).toBe(false);
    expect(ctx.enrichmentBudgetCents).toBe(2500);
    expect(ctx.budgetPeriod).toBe("month");
  });

  it("refuse tout à un rôle client", async () => {
    mockFrom.mockImplementation(routeTables({ user_profiles: { data: { role: "client" } } }));

    const ctx = await resolveAgentContext("client-1");

    expect(ctx.canQualify).toBe(false);
    expect(ctx.canUseMarketingPipeline).toBe(false);
  });
});

describe("hasCapability", () => {
  const ctx = (over: Partial<AgentContext>): AgentContext => ({
    role: "freelance",
    isAdmin: false,
    canQualify: false,
    canUseMarketingPipeline: false,
    enrichmentBudgetCents: null,
    budgetPeriod: "month",
    ...over,
  });

  it("mappe chaque capacité sur son propre drapeau", () => {
    expect(hasCapability(ctx({ canQualify: true }), "qualify")).toBe(true);
    expect(hasCapability(ctx({ canQualify: true }), "marketing_pipeline")).toBe(false);
    expect(hasCapability(ctx({ canUseMarketingPipeline: true }), "marketing_pipeline")).toBe(true);
    expect(hasCapability(ctx({ canUseMarketingPipeline: true }), "qualify")).toBe(false);
  });
});

describe("budgetPeriodStart", () => {
  it("borne le mois au 1er à minuit UTC", () => {
    expect(budgetPeriodStart("month", new Date("2026-07-27T14:31:00Z"))).toBe(
      "2026-07-01T00:00:00.000Z",
    );
  });

  it("borne le 1er du mois à lui-même, pas au mois précédent", () => {
    expect(budgetPeriodStart("month", new Date("2026-07-01T00:00:00Z"))).toBe(
      "2026-07-01T00:00:00.000Z",
    );
  });

  it("remonte à l'epoch pour un budget total", () => {
    expect(budgetPeriodStart("total", new Date("2026-07-27T14:31:00Z"))).toBe(
      "1970-01-01T00:00:00.000Z",
    );
  });
});
