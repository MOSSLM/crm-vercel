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
  /** Simule une lecture qui échoue, table par table. */
  erreurs?: Partial<Record<'regulator_settings' | 'email_suppressions', { code?: string; message?: string }>>
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
          return chain(
            state.erreurs?.regulator_settings
              ? { data: null, error: state.erreurs.regulator_settings }
              : {
                  data: {
                    verify_before_send: state.verifyBeforeSend ?? false,
                    test_mode: state.testMode ?? false,
                  },
                  error: null,
                },
          )
        case 'test_email_addresses':
          return chain({ data: (state.allowlist ?? []).map((email) => ({ email })), error: null })
        case 'email_verifications':
          return chain({ data: state.verifications ?? [], error: null })
        case 'email_suppressions':
          return chain(
            state.erreurs?.email_suppressions
              ? { data: null, error: state.erreurs.email_suppressions }
              : { data: state.suppressions ?? [], error: null },
          )
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

/* ── Ce que l'audit du 20/08/2026 a trouvé ───────────────────────────────── */

describe('la suppression ne dépend d’aucun réglage', () => {
  beforeEach(() => {
    resetSendGuardCache()
    resetTestGuardCache()
  })

  /**
   * LE DÉFAUT, TEL QU'IL ÉTAIT. Le contrôle de suppression vivait dans
   * `if (await verifyEnabled(sb))`. Éteindre « vérifier les adresses avant
   * d'envoyer » — un réglage de délivrabilité — éteignait donc aussi, en
   * silence, la liste des rebonds durs, des plaintes et des DÉSABONNEMENTS.
   * L'en-tête du fichier promettait pourtant l'inverse depuis le premier jour.
   */
  it('bloque un désabonné même quand la vérification est éteinte', async () => {
    const sb = clientOf({
      verifyBeforeSend: false,
      suppressions: [{ email: 'parti@artisan.fr' }],
    })
    const v = await allowRecipient(sb, 'parti@artisan.fr')
    expect(v.allowed).toBe(false)
    expect(v.reason).toBe('email_suppressed')
  })

  it('laisse passer les autres adresses, vérification éteinte', async () => {
    const sb = clientOf({ verifyBeforeSend: false, suppressions: [{ email: 'parti@artisan.fr' }] })
    expect((await allowRecipient(sb, 'present@artisan.fr')).allowed).toBe(true)
  })

  // UNE LISTE ILLISIBLE N'EST PAS UNE LISTE VIDE. Retenir coûte un tour de
  // régulateur ; se tromper coûte un email à quelqu'un qui s'est désabonné.
  it('retient l’envoi quand la liste des désabonnés ne peut pas être lue', async () => {
    const sb = clientOf({
      verifyBeforeSend: false,
      erreurs: { email_suppressions: { code: '57014', message: 'canceling statement' } },
    })
    const v = await allowRecipient(sb, 'quelquun@artisan.fr')
    expect(v.allowed).toBe(false)
    expect(v.reason).toBe('suppression_illisible')
    expect(BLOCK_LABEL[v.reason!]).toMatch(/illisible/i)
  })

  // Table absente = migration non appliquée. Il n'y a rien à lire, c'est un
  // état connu, et bloquer toute la prospection pour ça serait absurde.
  it('n’est pas retenu quand la table n’existe pas encore', async () => {
    const sb = clientOf({
      verifyBeforeSend: false,
      erreurs: { email_suppressions: { code: '42P01', message: 'relation does not exist' } },
    })
    expect((await allowRecipient(sb, 'quelquun@artisan.fr')).allowed).toBe(true)
  })

  it('le régulateur voit lui aussi les désabonnés, vérification éteinte', async () => {
    const sb = clientOf({ verifyBeforeSend: false, suppressions: [{ email: 'parti@artisan.fr' }] })
    const policy = await loadSendPolicy(sb, ['parti@artisan.fr', 'present@artisan.fr'])
    expect(eligibilityFor(policy, 'parti@artisan.fr')).toBe('blocked')
    expect(eligibilityFor(policy, 'present@artisan.fr')).toBe('ok')
  })
})

describe('« le réglage dit non » n’est pas « je n’ai pas pu le lire »', () => {
  beforeEach(() => {
    resetSendGuardCache()
    resetTestGuardCache()
  })

  /**
   * La lecture ne destructurait pas `error` : une requête en échec rendait
   * `data = null`, donc `verify_before_send = false` — la réponse permissive —
   * et la mettait en cache quinze secondes. Le garde s'ouvrait sur une panne.
   */
  it('retombe du côté prudent quand le réglage est illisible', async () => {
    const sb = clientOf({
      erreurs: { regulator_settings: { code: '57014', message: 'canceling statement' } },
      verifications: [],
    })
    // Vérification supposée ACTIVE : l'adresse sans verdict est retenue.
    const v = await allowRecipient(sb, 'inconnue@artisan.fr')
    expect(v.allowed).toBe(false)
    expect(v.reason).toBe('email_unverified')
  })

  it('mais une colonne absente reste un « non » légitime', async () => {
    const sb = clientOf({
      erreurs: { regulator_settings: { code: '42703', message: 'column does not exist' } },
    })
    expect((await allowRecipient(sb, 'inconnue@artisan.fr')).allowed).toBe(true)
  })

  // Un incident de quelques secondes ne doit pas gouverner les quinze
  // suivantes : un échec ne se met jamais en cache.
  it('ne met jamais un échec de lecture en cache', async () => {
    const enPanne = clientOf({ erreurs: { regulator_settings: { code: '57014' } } })
    await allowRecipient(enPanne, 'inconnue@artisan.fr')
    const remis = clientOf({ verifyBeforeSend: false })
    expect((await allowRecipient(remis, 'inconnue@artisan.fr')).allowed).toBe(true)
  })
})
