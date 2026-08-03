import { DEFAULT_REGULATOR, type RegulatorSettings } from '@/lib/automations/regulator'
import { MIN_SENDS_FOR_GUARD, measureBounceRate, tripBounceGuard } from '../bounce-guard'

type Counts = { sent: number; hardBounces: number }

/**
 * Faux client : `email_logs` compte les envois, `email_events` les rebonds durs.
 * Les deux passent par `.select(_, {count, head})`, donc on rend un `count`.
 */
const clientOf = (counts: Counts, over: { updateFails?: boolean } = {}) => {
  const captured = { updates: [] as unknown[], notifications: [] as unknown[] }

  const chain = (result: Record<string, unknown>) => {
    const self: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'gte', 'order', 'limit', 'in']) {
      self[method] = jest.fn(() => self)
    }
    self.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
    return self
  }

  const sb = {
    from: jest.fn((table: string) => {
      if (table === 'email_logs') return chain({ count: counts.sent, error: null })
      if (table === 'email_events') return chain({ count: counts.hardBounces, error: null })
      if (table === 'regulator_settings') {
        const self: Record<string, unknown> = {
          update: jest.fn((patch: unknown) => {
            captured.updates.push(patch)
            return self
          }),
          eq: jest.fn(() =>
            Promise.resolve(over.updateFails ? { error: { message: 'refus' } } : { error: null }),
          ),
        }
        return self
      }
      if (table === 'user_profiles') return chain({ data: [{ id: 'admin-1' }], error: null })
      if (table === 'notifications') {
        return {
          insert: jest.fn((row: unknown) => {
            captured.notifications.push(row)
            return Promise.resolve({ error: null })
          }),
        }
      }
      return chain({ data: [], error: null })
    }),
  }

  return { sb: sb as never, captured }
}

const settings = (over: Partial<RegulatorSettings> = {}): RegulatorSettings => ({
  ...DEFAULT_REGULATOR,
  ...over,
})

describe('measureBounceRate', () => {
  it('calcule le taux à partir de faits, pas d’estimations', async () => {
    const { sb } = clientOf({ sent: 200, hardBounces: 10 })
    expect(await measureBounceRate(sb)).toEqual({ sent: 200, hardBounces: 10, rate: 5, measured: true })
  })

  it('ne divise pas par zéro', async () => {
    const { sb } = clientOf({ sent: 0, hardBounces: 0 })
    expect((await measureBounceRate(sb)).rate).toBe(0)
  })
})

describe('tripBounceGuard', () => {
  it('coupe la file au-delà du seuil', async () => {
    const { sb, captured } = clientOf({ sent: 200, hardBounces: 12 }) // 6 %
    const outcome = await tripBounceGuard(sb, settings({ bounceGuardThreshold: 4 }))

    expect(outcome.tripped).toBe(true)
    expect(captured.updates).toEqual([{ paused: true }])
    expect(outcome.detail).toContain('12 rebonds durs sur 200 envois')
  })

  it('prévient l’admin — une file gelée en silence ressemble à une panne', async () => {
    const { sb, captured } = clientOf({ sent: 200, hardBounces: 12 })
    await tripBounceGuard(sb, settings({ bounceGuardThreshold: 4 }))

    expect(captured.notifications[0]).toEqual(
      expect.objectContaining({ user_id: 'admin-1', status: 'error', type: 'regulator' }),
    )
  })

  it('laisse passer un taux sous le seuil', async () => {
    const { sb, captured } = clientOf({ sent: 200, hardBounces: 4 }) // 2 %
    expect((await tripBounceGuard(sb, settings({ bounceGuardThreshold: 4 }))).tripped).toBe(false)
    expect(captured.updates).toHaveLength(0)
  })

  it('ne coupe pas sur un échantillon minuscule', async () => {
    // Un rebond sur trois envois afficherait 33 % : sans plancher, le
    // disjoncteur couperait une file parfaitement saine dès le premier essai.
    const { sb } = clientOf({ sent: 3, hardBounces: 1 })
    expect((await tripBounceGuard(sb, settings({ bounceGuardThreshold: 4 }))).tripped).toBe(false)
  })

  it('s’active dès que le plancher est atteint', async () => {
    const { sb } = clientOf({ sent: MIN_SENDS_FOR_GUARD, hardBounces: MIN_SENDS_FOR_GUARD })
    expect((await tripBounceGuard(sb, settings({ bounceGuardThreshold: 4 }))).tripped).toBe(true)
  })

  it('ne fait rien quand le disjoncteur est désactivé', async () => {
    const { sb, captured } = clientOf({ sent: 200, hardBounces: 100 })
    expect((await tripBounceGuard(sb, settings({ bounceGuard: false }))).tripped).toBe(false)
    expect(captured.updates).toHaveLength(0)
  })

  it('ne renotifie pas quand le régulateur est déjà en pause', async () => {
    const { sb, captured } = clientOf({ sent: 200, hardBounces: 100 })
    await tripBounceGuard(sb, settings({ paused: true }))
    expect(captured.notifications).toHaveLength(0)
  })

  it('retient le tick même si la pause n’a pas pu s’écrire', async () => {
    // Comportement sûr : on préfère ne pas envoyer que d'envoyer parce qu'une
    // écriture a échoué.
    const { sb } = clientOf({ sent: 200, hardBounces: 100 }, { updateFails: true })
    expect((await tripBounceGuard(sb, settings())).tripped).toBe(true)
  })
})
