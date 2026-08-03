// Le garde d'envoi : qui a le droit de recevoir, et dans quel ordre les motifs
// se départagent.

import { BLOCK_LABEL, allowRecipient, eligibilityFor, loadSendPolicy, resetSendGuardCache } from '../send-guard'
import { resetTestGuardCache } from '../test-guard'

type Row = Record<string, unknown>

/**
 * Faux client Supabase, réduit à ce que le garde consulte : les réglages, la
 * liste blanche de la phase de test, les verdicts et les suppressions.
 */
const clientOf = (state: {
  verifyBeforeSend?: boolean
  testMode?: boolean
  allowlist?: string[]
  verifications?: Row[]
  suppressions?: Row[]
}) => {
  const chain = (result: { data: unknown; error?: unknown }) => {
    const self: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'in', 'gt', 'order', 'limit', 'neq', 'or', 'lte']) {
      self[method] = jest.fn(() => self)
    }
    self.maybeSingle = jest.fn().mockResolvedValue(result)
    self.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
    return self
  }

  return {
    from: jest.fn((table: string) => {
      switch (table) {
        case 'regulator_settings':
          return chain({
            data: { verify_before_send: state.verifyBeforeSend ?? false, test_mode: state.testMode ?? false },
            error: null,
          })
        case 'test_email_addresses':
          return chain({ data: (state.allowlist ?? []).map((email) => ({ email })), error: null })
        case 'email_verifications':
          return chain({ data: state.verifications ?? [], error: null })
        case 'email_suppressions':
          return chain({ data: state.suppressions ?? [], error: null })
        default:
          return chain({ data: [], error: null })
      }
    }),
  } as never
}

const soon = new Date(Date.now() + 86_400_000).toISOString()
const past = new Date(Date.now() - 86_400_000).toISOString()

const verdict = (over: Row = {}): Row => ({
  email: 'jean@garage.fr',
  status: 'valid',
  sub_status: 'mx_ok',
  score: 80,
  suggestion: null,
  checked_at: past,
  expires_at: soon,
  details: { reason: 'domaine joignable, rien à signaler' },
  ...over,
})

beforeEach(() => {
  resetSendGuardCache()
  resetTestGuardCache()
})

describe('allowRecipient — garde de vérification coupé', () => {
  it('laisse tout passer, comme avant', async () => {
    // Le réglage absent (migration non jouée) ne doit jamais bloquer des envois
    // légitimes : c'est le même parti pris que le garde de phase de test.
    const sb = clientOf({ verifyBeforeSend: false })
    expect(await allowRecipient(sb, 'jean@garage.fr')).toEqual({ allowed: true })
  })
})

