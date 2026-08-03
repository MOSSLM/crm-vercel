// Lecture de la file de vérification.
//
// Le point de ces tests : distinguer « rien à faire » de « je n'ai pas pu
// lire ». Les deux rendaient la même réponse, et une vérification à l'arrêt
// ressemblait trait pour trait à une file vide.

import { loadDueForVerification } from '../service'

type Result = { data: unknown; error?: unknown; count?: number | null }

/**
 * Faux client : chaque appel à `.from('email_verifications')` consomme le
 * prochain résultat de la liste, dans l'ordre où la fonction les demande
 * (adresses jamais vues → verdicts périmés → comptage).
 */
const clientOf = (results: Result[]) => {
  let i = 0
  return {
    from: jest.fn(() => {
      const result = results[Math.min(i++, results.length - 1)]
      const self: Record<string, unknown> = {}
      for (const method of ['select', 'eq', 'neq', 'lte', 'or', 'order']) {
        self[method] = jest.fn(() => self)
      }
      // `.limit()` termine les deux premières requêtes ; le comptage se résout
      // directement sur `.or()`, d'où le thenable.
      self.limit = jest.fn(() => Promise.resolve(result))
      self.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
      return self
    }),
  } as never
}

const rows = (...emails: string[]) => ({ data: emails.map((email) => ({ email })), error: null })
const empty = { data: [], error: null }
const counted = (count: number) => ({ data: null, error: null, count })

describe('loadDueForVerification', () => {
  it('rend les adresses jamais vues', async () => {
    const sb = clientOf([rows('a@x.fr', 'b@y.fr'), empty, counted(2)])
    const batch = await loadDueForVerification(sb, 300)

    expect(batch.emails).toEqual(['a@x.fr', 'b@y.fr'])
    expect(batch.error).toBeUndefined()
  })

  it('ne signale aucune erreur sur une file réellement vide', async () => {
    const sb = clientOf([empty, empty, counted(0)])
    const batch = await loadDueForVerification(sb, 300)

    expect(batch.emails).toEqual([])
    expect(batch.error).toBeUndefined()
  })

  it('remonte le motif quand la file est illisible', async () => {
    // Le cas rencontré en production : les tables venaient d'être créées et le
    // cache de schéma de PostgREST ne les connaissait pas encore.
    const sb = clientOf([
      {
        data: null,
        error: {
          code: 'PGRST205',
          message: "Could not find the table 'public.email_verifications' in the schema cache",
        },
      },
    ])
    const batch = await loadDueForVerification(sb, 300)

    expect(batch.emails).toEqual([])
    expect(batch.error).toContain('PGRST205')
    expect(batch.error).toContain('schema cache')
  })

  it('travaille quand même si seule la salve des verdicts périmés échoue', async () => {
    const sb = clientOf([
      rows('a@x.fr'),
      { data: null, error: { code: '42703', message: 'column does not exist' } },
      counted(1),
    ])
    const batch = await loadDueForVerification(sb, 300)

    // Ce qui a pu être lu est traité ; l'incident est signalé sans bloquer.
    expect(batch.emails).toEqual(['a@x.fr'])
    expect(batch.error).toContain('42703')
  })

  it('survit à une exception jetée par le client', async () => {
    const sb = {
      from: jest.fn(() => {
        throw new Error('réseau coupé')
      }),
    } as never
    const batch = await loadDueForVerification(sb, 300)

    expect(batch.emails).toEqual([])
    expect(batch.error).toContain('réseau coupé')
  })
})
