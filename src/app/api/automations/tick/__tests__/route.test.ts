/**
 * @jest-environment node
 */
import { __resetServiceClientForTests } from '@/app/api/_lib/service-client';

const mockFrom = jest.fn();
const mockDispatchEvent = jest.fn();
const mockRunWorkflowAutomation = jest.fn();
const mockProcessSequenceEnrollment = jest.fn();

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

jest.mock('@/lib/automations/dispatch', () => ({
  dispatchEvent: (...args: unknown[]) => mockDispatchEvent(...args),
}));

jest.mock('@/lib/automations/engine', () => ({
  runWorkflowAutomation: (...args: unknown[]) => mockRunWorkflowAutomation(...args),
  processSequenceEnrollment: (...args: unknown[]) => mockProcessSequenceEnrollment(...args),
  // Deterministic gap for throttle assertions (real impl: 2-7 min random).
  randomSendGapMs: () => 120_000,
}));

const ORIGINAL_ENV = { ...process.env };

const cronRequest = (headers: Record<string, string> = {}) =>
  new Request('http://localhost/api/automations/tick', { headers });

const buildSelectChain = (result: { data: unknown; error?: unknown }) => ({
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  not: jest.fn().mockReturnThis(),
  lte: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  limit: jest.fn().mockResolvedValue(result),
  maybeSingle: jest.fn().mockResolvedValue(result),
});

const buildUpdateChain = () => {
  const captured: { updates: unknown[]; ids: unknown[] } = { updates: [], ids: [] };
  const chain = {
    update: jest.fn().mockImplementation((u: unknown) => {
      captured.updates.push(u);
      return chain;
    }),
    eq: jest.fn().mockImplementation((_col: string, val: unknown) => {
      captured.ids.push(val);
      return Promise.resolve({ error: null });
    }),
    captured,
  };
  return chain;
};

// Empty result for the 3 fetch queries (event jobs, wf jobs, enrollments).
const emptyAll = () => {
  mockFrom
    .mockReturnValueOnce(buildSelectChain({ data: [], error: null }))   // event jobs fetch
    .mockReturnValueOnce(buildSelectChain({ data: [], error: null }))   // wf jobs fetch
    .mockReturnValueOnce(buildSelectChain({ data: [], error: null }));  // enrollments fetch
};