describe('allowRecipient — ordre des motifs', () => {
  it('la suppression passe avant la phase de test', async () => {
    // Envoyer à quelqu'un qui s'est désabonné n'est pas un détail : ça prime
    // même sur la liste blanche des tests.
    const sb = clientOf({
      verifyBeforeSend: true,
      testMode: true,
      allowlist: ['jean@garage.fr'],
      suppressions: [{ email: 'jean@garage.fr', reason: 'unsubscribe' }],
    })
    const result = await allowRecipient(sb, 'jean@garage.fr')
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('email_suppressed')
  })

  it('bloque une adresse invalide', async () => {
    const sb = clientOf({
      verifyBeforeSend: true,
      verifications: [verdict({ status: 'invalid', sub_status: 'domaine_mort' })],
    })
    expect((await allowRecipient(sb, 'jean@garage.fr')).reason).toBe('email_invalid')
  })

  it('bloque une adresse invalide même si son verdict est périmé', async () => {
    // Une syntaxe cassée ne se répare pas toute seule : revérifier ne ferait que
    // retarder le constat.
    const sb = clientOf({
      verifyBeforeSend: true,
      verifications: [verdict({ status: 'invalid', sub_status: 'syntaxe', expires_at: past })],
    })
    expect((await allowRecipient(sb, 'jean@garage.fr')).reason).toBe('email_invalid')
  })

  it('retient une adresse jamais vérifiée', async () => {
    const sb = clientOf({ verifyBeforeSend: true, verifications: [] })
    expect((await allowRecipient(sb, 'jean@garage.fr')).reason).toBe('email_unverified')
  })

  it('retient une adresse dont le verdict a expiré', async () => {
    const sb = clientOf({ verifyBeforeSend: true, verifications: [verdict({ expires_at: past })] })
    expect((await allowRecipient(sb, 'jean@garage.fr')).reason).toBe('email_unverified')
  })

  it('laisse passer une adresse douteuse — le quota s’applique dans la file, pas ici', async () => {
    const sb = clientOf({ verifyBeforeSend: true, verifications: [verdict({ status: 'risky' })] })
    expect((await allowRecipient(sb, 'jean@garage.fr')).allowed).toBe(true)
  })

  it('laisse passer une adresse au verdict frais', async () => {
    const sb = clientOf({ verifyBeforeSend: true, verifications: [verdict()] })
    expect((await allowRecipient(sb, 'jean@garage.fr')).allowed).toBe(true)
  })

  it('applique la phase de test une fois la vérification franchie', async () => {
    const sb = clientOf({
      verifyBeforeSend: true,
      testMode: true,
      allowlist: ['moi@perso.fr'],
      verifications: [verdict()],
    })
    const result = await allowRecipient(sb, 'jean@garage.fr')
    expect(result.reason).toBe('mode_test')
    expect(result.allowlist).toEqual(['moi@perso.fr'])
  })

  it('reconnaît une adresse écrite autrement', async () => {
    // Le verdict est rangé sous la forme normalisée ; sans normalisation à la
    // lecture, toute adresse en majuscules serait éternellement « à vérifier ».
    const sb = clientOf({ verifyBeforeSend: true, verifications: [verdict()] })
    expect((await allowRecipient(sb, '  Jean@Garage.FR ')).allowed).toBe(true)
  })
})

describe('BLOCK_LABEL', () => {
  it('donne un motif lisible pour chaque blocage', () => {
    // Ces phrases finissent dans `email_logs.error_message` et sous les yeux de
    // l'utilisateur : aucune ne doit être un code.
    for (const label of Object.values(BLOCK_LABEL)) {
      expect(label.length).toBeGreaterThan(10)
      expect(label).not.toMatch(/_/)
    }
  })
})

describe('loadSendPolicy / eligibilityFor', () => {
  it('trie une liste entière en une lecture', async () => {
    const sb = clientOf({
      verifyBeforeSend: true,
      verifications: [
        verdict({ email: 'ok@garage.fr' }),
        verdict({ email: 'douteuse@garage.fr', status: 'risky' }),
        verdict({ email: 'morte@garage.fr', status: 'invalid' }),
      ],
    })
    const policy = await loadSendPolicy(sb, [
      'ok@garage.fr',
      'douteuse@garage.fr',
      'morte@garage.fr',
      'inconnue@garage.fr',
    ])

    expect(eligibilityFor(policy, 'ok@garage.fr')).toBe('ok')
    expect(eligibilityFor(policy, 'douteuse@garage.fr')).toBe('risky')
    expect(eligibilityFor(policy, 'morte@garage.fr')).toBe('blocked')
    expect(eligibilityFor(policy, 'inconnue@garage.fr')).toBe('pending')
  })

  it('rend tout éligible quand le garde est coupé', async () => {
    const sb = clientOf({ verifyBeforeSend: false })
    const policy = await loadSendPolicy(sb, ['inconnue@garage.fr'])
    expect(eligibilityFor(policy, 'inconnue@garage.fr')).toBe('ok')
  })

  it('bloque ce qui n’est même pas une adresse', async () => {
    const sb = clientOf({ verifyBeforeSend: true })
    const policy = await loadSendPolicy(sb, [])
    expect(eligibilityFor(policy, 'pas-une-adresse')).toBe('blocked')
  })
})
