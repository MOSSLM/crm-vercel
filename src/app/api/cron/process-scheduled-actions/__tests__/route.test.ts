/**
 * @jest-environment node
 */
import { __resetServiceClientForTests } from '@/app/api/_lib/service-client';

const mockFrom = jest.fn();

jest.mock('@/env', () => ({
  SUPABASE_URL: 'http://localhost',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role',
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: (...args: unknown[]) => mockFrom(...args),
    auth: { getUser: jest.fn() },
  })),
}));

const ORIGINAL_ENV = { ...process.env };

const cronRequest = (auth?: string | null) => {
  const headers: Record<string, string> = {};
  if (auth !== null && auth !== undefined) headers.authorization = auth;
  return new Request('http://localhost/api/cron/process-scheduled-actions', { headers });
};

/**
 * Chainable mock for `from('table').select(...).eq(...).lte(...).order(...)`.
 * The terminal call (`order` / `single` / `maybeSingle`) resolves to `result`.
 */
const buildSelectChain = (result: { data: unknown; error: unknown }) => ({
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  lte: jest.fn().mockReturnThis(),
  order: jest.fn().mockResolvedValue(result),
  single: jest.fn().mockResolvedValue(result),
  maybeSingle: jest.fn().mockResolvedValue(result),
});

const buildInsertChain = (result: { data?: unknown; error: unknown }) => ({
  insert: jest.fn().mockResolvedValue(result),
});

/** Chainable mock for `update(...).eq(...)` (terminal `.eq` resolves). */
const buildUpdateChain = (result: { error: unknown } = { error: null }) => {
  const captured: { updates: unknown[] } = { updates: [] };
  const chain = {
    update: jest.fn().mockImplementation((u: unknown) => {
      captured.updates.push(u);
      return chain;
    }),
    eq: jest.fn().mockResolvedValue(result),
    captured,
  };
  return chain;
};

