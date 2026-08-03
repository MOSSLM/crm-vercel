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
  /** La liste de suppression est illisible (panne passagère). */
  suppressionsError?: boolean
  /** La lecture des réglages échoue (panne passagère). */
  settingsError?: boolean
  /** La colonne n'existe pas encore (migration non appliquée). */
  settingsMissingColumn?: boolean
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
          if (state.settingsMissingColumn) {
            return chain({ data: null, error: { code: '42703', message: 'column does not exist' } })
          }
          if (state.settingsError) {
            return chain({ data: null, error: { code: '08006', message: 'connection failure' } })
          }
          return chain({
            data: { verify_before_send: state.verifyBeforeSend ?? false, test_mode: state.testMode ?? false },
            error: null,
          })
        case 'test_email_addresses':
          return chain({ data: (state.allowlist ?? []).map((email) => ({ email })), error: null })
        case 'email_verifications':
          return chain({ data: state.verifications ?? [], error: null })
        case 'email_suppressions':
          if (state.suppressionsError) {
            return chain({ data: null, error: { code: '08006', message: 'connection failure' } })
          }
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

/* ── Défauts trouvés par l'audit de mise en service ──────────────────────── */

describe('audit — le garde ne doit jamais s’ouvrir par accident', () => {
  it('bloque une chaîne qui n’est pas une adresse', async () => {
    // Auparavant `normalizeEmail` rendait `null`, TOUS les contrôles étaient
    // sautés, et le garde répondait « autorisé » — il laissait passer
    // exactement ce qu'il y a de moins fiable.
    const sb = clientOf({ verifyBeforeSend: true })
    for (const mauvais of ['', 'pas-une-adresse', '@garage.fr', 'jean@', null, undefined]) {
      const verdict = await allowRecipient(sb, mauvais)
      expect(verdict.allowed).toBe(false)
      expect(verdict.reason).toBe('email_invalid')
    }
  })

  it('applique la liste de suppression MÊME garde de vérification coupé', async () => {
    // Un désabonnement est une obligation légale, pas un réglage de confort :
    // couper la vérification ne doit pas rouvrir la porte.
    const sb = clientOf({
      verifyBeforeSend: false,
      suppressions: [{ email: 'jean@garage.fr', reason: 'unsubscribe' }],
    })
    const verdict = await allowRecipient(sb, 'jean@garage.fr')
    expect(verdict.allowed).toBe(false)
    expect(verdict.reason).toBe('email_suppressed')
  })

  it('retient l’envoi quand la liste de suppression est ILLISIBLE', async () => {
    // « Je ne sais pas qui s'est désabonné » ne vaut pas « personne ne l'est ».
    const sb = clientOf({ verifyBeforeSend: true, suppressionsError: true })
    const verdict = await allowRecipient(sb, 'jean@garage.fr')
    expect(verdict.allowed).toBe(false)
    expect(verdict.reason).toBe('email_unverified')
  })

  it('garde le garde ACTIF quand la lecture des réglages échoue', async () => {
    // Une panne passagère ne doit pas se traduire par « garde désactivé, tout
    // passe » : c'est le moment où il faut retenir, pas ouvrir les vannes.
    const sb = clientOf({ settingsError: true })
    const verdict = await allowRecipient(sb, 'jean@garage.fr')
    expect(verdict.allowed).toBe(false)
    expect(verdict.reason).toBe('email_unverified')
  })

  it('reste inactif quand la colonne n’existe pas encore', async () => {
    // Migration non appliquée : c'est légitime, pas une panne. On retrouve le
    // comportement d'avant.
    const sb = clientOf({ settingsMissingColumn: true })
    expect((await allowRecipient(sb, 'jean@garage.fr')).allowed).toBe(true)
  })

  it('bloque une adresse supprimée dans un tri de LOT, garde coupé', async () => {
    const sb = clientOf({
      verifyBeforeSend: false,
      suppressions: [{ email: 'partie@garage.fr', reason: 'complaint' }],
    })
    const policy = await loadSendPolicy(sb, ['partie@garage.fr', 'ok@garage.fr'])
    expect(eligibilityFor(policy, 'partie@garage.fr')).toBe('blocked')
    expect(eligibilityFor(policy, 'ok@garage.fr')).toBe('ok')
  })
})
