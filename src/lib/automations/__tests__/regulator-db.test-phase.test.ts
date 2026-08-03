/**
 * @jest-environment node
 *
 * La garantie de la phase de test tient ici, pas au moment de l'envoi : un
 * prospect hors liste blanche doit être écarté de la file AVANT qu'un envoi ne
 * soit préparé. S'il entrait dans la file, il occuperait un créneau, l'étape
 * serait franchie, et sa carte changerait de colonne dans le pipeline
 * commercial — pour un email qui n'est jamais parti.
 */

const mockFrom = jest.fn()
jest.mock('@/app/api/_lib/service-client', () => ({
  getServiceClient: () => ({ from: (...args: unknown[]) => mockFrom(...args) }),
}))

import { loadDueEnrollments } from '../regulator-db'
import { resetTestGuardCache } from '@/lib/email/test-guard'

type ChainResult = { data: unknown; error?: unknown }

/** Chaîne Supabase minimale : les lectures se terminent sur limit / in / maybeSingle. */
const chain = (result: ChainResult) => {
  const c: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'not', 'lte', 'gte', 'order']) c[m] = jest.fn(() => c)
  c.limit = jest.fn(() => Promise.resolve(result))
  c.in = jest.fn(() => Promise.resolve(result))
  c.maybeSingle = jest.fn().mockResolvedValue(result)
  c.then = (resolve: (v: ChainResult) => unknown) => Promise.resolve(result).then(resolve)
  return c
}

const enrollment = (id: string, contactId: string) => ({
  id,
  automation_id: 'auto-1',
  contact_id: contactId,
  entreprise_id: null,
  opportunite_id: null,
  current_step: 0,
  status: 'active',
  next_run_at: '2026-08-03T08:00:00.000Z',
  hold_reason: null,
  vars: {},
  created_by: null,
  entered_at: '2026-08-01T08:00:00.000Z',
  updated_at: '2026-08-01T08:00:00.000Z',
  finished_at: null,
})

const SEQUENCE = {
  id: 'auto-1',
  name: 'Artisans',
  kind: 'sequence',
  status: 'on',
  definition: { steps: [{ id: 's1', kind: 'email', day: 0, template: 'tpl-1' }] },
  settings: {},
}

/** Base en phase de test, avec la liste blanche donnée. */
const wire = (opts: { testMode: boolean; allowlist: string[]; contacts: { id: string; email: string }[] }) => {
  mockFrom.mockImplementation((table: string) => {
    switch (table) {
      case 'sequence_enrollments':
        return chain({ data: opts.contacts.map((c, i) => enrollment(`enr-${i}`, c.id)), error: null })
      case 'automations':
        return chain({ data: [SEQUENCE], error: null })
      case 'contacts':
        return chain({ data: opts.contacts, error: null })
      case 'entreprises':
        return chain({ data: [], error: null })
      case 'regulator_settings':
        return chain({ data: { id: 'global', test_mode: opts.testMode }, error: null })
      case 'test_email_addresses':
        return chain({ data: opts.allowlist.map((email) => ({ email })), error: null })
      default:
        return chain({ data: [], error: null })
    }
  })
}

const sb = { from: (...args: unknown[]) => mockFrom(...args) } as never

describe('loadDueEnrollments — phase de test', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resetTestGuardCache()
  })

  it('écarte de la file un prospect hors liste blanche', async () => {
    wire({
      testMode: true,
      allowlist: ['codingmos@gmail.com'],
      contacts: [{ id: 'c-1', email: 'contact@garage-reel.fr' }],
    })

    const { emails, testHeld } = await loadDueEnrollments(sb, Date.parse('2026-08-03T09:00:00.000Z'))

    expect(emails).toHaveLength(0)
    expect(testHeld.map((e) => e.enrollment.contact_id)).toEqual(['c-1'])
  })

  it('laisse passer une adresse de test — la démonstration doit se dérouler', async () => {
    wire({
      testMode: true,
      allowlist: ['codingmos@gmail.com'],
      contacts: [{ id: 'c-1', email: 'CodingMos@Gmail.com' }],
    })

    const { emails, testHeld } = await loadDueEnrollments(sb, Date.parse('2026-08-03T09:00:00.000Z'))

    // La casse ne doit rien changer : une adresse saisie en majuscules reste
    // la même adresse.
    expect(emails).toHaveLength(1)
    expect(testHeld).toHaveLength(0)
  })

  it('trie les deux populations dans le même tour', async () => {
    wire({
      testMode: true,
      allowlist: ['moi@test.fr'],
      contacts: [
        { id: 'c-1', email: 'moi@test.fr' },
        { id: 'c-2', email: 'contact@garage-reel.fr' },
      ],
    })

    const { emails, testHeld } = await loadDueEnrollments(sb, Date.parse('2026-08-03T09:00:00.000Z'))

    expect(emails.map((e) => e.enrollment.contact_id)).toEqual(['c-1'])
    expect(testHeld.map((e) => e.enrollment.contact_id)).toEqual(['c-2'])
  })

  it('hors phase de test, tout le monde passe', async () => {
    wire({
      testMode: false,
      allowlist: ['codingmos@gmail.com'],
      contacts: [{ id: 'c-1', email: 'contact@garage-reel.fr' }],
    })

    const { emails, testHeld } = await loadDueEnrollments(sb, Date.parse('2026-08-03T09:00:00.000Z'))

    expect(emails).toHaveLength(1)
    expect(testHeld).toHaveLength(0)
  })

  it('liste blanche vide : plus personne ne passe', async () => {
    wire({ testMode: true, allowlist: [], contacts: [{ id: 'c-1', email: 'moi@test.fr' }] })

    const { emails, testHeld } = await loadDueEnrollments(sb, Date.parse('2026-08-03T09:00:00.000Z'))

    expect(emails).toHaveLength(0)
    expect(testHeld).toHaveLength(1)
  })
})
