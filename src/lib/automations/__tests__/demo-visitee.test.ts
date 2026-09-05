/**
 * @jest-environment node
 *
 * « A VISITÉ SA DÉMO » — le seul signal d'intention que ce CRM peut honnêtement
 * mesurer, et pourquoi il remplace les deux autres.
 *
 * CE QUI A ÉTÉ DÉCOUVERT LE 05/09/2026
 * S2 décidait qu'un prospect était chaud sur `plaquette_vue`, et envoyait à
 * l'agent un script qui commence par « Vous avez regardé ce que je vous ai
 * envoyé — les tarifs vous parlent ? ». Or la plaquette part en PDF JOINT,
 * jamais en lien : sur 806 messages sortants, UN SEUL portait une URL de
 * plaquette, AUCUN une URL de rapport. Les compteurs à jeton ne pouvaient donc
 * être bougés que par nous — 897 fiches avec jeton, 11 avec une vue, et ces 11
 * étaient exactement les fiches qu'un agent avait ouvertes pour fabriquer le
 * PDF (vue à 5, 25, 68, puis 92 à 194 secondes du geste).
 *
 * CE QUE CE FICHIER TIENT — les trois réponses, dont deux se confondent très
 * facilement :
 *   · on n'a pas pu regarder      → `undefined`, la condition rend `non_mesure`
 *   · on a regardé, personne      → `false`, une vraie mesure
 *   · il est venu                 → `true`
 *
 * Aplatir la première sur la seconde ferait dire « il n'est jamais venu » d'un
 * prospect qu'on n'a pas su mesurer — c'est-à-dire refaire, à l'envers, la
 * faute qu'on vient de corriger.
 */

const mockIntent = jest.fn()
jest.mock('@/lib/analytics-radar/site-intent', () => ({
  intentByEnterprise: (...args: unknown[]) => mockIntent(...args),
}))

import { releverLesFaits } from '../conditions-db'
import { CHAMP_LABEL, CHAMPS_CONDITION, evaluerCondition, operateursDe } from '../conditions'

/** Chaîne Supabase minimale : chaque lecture rend une réponse vide et valide. */
const chain = () => {
  const c: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'limit', 'order', 'in', 'not', 'lte', 'gte', 'or']) c[m] = jest.fn(() => c)
  c.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null })
  c.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(r)
  return c
}
const sb = { from: () => chain() } as never

const faitsDe = (id: number) => releverLesFaits(sb, { entrepriseId: id, contactId: null, opportuniteId: null })

const siteIntent = (sessions: number) => ({ sessions, score: sessions, entrepriseId: 0 })

beforeEach(() => mockIntent.mockReset())

describe('demo_visitee — le champ', () => {
  it('existe, est booléen, et porte un libellé lisible dans l’éditeur', () => {
    expect(CHAMPS_CONDITION).toContain('demo_visitee')
    expect(operateursDe('demo_visitee')).toEqual(['vrai', 'faux'])
    expect(CHAMP_LABEL.demo_visitee).toBe('A visité sa démo')
  })

  it('rend « oui » quand le prospect est venu au moins une fois', async () => {
    mockIntent.mockResolvedValue(new Map([[42, siteIntent(3)]]))
    const faits = await faitsDe(42)
    expect(faits.demoVisitee).toBe(true)
    expect(evaluerCondition({ champ: 'demo_visitee', operateur: 'vrai' }, faits)).toBe('oui')
  })

  it('rend « non » quand on a regardé et que personne n’est venu — c’est une mesure', async () => {
    // Le parc a du trafic, mais pas cette entreprise : elle a bien été mesurée.
    mockIntent.mockResolvedValue(new Map([[7, siteIntent(5)]]))
    const faits = await faitsDe(42)
    expect(faits.demoVisitee).toBe(false)
    expect(evaluerCondition({ champ: 'demo_visitee', operateur: 'vrai' }, faits)).toBe('non')
  })

  it('rend « non mesuré » quand GA4 n’a rien rendu — surtout pas « non »', async () => {
    // Sans GA4, `intentBySite` rend une liste vide exactement comme un parc
    // sans visite : on ne peut pas trancher, donc on ne tranche pas.
    mockIntent.mockResolvedValue(new Map())
    const faits = await faitsDe(42)
    expect(faits.demoVisitee).toBeUndefined()
    expect(evaluerCondition({ champ: 'demo_visitee', operateur: 'vrai' }, faits)).toBe('non_mesure')
  })

  it('une panne de GA4 ne coûte pas le tick : elle coûte un champ', async () => {
    mockIntent.mockRejectedValue(new Error('GA4 injoignable'))
    const faits = await faitsDe(42)
    expect(faits.demoVisitee).toBeUndefined()
    // Le reste du relevé a bien eu lieu.
    expect(faits).toHaveProperty('issueDernierAppel')
  })

  it('lit une fenêtre de 30 jours, pas les 7 par défaut', async () => {
    // Une condition se pose des jours après l'envoi (S2 au J+2/J+4, S3 à 30 j).
    // Sur 7 jours, la visite du lendemain serait déjà sortie de la fenêtre.
    mockIntent.mockResolvedValue(new Map([[42, siteIntent(1)]]))
    await faitsDe(42)
    expect(mockIntent).toHaveBeenCalledWith(expect.anything(), 30)
  })

  it('sans entreprise, on ne prétend rien — et on n’appelle pas GA4', async () => {
    const faits = await releverLesFaits(sb, { entrepriseId: null, contactId: null, opportuniteId: null })
    expect(faits.demoVisitee).toBeUndefined()
    expect(mockIntent).not.toHaveBeenCalled()
  })
})
