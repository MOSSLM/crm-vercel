import type { SupabaseClient } from '@supabase/supabase-js'
import { enregistrerEntrant } from '../reception-db'
import type { MessageEntrant } from '../reception'

const declarerReponse = jest.fn(async () => ({ ok: true, stepIndex: 2 }))
jest.mock('@/lib/automations/reply', () => ({
  declarerReponse: (...a: unknown[]) => declarerReponse(...(a as [])),
}))

const INSCRIPTION = '11111111-2222-4333-8444-555555555555'
const ENT = 42

/**
 * Un client de complaisance. `insert` garde ce qu'on lui donne — c'est ce qu'on
 * vérifie — et peut être forcé à répondre un conflit de clé, qui est le
 * mécanisme d'idempotence réel : on ne teste pas le pilote, on teste ce qui est
 * écrit et ce qui est appelé ensuite.
 */
function clientAvec(tables: Record<string, unknown[]>, conflit = false) {
  const ecrites: Record<string, unknown>[] = []
  const chaine = (table: string) => {
    const lignes = tables[table] ?? []
    const resultat = { data: lignes, error: null }
    const noeud: Record<string, unknown> = {
      then: (r: (v: unknown) => unknown) => Promise.resolve(resultat).then(r),
      maybeSingle: async () => ({ data: lignes[0] ?? null, error: null }),
      insert: (ligne: Record<string, unknown>) => {
        ecrites.push(ligne)
        const apres = {
          select: () => apres,
          maybeSingle: async () =>
            conflit
              ? { data: null, error: { code: '23505', message: 'duplicate key' } }
              : { data: { id: 'log-1' }, error: null },
        }
        return apres
      },
    }
    for (const m of ['select', 'eq', 'in', 'is', 'ilike', 'order', 'limit', 'not']) noeud[m] = () => noeud
    return noeud
  }
  return { sb: { from: chaine } as unknown as SupabaseClient, ecrites }
}

const BASE = {
  sequence_enrollments: [
    { id: INSCRIPTION, automation_id: 'auto-1', entreprise_id: ENT, contact_id: 'c-1' },
  ],
  opportunites: [{ id: 'opp-1' }],
  contacts: [],
  entreprises: [],
  email_logs: [],
}

const msg = (over: Partial<MessageEntrant> = {}): MessageEntrant => ({
  de: 'Cédric Martin <cedric@sarl-martin.fr>',
  pour: [`contact+${INSCRIPTION}@samadigitalstudio.fr`],
  objet: 'Re: Votre site en 72 h',
  texte: 'Ça m’intéresse.\n\nLe 19 août 2026 à 14:32, Sama a écrit :\n> Bonjour…',
  messageId: 'CAF-9182@sarl-martin.fr',
  ...over,
})

beforeEach(() => declarerReponse.mockClear())

describe('enregistrerEntrant', () => {
  it('écrit un entrant rattaché, et fait repartir la séquence', async () => {
    const { sb, ecrites } = clientAvec(BASE)
    const bilan = await enregistrerEntrant(sb, msg())

    expect(bilan.debloque).toBe(true)
    expect(bilan.moyen).toBe('sous_adressage')
    expect(declarerReponse).toHaveBeenCalledWith(sb, INSCRIPTION)

    const ligne = ecrites[0]
    expect(ligne.direction).toBe('entrant')
    expect(ligne.enrollment_id).toBe(INSCRIPTION)
    expect(ligne.entreprise_id).toBe(ENT)
    expect(ligne.opportunite_id).toBe('opp-1')
    // L'historique recopié ne rentre pas dans le fil.
    expect(ligne.body_text).toBe('Ça m’intéresse.')
  })

  // LE TEST QUI COMPTE. Une absence débloquerait l'attente ET réancrerait la
  // suite : l'étape suivante — écrite pour quelqu'un qui vient de parler —
  // partirait vers un répondeur. C'est la faute des 59 gelées, prise à l'envers.
  it('range une absence dans le fil SANS faire avancer la séquence', async () => {
    const { sb, ecrites } = clientAvec(BASE)
    const bilan = await enregistrerEntrant(
      sb,
      msg({ objet: 'Réponse automatique : absent', entetes: { 'Auto-Submitted': 'auto-replied' } }),
    )

    expect(declarerReponse).not.toHaveBeenCalled()
    expect(bilan.debloque).toBe(false)
    expect(bilan.nature).toBe('automatique')
    // Rangée quand même : elle prouve au moins que la boîte existe et lit.
    expect(ecrites).toHaveLength(1)
    expect(bilan.raison).toContain('automatique')
  })

  // Deux inscriptions peuvent viser la même adresse. Se tromper d'inscription
  // ferait partir le mauvais message : on range, et un humain confirme.
  it('range sans débloquer quand seul l’expéditeur a permis de rattacher', async () => {
    const { sb } = clientAvec({
      ...BASE,
      contacts: [{ id: 'c-9', entreprise_id: ENT }],
    })
    const bilan = await enregistrerEntrant(sb, msg({ pour: ['contact@samadigitalstudio.fr'] }))

    expect(bilan.moyen).toBe('adresse')
    expect(bilan.debloque).toBe(false)
    expect(bilan.raison).toMatch(/à la main/)
    expect(declarerReponse).not.toHaveBeenCalled()
  })

  // Un webhook rejoue ; une relève IMAP relit. Sans ça, `declarerReponse`
  // serait appelée deux fois et la séquence avancerait d'une étape de trop.
  it('ne réécrit rien et n’avance rien sur un message déjà reçu', async () => {
    const { sb } = clientAvec(BASE, true)
    const bilan = await enregistrerEntrant(sb, msg())

    expect(bilan.doublon).toBe(true)
    expect(bilan.messageId).toBeNull()
    expect(declarerReponse).not.toHaveBeenCalled()
  })

  it('dit quand un message n’était pas protégé contre le rejeu', async () => {
    const { sb } = clientAvec(BASE)
    const bilan = await enregistrerEntrant(sb, msg({ messageId: null }))
    expect(bilan.protege).toBe(false)
    // Il entre quand même : perdre une réponse serait pire qu'en avoir deux.
    expect(bilan.messageId).toBe('log-1')
  })

  it('dit en clair quand la séquence n’attendait pas de réponse', async () => {
    declarerReponse.mockResolvedValueOnce({ ok: false, error: 'pas_en_attente' } as never)
    const { sb } = clientAvec(BASE)
    const bilan = await enregistrerEntrant(sb, msg())
    expect(bilan.debloque).toBe(false)
    expect(bilan.raison).toBe('la séquence n’attendait pas de réponse à cette étape')
  })
})
