/**
 * @jest-environment node
 */

const mockSend = jest.fn();
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: (...args: unknown[]) => mockSend(...args) } })),
}));

const mockFrom = jest.fn();
jest.mock('@/app/api/_lib/service-client', () => ({
  getServiceClient: () => ({ from: (...args: unknown[]) => mockFrom(...args) }),
}));

import { processSequenceEnrollment, type SendThrottle } from '../engine';
import type { SequenceEnrollment } from '@/components/automations/types';

const MIN_GAP = 120_000;
const MAX_GAP = 420_000;

type ChainResult = { data: unknown; error?: unknown };

/** Generic supabase query chain: selects resolve via maybeSingle, updates/inserts are captured. */
const tableChain = (result: ChainResult = { data: null, error: null }) => {
  const captured: { updates: unknown[]; inserts: unknown[] } = { updates: [], inserts: [] };
  const c: any = { captured };
  for (const m of ['select', 'eq', 'not', 'lte', 'in', 'order', 'limit']) {
    c[m] = jest.fn(() => c);
  }
  c.maybeSingle = jest.fn().mockResolvedValue(result);
  c.single = jest.fn().mockResolvedValue(result);
  c.update = jest.fn((u: unknown) => {
    captured.updates.push(u);
    return c;
  });
  c.insert = jest.fn((i: unknown) => {
    captured.inserts.push(i);
    return Promise.resolve({ error: null });
  });
  return c;
};

const automationRow = {
  id: 'auto-1',
  kind: 'sequence',
  status: 'on',
  definition: { steps: [{ id: 's1', kind: 'email', day: 0, template: 'tpl-1' }] },
};

const enrollment: SequenceEnrollment = {
  id: 'enr-1',
  automation_id: 'auto-1',
  contact_id: 'c-1',
  opportunite_id: null,
  entreprise_id: null,
  current_step: 0,
  status: 'active',
  next_run_at: new Date().toISOString(),
  vars: {},
  entered_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  finished_at: null,
};

const ORIGINAL_ENV = { ...process.env };

describe('processSequenceEnrollment — send throttle', () => {
  let tables: Record<string, any>;

  beforeEach(() => {
    mockFrom.mockReset();
    mockSend.mockReset();
    process.env = { ...ORIGINAL_ENV, RESEND_API_KEY: 'test-key' };

    tables = {
      automations: tableChain({ data: automationRow, error: null }),
      contacts: tableChain({
        data: { first_name: 'Jean', last_name: 'Test', email: 'jean@test.fr', tel: null, role_title: null, linkedin_url: null },
        error: null,
      }),
      email_templates: tableChain({ data: { subject: 'Objet', body: 'Bonjour' }, error: null }),
      automation_connections: tableChain({ data: null, error: null }),
      email_signature_settings: tableChain({ data: null, error: null }),
      email_logs: tableChain(),
      sequence_enrollments: tableChain(),
    };
    mockFrom.mockImplementation((table: string) => {
      if (!tables[table]) throw new Error(`unexpected table: ${table}`);
      return tables[table];
    });
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('defers the email (no send, no step advance) when the slot is in the future', async () => {
    const slot = Date.now() + 100_000;
    const throttle: SendThrottle = { nextSlot: slot };

    await processSequenceEnrollment(enrollment, throttle);

    expect(mockSend).not.toHaveBeenCalled();
    // Only one update: next_run_at pushed to the reserved slot, current_step untouched.
    const updates = tables.sequence_enrollments.captured.updates as Record<string, unknown>[];
    expect(updates).toHaveLength(1);
    expect(updates[0]).toEqual({ next_run_at: new Date(slot).toISOString() });
    // The next slot was reserved for the following enrollment of the batch.
    expect(throttle.nextSlot).toBeGreaterThanOrEqual(slot + MIN_GAP);
    expect(throttle.nextSlot).toBeLessThanOrEqual(slot + MAX_GAP);
  });

  it('sends and reserves a fresh 2-7 min slot when the slot is reached', async () => {
    const throttle: SendThrottle = { nextSlot: Date.now() - 1000 };
    mockSend.mockResolvedValue({ data: { id: 're-1' }, error: null });

    const before = Date.now();
    await processSequenceEnrollment(enrollment, throttle);

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(throttle.nextSlot).toBeGreaterThanOrEqual(before + MIN_GAP);
    expect(throttle.nextSlot).toBeLessThanOrEqual(Date.now() + MAX_GAP);
    // Single email step → sequence finishes after sending.
    const updates = tables.sequence_enrollments.captured.updates as Record<string, unknown>[];
    expect(updates).toHaveLength(1);
    expect(updates[0]).toEqual(
      expect.objectContaining({ current_step: 1, status: 'finished' }),
    );
  });

  it('sends immediately when no throttle is provided (manual/test runs)', async () => {
    mockSend.mockResolvedValue({ data: { id: 're-2' }, error: null });

    await processSequenceEnrollment(enrollment);

    expect(mockSend).toHaveBeenCalledTimes(1);
  });
});
