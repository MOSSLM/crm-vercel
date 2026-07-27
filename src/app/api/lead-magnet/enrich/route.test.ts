/**
 * @jest-environment node
 */
const mockAuthGetUser = jest.fn();
const mockFetch = jest.fn();
const mockFrom = jest.fn();

jest.mock('@/env', () => ({
  SUPABASE_URL: 'http://localhost',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role',
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: (...args: unknown[]) => mockFrom(...args),
    auth: { getUser: (...args: unknown[]) => mockAuthGetUser(...args) },
  })),
}));

import { POST } from './route';
import { __resetServiceClientForTests } from '@/app/api/_lib/service-client';

/**
 * Chaîne Supabase minimale : `.select().eq().gte().maybeSingle()` et
 * l'`await` direct de la requête (pour les listes) renvoient la même valeur.
 */
const chainFor = (data: unknown, error: unknown = null) => {
  const result = { data, error };
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    gte: () => chain,
    insert: async () => ({ error: null }),
    maybeSingle: async () => result,
    then: (resolve: (v: unknown) => unknown) => resolve(result),
  };
  return chain;
};

/** Table → données renvoyées. Les tables non listées répondent `null`. */
const tables = (byTable: Record<string, unknown>) => (table: string) =>
  chainFor(byTable[table] ?? null);

describe('POST /api/lead-magnet/enrich', () => {
  const ORIGINAL_FETCH = global.fetch;
  beforeEach(() => {
    __resetServiceClientForTests();
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    global.fetch = mockFetch as unknown as typeof fetch;
    // Par défaut le caller est admin : aucun contrôle de budget, comportement
    // historique de la route inchangé.
    mockFrom.mockImplementation(tables({ user_profiles: { role: 'admin' } }));
  });
  afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
    jest.clearAllMocks();
  });

  const VALID_UUID = '00000000-0000-4000-8000-000000000000';

  const post = (body: unknown, opts: { authorization?: string | null } = {}) => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (opts.authorization === undefined) headers.authorization = 'Bearer test-token';
    else if (opts.authorization !== null) headers.authorization = opts.authorization;
    return POST(
      new Request('http://localhost/api/lead-magnet/enrich', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }),
    );
  };

  it('forwards to upstream Supabase function on happy path', async () => {
    const res = await post({ project_id: VALID_UUID });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, init] = mockFetch.mock.calls[0];
    expect((init as RequestInit).body).toContain(VALID_UUID);
  });

  it('returns 401 without Authorization header', async () => {
    const res = await post({ project_id: VALID_UUID }, { authorization: null });
    expect(res.status).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns 400 invalid_body when project_id is not a UUID', async () => {
    const res = await post({ project_id: 'not-a-uuid' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_body');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns 502 when upstream returns non-OK', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'boom' }), { status: 500 }),
    );
    const res = await post({ project_id: VALID_UUID });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('edge_function_request_failed');
  });

  // ── Garde de capacité + budget pour les agents freelance ──────────────────

  it("refuse un freelance sans la capacité marketing_pipeline", async () => {
    mockFrom.mockImplementation(
      tables({
        user_profiles: { role: 'freelance' },
        agent_settings: { can_qualify: true, can_use_marketing_pipeline: false },
      }),
    );
    const res = await post({ project_id: VALID_UUID });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('capability_refusee');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("refuse un freelance sur une entreprise qui ne lui est pas attribuée", async () => {
    mockFrom.mockImplementation(
      tables({
        user_profiles: { role: 'freelance' },
        agent_settings: { can_qualify: false, can_use_marketing_pipeline: true },
        lead_magnet_projects: { id: VALID_UUID, entreprise_id: 42 },
        entreprises: { id: 42, owner_id: 'someone-else' },
      }),
    );
    const res = await post({ project_id: VALID_UUID });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('entreprise_non_attribuee');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('renvoie 402 quand le plafond de dépense de l\'agent est atteint', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'agent_usage_events') return chainFor([{ cost_cents: 900 }]);
      return tables({
        user_profiles: { role: 'freelance' },
        agent_settings: {
          can_qualify: false,
          can_use_marketing_pipeline: true,
          enrichment_budget_cents: 1000,
          budget_period: 'month',
        },
        lead_magnet_projects: { id: VALID_UUID, entreprise_id: 42 },
        entreprises: { id: 42, owner_id: 'user-1' },
        enrichment_llm_settings: { provider: 'openai', model: 'gpt-5', cost_per_run_cents: 200 },
      })(table);
    });

    const res = await post({ project_id: VALID_UUID });
    expect(res.status).toBe(402);
    expect((await res.json()).error).toBe('budget_depasse');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("laisse passer un agent sous son plafond", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'agent_usage_events') return chainFor([{ cost_cents: 100 }]);
      return tables({
        user_profiles: { role: 'freelance' },
        agent_settings: {
          can_qualify: false,
          can_use_marketing_pipeline: true,
          enrichment_budget_cents: 1000,
          budget_period: 'month',
        },
        lead_magnet_projects: { id: VALID_UUID, entreprise_id: 42 },
        entreprises: { id: 42, owner_id: 'user-1' },
        enrichment_llm_settings: { provider: 'openai', model: 'gpt-5', cost_per_run_cents: 200 },
      })(table);
    });

    const res = await post({ project_id: VALID_UUID });
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
