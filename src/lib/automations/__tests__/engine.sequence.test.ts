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

import { processSequenceEnrollment } from '../engine';
import type { SequenceEnrollment } from '@/components/automations/types';

type ChainResult = { data: unknown; error?: unknown };

/** Chaîne Supabase générique : les lectures se terminent sur maybeSingle / limit / in. */
const tableChain = (result: ChainResult = { data: null, error: null }) => {
  const captured: { updates: unknown[]; inserts: unknown[] } = { updates: [], inserts: [] };
  const c: any = { captured };
  for (const m of ['select', 'eq', 'not', 'lte', 'gte', 'order']) {
    c[m] = jest.fn(() => c);
  }
  c.limit = jest.fn(() => Promise.resolve(result));
  c.in = jest.fn(() => Promise.resolve(result));
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

const sequenceWith = (kind: string, extra: Record<string, unknown> = {}) => ({
  id: 'auto-1',
  name: 'Artisans',
  kind: 'sequence',
  status: 'on',
  definition: { steps: [{ id: 's1', kind, day: 0, template: 'tpl-1', ...extra }] },
  settings: {},
});

const enrollment: SequenceEnrollment = {
  id: 'enr-1',
  automation_id: 'auto-1',
  contact_id: 'c-1',
  opportunite_id: null,
  entreprise_id: 42,
  current_step: 0,
  status: 'active',
  next_run_at: new Date().toISOString(),
  vars: {},
  created_by: null,
  entered_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  finished_at: null,
};

const ORIGINAL_ENV = { ...process.env };

describe('processSequenceEnrollment', () => {
  let tables: Record<string, any>;

  const wire = (automationRow: Record<string, unknown>, over: Record<string, any> = {}) => {
    tables = {
      automations: tableChain({ data: automationRow, error: null }),
      contacts: tableChain({
        data: {
          first_name: 'Jean',
          last_name: 'Test',
          email: 'jean@test.fr',
          tel: '0600',
          role_title: null,
          linkedin_url: null,
        },
        error: null,
      }),
      entreprises: tableChain({
        data: { name: 'Clim Ouest', ville: 'Angers', site_web_canonique: null, owner_id: 'agent-1' },
        error: null,
      }),
      opportunites: tableChain({ data: [], error: null }),
      audits: tableChain({ data: [], error: null }),
      sites: tableChain({ data: [], error: null }),
      email_templates: tableChain({ data: { subject: 'Objet', body: 'Bonjour' }, error: null }),
      whatsapp_templates: tableChain({ data: { body: 'Coucou {{contact.first_name}}' }, error: null }),
      call_scripts: tableChain({ data: null, error: null }),
      automation_connections: tableChain({ data: null, error: null }),
      email_signature_settings: tableChain({ data: null, error: null }),
      email_logs: tableChain(),
      sequence_enrollments: tableChain(),
      prospection_tasks: tableChain({ data: [], error: null }),
      regulator_settings: tableChain({
        data: { id: 'global', task_routing_mode: 'pref', task_max_per_agent: 8 },
        error: null,
      }),
      user_profiles: tableChain({ data: [{ id: 'admin-1' }], error: null }),
      agent_settings: tableChain({ data: [], error: null }),
      ...over,
    };
    mockFrom.mockImplementation((table: string) => {
      if (!tables[table]) throw new Error(`unexpected table: ${table}`);
      return tables[table];
    });
  };

  beforeEach(() => {
    mockFrom.mockReset();
    mockSend.mockReset();
    process.env = { ...ORIGINAL_ENV, RESEND_API_KEY: 'test-key' };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('envoie l’email et avance l’étape — l’heure a déjà été décidée par le régulateur', async () => {
    wire(sequenceWith('email'));
    mockSend.mockResolvedValue({ data: { id: 're-1' }, error: null });

    await processSequenceEnrollment(enrollment);

    expect(mockSend).toHaveBeenCalledTimes(1);
    const updates = tables.sequence_enrollments.captured.updates as Record<string, unknown>[];
    // 1) on efface la réservation du régulateur et on note la date d'envoi
    expect(updates[0]).toEqual(
      expect.objectContaining({ send_at: null, hold_reason: null, last_email_at: expect.any(String) }),
    );
    // 2) séquence à une seule étape → terminée
    expect(updates[1]).toEqual(expect.objectContaining({ current_step: 1, status: 'finished' }));
  });

  it('journalise l’envoi avec sa séquence — sinon impossible de compter un plafond par séquence', async () => {
    wire(sequenceWith('email'));
    mockSend.mockResolvedValue({ data: { id: 're-1' }, error: null });

    await processSequenceEnrollment(enrollment);

    const logged = (tables.email_logs.captured.inserts as Record<string, unknown>[])[0];
    expect(logged).toEqual(
      expect.objectContaining({ automation_id: 'auto-1', enrollment_id: 'enr-1', type: 'sequence' }),
    );
  });

  it('n’enregistre pas de date d’envoi quand Resend échoue', async () => {
    wire(sequenceWith('email'));
    mockSend.mockResolvedValue({ data: null, error: { message: 'rejected' } });

    await processSequenceEnrollment(enrollment);

    const updates = tables.sequence_enrollments.captured.updates as Record<string, unknown>[];
    expect(updates[0]).toEqual({ send_at: null, hold_reason: null });
  });

  it('gèle l’inscription et dit pourquoi quand la séquence est en pause', async () => {
    wire({ ...sequenceWith('email'), status: 'paused' });

    await processSequenceEnrollment(enrollment);

    expect(mockSend).not.toHaveBeenCalled();
    expect(tables.sequence_enrollments.captured.updates).toEqual([
      { send_at: null, hold_reason: 'sequence_paused' },
    ]);
  });

  it('crée une tâche WhatsApp attribuée au propriétaire du contact, jamais un envoi', async () => {
    wire(sequenceWith('whatsapp'));

    await processSequenceEnrollment(enrollment);

    expect(mockSend).not.toHaveBeenCalled();
    const task = (tables.prospection_tasks.captured.inserts as Record<string, unknown>[])[0];
    expect(task).toEqual(
      expect.objectContaining({
        kind: 'whatsapp',
        assignee_id: 'agent-1',
        routing_reason: 'propriétaire du contact',
        enrollment_id: 'enr-1',
      }),
    );
    // La séquence attend le geste humain.
    expect(tables.sequence_enrollments.captured.updates).toEqual([
      { next_run_at: null, send_at: null, hold_reason: null },
    ]);
  });

  it('bascule la tâche chez l’admin quand personne ne suit l’entreprise', async () => {
    wire(sequenceWith('whatsapp'), {
      entreprises: tableChain({
        data: { name: 'Clim Ouest', ville: 'Angers', site_web_canonique: null, owner_id: null },
        error: null,
      }),
    });

    await processSequenceEnrollment(enrollment);

    const task = (tables.prospection_tasks.captured.inserts as Record<string, unknown>[])[0];
    expect(task).toEqual(
      expect.objectContaining({
        assignee_id: 'admin-1',
        routing_reason: expect.stringContaining('aucun propriétaire'),
      }),
    );
  });

  it('en mode « tout à l’admin », même un contact suivi part chez l’admin', async () => {
    wire(sequenceWith('whatsapp'), {
      regulator_settings: tableChain({
        data: { id: 'global', task_routing_mode: 'admin', task_max_per_agent: 8 },
        error: null,
      }),
    });

    await processSequenceEnrollment(enrollment);

    const task = (tables.prospection_tasks.captured.inserts as Record<string, unknown>[])[0];
    expect(task).toEqual(expect.objectContaining({ assignee_id: 'admin-1' }));
  });
});
