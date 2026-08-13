/**
 * @jest-environment node
 *
 * Ce que ce fichier vérifie, précisément parce que c'est facile à casser sans
 * s'en rendre compte :
 *  - les ouvertures/clics viennent de `email_events` (journal brut), jamais de
 *    `email_logs.delivery_status` — ce dernier écraserait les ouvertures dès
 *    qu'un « delivered » est déjà arrivé ;
 *  - un même événement (même resend_id + même type) ne se compte qu'une fois,
 *    même livré deux fois par Resend ;
 *  - la réponse et le RDV se lisent sur `sales_pipeline_state`, via
 *    l'opportunité de l'inscription — pas sur l'inscription elle-même ;
 *  - « réponse dès le 1ᵉʳ contact » ne compte que les inscriptions arrêtées à
 *    `current_step <= 1`.
 */
import { __resetServiceClientForTests } from '@/app/api/_lib/service-client'

jest.mock('@/env', () => ({
  SUPABASE_URL: 'http://localhost',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role',
}))

type Table = Record<string, unknown>

function builder(result: { data: unknown; error: unknown }) {
  const obj: Table = {
    select: jest.fn(() => obj),
    eq: jest.fn(() => obj),
    in: jest.fn(() => obj),
    gte: jest.fn(() => obj),
    order: jest.fn(() => obj),
    then: (resolve: (v: unknown) => void) => resolve(result),
  }
  return obj
}

const mockFrom = jest.fn()

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ from: (...args: unknown[]) => mockFrom(...args) })),
}))

describe('buildSequenceStatsView', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    __resetServiceClientForTests()
  })

  it('compte envois, ouvertures/clics depuis email_events, réponses et RDV depuis sales_pipeline_state', async () => {
    const tables: Record<string, { data: unknown; error: unknown }> = {
      automations: {
        data: [{ id: 'seq1', name: 'Artisans', status: 'on', definition: { steps: [{ kind: 'email' }] } }],
        error: null,
      },
      sequence_enrollments: {
        data: [
          // A : répond dès le 1er contact, RDV pris.
          { id: 'enr-a', automation_id: 'seq1', opportunite_id: 'opp-a', status: 'paused', current_step: 1 },
          // B : répond après plusieurs relances (pas au 1er contact).
          { id: 'enr-b', automation_id: 'seq1', opportunite_id: 'opp-b', status: 'exited', current_step: 3 },
          // C : jamais répondu.
          { id: 'enr-c', automation_id: 'seq1', opportunite_id: 'opp-c', status: 'finished', current_step: 4 },
        ],
        error: null,
      },
      sales_pipeline_state: {
        data: [
          { opportunite_id: 'opp-a', replied: true, rdv_at: '2026-08-01T10:00:00Z' },
          { opportunite_id: 'opp-b', replied: true, rdv_at: null },
          { opportunite_id: 'opp-c', replied: false, rdv_at: null },
        ],
        error: null,
      },
      email_logs: {
        data: [
          { automation_id: 'seq1', resend_id: 'r1', sent_at: '2026-08-01T08:00:00Z' },
          { automation_id: 'seq1', resend_id: 'r2', sent_at: '2026-08-01T08:00:00Z' },
          { automation_id: 'seq1', resend_id: 'r3', sent_at: '2026-08-01T08:00:00Z' },
        ],
        error: null,
      },
      email_events: {
        data: [
          { resend_id: 'r1', type: 'email.delivered', bounce_type: null },
          { resend_id: 'r1', type: 'email.opened', bounce_type: null },
          // Doublon Resend — ne doit compter qu'une fois.
          { resend_id: 'r1', type: 'email.opened', bounce_type: null },
          { resend_id: 'r2', type: 'email.delivered', bounce_type: null },
          { resend_id: 'r3', type: 'email.bounced', bounce_type: 'hard' },
        ],
        error: null,
      },
    }
    mockFrom.mockImplementation((table: string) => builder(tables[table] ?? { data: [], error: null }))

    const { buildSequenceStatsView } = await import('../_view')
    const view = await buildSequenceStatsView({})

    expect(view.rows).toHaveLength(1)
    const row = view.rows[0]

    expect(row.sent).toBe(3)
    expect(row.delivered).toBe(2)
    expect(row.opened).toBe(1) // r1 une seule fois malgré le doublon
    expect(row.bouncedHard).toBe(1)
    expect(row.openRate).toBeCloseTo(1 / 2) // ouverts / livrés, pas / envoyés

    expect(row.enrollmentsTotal).toBe(3)
    expect(row.repliedCount).toBe(2) // A et B
    expect(row.firstTouchRepliedCount).toBe(1) // seule A s'est arrêtée à current_step <= 1
    expect(row.rdvCount).toBe(1) // seule A a un rdv_at
    expect(row.rdvFromReplyRate).toBeCloseTo(1 / 2)

    expect(view.gaps).toHaveLength(0)
  })

  it('signale les tables absentes plutôt que de faire semblant que tout est à zéro', async () => {
    const missing = { code: 'PGRST205', message: 'Could not find the table' }
    const tables: Record<string, { data: unknown; error: unknown }> = {
      automations: { data: [{ id: 'seq1', name: 'Artisans', status: 'on', definition: { steps: [] } }], error: null },
      sequence_enrollments: { data: [], error: null },
      email_logs: { data: [], error: null },
      email_events: { data: null, error: missing },
    }
    mockFrom.mockImplementation((table: string) => builder(tables[table] ?? { data: [], error: null }))

    const { buildSequenceStatsView } = await import('../_view')
    const view = await buildSequenceStatsView({})

    // Pas de resend_id à chercher (aucun email envoyé) : email_events n'est
    // jamais interrogé dans ce cas, donc pas de trou signalé pour lui non plus.
    expect(view.rows[0].sent).toBe(0)
    expect(view.gaps).toHaveLength(0)
  })

  it('applique le filtre de période aux inscriptions et aux envois', async () => {
    const spies: Record<string, ReturnType<typeof builder>> = {}
    const tables: Record<string, { data: unknown; error: unknown }> = {
      automations: { data: [{ id: 'seq1', name: 'Artisans', status: 'on', definition: { steps: [] } }], error: null },
      sequence_enrollments: { data: [], error: null },
      email_logs: { data: [], error: null },
    }
    mockFrom.mockImplementation((table: string) => {
      const b = builder(tables[table] ?? { data: [], error: null })
      spies[table] = b
      return b
    })

    const { buildSequenceStatsView } = await import('../_view')
    await buildSequenceStatsView({ sinceDays: 30 })

    expect(spies.sequence_enrollments.gte).toHaveBeenCalledWith('entered_at', expect.any(String))
    expect(spies.email_logs.gte).toHaveBeenCalledWith('sent_at', expect.any(String))
  })
})