describe('GET /api/cron/process-scheduled-actions', () => {
  beforeEach(() => {
    __resetServiceClientForTests();
    mockFrom.mockReset();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.CRON_SECRET;
    delete process.env.PG_CRON_SECRET;
    delete process.env.NODE_ENV;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  const importRoute = async () => {
    jest.resetModules();
    return await import('../route');
  };

  describe('auth', () => {
    it('rejects with 401 when CRON_SECRET configured and header missing', async () => {
      process.env.CRON_SECRET = 'shh';
      const { GET } = await importRoute();
      const res = await GET(cronRequest(null));
      expect(res.status).toBe(401);
    });

    it('rejects with 401 when CRON_SECRET configured and header mismatched', async () => {
      process.env.CRON_SECRET = 'shh';
      const { GET } = await importRoute();
      const res = await GET(cronRequest('Bearer wrong'));
      expect(res.status).toBe(401);
    });

    it('rejects with 401 in production when neither secret is set', async () => {
      process.env.NODE_ENV = 'production';
      const { GET } = await importRoute();
      const res = await GET(cronRequest(null));
      expect(res.status).toBe(401);
    });

    it('accepts a valid pg_cron secret header (x-pg-cron-secret)', async () => {
      process.env.PG_CRON_SECRET = 'pg-shh';
      mockFrom.mockReturnValueOnce(buildSelectChain({ data: [], error: null }));
      const pgReq = new Request('http://localhost/api/cron/process-scheduled-actions', {
        headers: { 'x-pg-cron-secret': 'pg-shh' },
      });
      const { GET } = await importRoute();
      const res = await GET(pgReq);
      expect(res.status).toBe(200);
    });

    it('rejects when only pg_cron is configured and the wrong header arrives', async () => {
      process.env.PG_CRON_SECRET = 'pg-shh';
      const pgReq = new Request('http://localhost/api/cron/process-scheduled-actions', {
        headers: { 'x-pg-cron-secret': 'wrong' },
      });
      const { GET } = await importRoute();
      const res = await GET(pgReq);
      expect(res.status).toBe(401);
    });

    it('allows in dev when CRON_SECRET is unset', async () => {
      // NODE_ENV undefined / 'test' — bypass
      mockFrom.mockReturnValueOnce(buildSelectChain({ data: [], error: null }));
      const { GET } = await importRoute();
      const res = await GET(cronRequest(null));
      expect(res.status).toBe(200);
    });

    it('allows when header matches CRON_SECRET', async () => {
      process.env.CRON_SECRET = 'shh';
      mockFrom.mockReturnValueOnce(buildSelectChain({ data: [], error: null }));
      const { GET } = await importRoute();
      const res = await GET(cronRequest('Bearer shh'));
      expect(res.status).toBe(200);
    });
  });

  describe('processing', () => {
    it('returns { processed: 0 } when no pending actions', async () => {
      mockFrom.mockReturnValueOnce(buildSelectChain({ data: [], error: null }));
      const { GET } = await importRoute();
      const res = await GET(cronRequest(null));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ processed: 0 });
    });

    it('returns 500 when the initial fetch fails', async () => {
      mockFrom.mockReturnValueOnce(
        buildSelectChain({ data: null, error: { message: 'db down' } }),
      );
      const { GET } = await importRoute();
      const res = await GET(cronRequest(null));
      expect(res.status).toBe(500);
    });

    it('executes a create_task action and marks the row as executed', async () => {
      const pending = [{
        id: 'sa-1',
        workflow_id: 'wf-1',
        opportunite_id: 'opp-1',
        action: { type: 'create_task', params: { titre: 'Relancer client' } },
        attempts: 0,
      }];

      const fetchPending = buildSelectChain({ data: pending, error: null });
      const oppLookup = buildSelectChain({ data: { entreprise_id: 42 }, error: null });
      const insertTask = buildInsertChain({ error: null });
      const markExecuted = buildUpdateChain();

      mockFrom
        .mockReturnValueOnce(fetchPending)
        .mockReturnValueOnce(oppLookup)
        .mockReturnValueOnce(insertTask)
        .mockReturnValueOnce(markExecuted);

      const { GET } = await importRoute();
      const res = await GET(cronRequest(null));

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ processed: 1 });
      expect(insertTask.insert).toHaveBeenCalledWith(expect.objectContaining({
        opportunite_id: 'opp-1',
        entreprise_id: 42,
        titre: 'Relancer client',
        workflow_id: 'wf-1',
      }));
      expect(markExecuted.captured.updates).toEqual([{ status: 'executed' }]);
    });

    it('on transient error: increments attempts, sets last_error, keeps pending for retry', async () => {
      const pending = [{
        id: 'sa-1',
        workflow_id: 'wf-1',
        opportunite_id: 'opp-1',
        action: { type: 'add_note', params: { content: 'note' } },
        attempts: 0,
      }];

      const fetchPending = buildSelectChain({ data: pending, error: null });
      const insertNote = buildInsertChain({ error: null });
      // Make the insert throw via mocking from('opportunite_notes').insert to reject
      insertNote.insert = jest.fn().mockRejectedValue(new Error('boom'));
      const markRetry = buildUpdateChain();

      mockFrom
        .mockReturnValueOnce(fetchPending)
        .mockReturnValueOnce(insertNote)
        .mockReturnValueOnce(markRetry);

      const { GET } = await importRoute();
      const res = await GET(cronRequest(null));

      expect(res.status).toBe(200);
      expect(markRetry.captured.updates).toEqual([
        expect.objectContaining({
          status: 'pending',
          attempts: 1,
          last_error: expect.stringContaining('boom'),
        }),
      ]);
    });

    it('on error after MAX_ATTEMPTS-1 previous attempts: marks failed (terminal)', async () => {
      const pending = [{
        id: 'sa-1',
        workflow_id: 'wf-1',
        opportunite_id: 'opp-1',
        action: { type: 'add_note', params: { content: 'note' } },
        attempts: 2, // next failure → attempts = 3 → terminal
      }];

      const fetchPending = buildSelectChain({ data: pending, error: null });
      const insertNote = { insert: jest.fn().mockRejectedValue(new Error('boom again')) };
      const markFailed = buildUpdateChain();

      mockFrom
        .mockReturnValueOnce(fetchPending)
        .mockReturnValueOnce(insertNote)
        .mockReturnValueOnce(markFailed);

      const { GET } = await importRoute();
      await GET(cronRequest(null));

      expect(markFailed.captured.updates).toEqual([
        expect.objectContaining({
          status: 'failed',
          attempts: 3,
          last_error: expect.stringContaining('boom again'),
        }),
      ]);
    });

    it('idempotency: already-executed rows are not in the pending fetch and are not re-processed', async () => {
      // Pending fetch returns only one row; rows with status='executed' aren't selected.
      const pending = [{
        id: 'sa-1',
        workflow_id: 'wf-1',
        opportunite_id: 'opp-1',
        action: { type: 'add_note', params: { content: 'hi' } },
        attempts: 0,
      }];

      const fetchPending = buildSelectChain({ data: pending, error: null });
      const insertNote = buildInsertChain({ error: null });
      const markExecuted = buildUpdateChain();

      mockFrom
        .mockReturnValueOnce(fetchPending)
        .mockReturnValueOnce(insertNote)
        .mockReturnValueOnce(markExecuted);

      const { GET } = await importRoute();
      await GET(cronRequest(null));

      // Verify the fetch filter targeted only pending rows.
      expect(fetchPending.eq).toHaveBeenCalledWith('status', 'pending');
    });
  });
});