describe('GET /api/automations/tick', () => {
  beforeEach(() => {
    __resetServiceClientForTests();
    mockFrom.mockReset();
    mockDispatchEvent.mockReset();
    mockRunWorkflowAutomation.mockReset();
    mockProcessSequenceEnrollment.mockReset();
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
    it('rejects with 401 in production when CRON_SECRET is unset (fail-closed)', async () => {
      process.env.NODE_ENV = 'production';
      const { GET } = await importRoute();
      const res = await GET(cronRequest());
      expect(res.status).toBe(401);
    });

    it('rejects with 401 when secrets configured but header mismatched', async () => {
      process.env.CRON_SECRET = 'shh';
      const { GET } = await importRoute();
      const res = await GET(cronRequest({ authorization: 'Bearer wrong' }));
      expect(res.status).toBe(401);
    });

    it('accepts a valid Vercel Bearer secret', async () => {
      process.env.CRON_SECRET = 'shh';
      emptyAll();
      const { GET } = await importRoute();
      const res = await GET(cronRequest({ authorization: 'Bearer shh' }));
      expect(res.status).toBe(200);
    });

    it('accepts a valid pg_cron secret header', async () => {
      process.env.PG_CRON_SECRET = 'pg-shh';
      emptyAll();
      const { GET } = await importRoute();
      const res = await GET(cronRequest({ 'x-pg-cron-secret': 'pg-shh' }));
      expect(res.status).toBe(200);
    });

    it('allows in dev when no secrets configured', async () => {
      emptyAll();
      const { GET } = await importRoute();
      const res = await GET(cronRequest());
      expect(res.status).toBe(200);
    });
  });

  describe('event-job processing', () => {
    it('marks a job done on successful dispatch', async () => {
      const eventJobs = [{
        id: 'ej-1', job_type: 'scheduled_trigger', payload: { event: 'x' }, attempts: 0,
      }];
      const markProcessing = buildUpdateChain();
      const markDone = buildUpdateChain();

      mockFrom
        .mockReturnValueOnce(buildSelectChain({ data: eventJobs, error: null }))  // fetch event jobs
        .mockReturnValueOnce(markProcessing)                                       // mark processing
        .mockReturnValueOnce(markDone)                                             // mark done
        .mockReturnValueOnce(buildSelectChain({ data: [], error: null }))         // wf jobs fetch
        .mockReturnValueOnce(buildSelectChain({ data: [], error: null }));        // enrollments fetch

      mockDispatchEvent.mockResolvedValueOnce(undefined);

      const { GET } = await importRoute();
      const res = await GET(cronRequest());

      expect(res.status).toBe(200);
      expect(markProcessing.captured.updates).toEqual([{ status: 'processing' }]);
      expect(markDone.captured.updates).toEqual([{ status: 'done' }]);
    });

    it('on transient error: increments attempts, keeps pending for retry', async () => {
      const eventJobs = [{
        id: 'ej-1', job_type: 'scheduled_trigger', payload: { event: 'x' }, attempts: 0,
      }];
      const markProcessing = buildUpdateChain();
      const markRetry = buildUpdateChain();

      mockFrom
        .mockReturnValueOnce(buildSelectChain({ data: eventJobs, error: null }))
        .mockReturnValueOnce(markProcessing)
        .mockReturnValueOnce(markRetry)
        .mockReturnValueOnce(buildSelectChain({ data: [], error: null }))
        .mockReturnValueOnce(buildSelectChain({ data: [], error: null }));

      mockDispatchEvent.mockRejectedValueOnce(new Error('upstream down'));

      const { GET } = await importRoute();
      await GET(cronRequest());

      expect(markRetry.captured.updates).toEqual([
        expect.objectContaining({
          status: 'pending',
          attempts: 1,
          last_error: expect.stringContaining('upstream down'),
        }),
      ]);
    });

    it('after MAX_ATTEMPTS-1 prior failures: marks error (terminal)', async () => {
      const eventJobs = [{
        id: 'ej-1', job_type: 'scheduled_trigger', payload: { event: 'x' }, attempts: 2,
      }];
      const markProcessing = buildUpdateChain();
      const markFailed = buildUpdateChain();

      mockFrom
        .mockReturnValueOnce(buildSelectChain({ data: eventJobs, error: null }))
        .mockReturnValueOnce(markProcessing)
        .mockReturnValueOnce(markFailed)
        .mockReturnValueOnce(buildSelectChain({ data: [], error: null }))
        .mockReturnValueOnce(buildSelectChain({ data: [], error: null }));

      mockDispatchEvent.mockRejectedValueOnce(new Error('still down'));

      const { GET } = await importRoute();
      await GET(cronRequest());

      expect(markFailed.captured.updates).toEqual([
        expect.objectContaining({
          status: 'error',
          attempts: 3,
          last_error: expect.stringContaining('still down'),
        }),
      ]);
    });

    it('one failing job does not poison the batch', async () => {
      const eventJobs = [
        { id: 'ej-1', job_type: 'scheduled_trigger', payload: {}, attempts: 0 },
        { id: 'ej-2', job_type: 'scheduled_trigger', payload: {}, attempts: 0 },
      ];
      const markProcessing1 = buildUpdateChain();
      const markRetry1 = buildUpdateChain();
      const markProcessing2 = buildUpdateChain();
      const markDone2 = buildUpdateChain();

      mockFrom
        .mockReturnValueOnce(buildSelectChain({ data: eventJobs, error: null }))
        .mockReturnValueOnce(markProcessing1)
        .mockReturnValueOnce(markRetry1)
        .mockReturnValueOnce(markProcessing2)
        .mockReturnValueOnce(markDone2)
        .mockReturnValueOnce(buildSelectChain({ data: [], error: null }))
        .mockReturnValueOnce(buildSelectChain({ data: [], error: null }));

      mockDispatchEvent
        .mockRejectedValueOnce(new Error('first fails'))
        .mockResolvedValueOnce(undefined);

      const { GET } = await importRoute();
      const res = await GET(cronRequest());

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.events).toBe(1);
      expect(body.errors).toBe(1);
      expect(markDone2.captured.updates).toEqual([{ status: 'done' }]);
    });
  });

  describe('sequence throttling', () => {
    it('shares one throttle (seeded from email_logs) across all due enrollments', async () => {
      const lastSent = new Date(Date.now() - 60_000).toISOString();
      const enrollments = [
        { id: 'enr-1', status: 'active', current_step: 0 },
        { id: 'enr-2', status: 'active', current_step: 1 },
      ];

      mockFrom
        .mockReturnValueOnce(buildSelectChain({ data: [], error: null }))           // event jobs fetch
        .mockReturnValueOnce(buildSelectChain({ data: [], error: null }))           // wf jobs fetch
        .mockReturnValueOnce(buildSelectChain({ data: enrollments, error: null }))  // enrollments fetch
        .mockReturnValueOnce(buildSelectChain({ data: [{ sent_at: lastSent }], error: null })); // last sequence email

      mockProcessSequenceEnrollment.mockResolvedValue(undefined);

      const { GET } = await importRoute();
      const res = await GET(cronRequest());

      expect(res.status).toBe(200);
      expect(mockFrom.mock.calls.map((c) => c[0])).toContain('email_logs');
      expect(mockProcessSequenceEnrollment).toHaveBeenCalledTimes(2);

      const [, throttle1] = mockProcessSequenceEnrollment.mock.calls[0];
      const [, throttle2] = mockProcessSequenceEnrollment.mock.calls[1];
      expect(throttle1).toBeDefined();
      expect(throttle1).toBe(throttle2); // same shared object → cumulative slots
      // Seeded at least one gap after the last sent sequence email.
      expect((throttle1 as { nextSlot: number }).nextSlot).toBeGreaterThanOrEqual(
        new Date(lastSent).getTime() + 120_000,
      );
    });

    it('does not query email_logs when no enrollment is due', async () => {
      emptyAll();
      const { GET } = await importRoute();
      await GET(cronRequest());
      expect(mockFrom.mock.calls.map((c) => c[0])).not.toContain('email_logs');
    });
  });

  describe('workflow-job processing', () => {
    it('on transient error: increments attempts, keeps pending for retry', async () => {
      const wfJobs = [{
        id: 'wf-1', job_type: 'workflow_node', payload: { node_id: 'n1', context: {} },
        automation_id: 'auto-1', run_id: 'run-1', attempts: 0,
      }];
      const markProcessing = buildUpdateChain();
      const markRetry = buildUpdateChain();

      mockFrom
        .mockReturnValueOnce(buildSelectChain({ data: [], error: null }))  // event jobs fetch
        .mockReturnValueOnce(buildSelectChain({ data: wfJobs, error: null }))  // wf jobs fetch
        .mockReturnValueOnce(markProcessing)
        .mockReturnValueOnce(buildSelectChain({ data: { id: 'auto-1' }, error: null }))  // auto lookup
        .mockReturnValueOnce(markRetry)
        .mockReturnValueOnce(buildSelectChain({ data: [], error: null }));  // enrollments fetch

      mockRunWorkflowAutomation.mockRejectedValueOnce(new Error('node crashed'));

      const { GET } = await importRoute();
      await GET(cronRequest());

      expect(markRetry.captured.updates).toEqual([
        expect.objectContaining({
          status: 'pending',
          attempts: 1,
          last_error: expect.stringContaining('node crashed'),
        }),
      ]);
    });
  });
});
