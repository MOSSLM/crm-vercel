/**
 * @jest-environment node
 *
 * LE FROID NE PART JAMAIS PAR RESEND.
 *
 * Ce n'est pas une précaution de délivrabilité, c'est une clause de contrat.
 * La politique d'usage acceptable de Resend, mise à jour le 27 août 2026,
 * interdit nommément « unsolicited messages of any kind, INCLUDING COLD
 * OUTREACH, PURCHASED LISTS, OR SCRAPED CONTACT DATA », et se réserve de fermer
 * le compte « without warning ». Nos 57 744 adresses viennent d'un
 * enrichissement de sites web : elles cochent deux de ces trois mots.
 *
 * CE QUE LA FERMETURE COÛTERAIT, ET QUI N'EST PAS ÉVIDENT : le compte Resend ne
 * porte pas que la prospection. Il porte les liens de démo, les plaquettes, les
 * confirmations de rendez-vous et le portail client. Le perdre pour un premier
 * contact, c'est perdre le sollicité avec.
 *
 * D'où la règle testée ici : une étape marquée `transport: 'smtp'` est RETENUE
 * tant que la flotte n'existe pas. Elle ne retombe pas sur Resend « en
 * attendant » — c'est précisément le repli silencieux qui ferait le dégât.
 */

const mockFrom = jest.fn()
const mockSend = jest.fn()

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: mockSend } })),
}))

import { sendEngineEmail } from '../engine'
import type { SupabaseClient } from '@supabase/supabase-js'

type ChainResult = { data: unknown; error?: unknown }

const chain = (result: ChainResult) => {
  const c: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'not', 'order', 'insert', 'upsert', 'update']) c[m] = jest.fn(() => c)
  c.limit = jest.fn(() => Promise.resolve(result))
  c.maybeSingle = jest.fn().mockResolvedValue(result)
  c.then = (resolve: (v: ChainResult) => unknown) => Promise.resolve(result).then(resolve)
  return c
}

const sb = () => {
  mockFrom.mockImplementation(() => chain({ data: null }))
  return { from: (...args: unknown[]) => mockFrom(...args) } as unknown as SupabaseClient
}

const envoi = (transport?: 'resend' | 'smtp') => ({
  to: 'contact@toiture-dupont.fr',
  subject: 'Objet',
  text: 'Corps',
  enrollmentId: '0e7a1f20-0000-4000-8000-000000000001',
  transport,
})

beforeEach(() => {
  mockFrom.mockReset()
  mockSend.mockReset()
  process.env.RESEND_API_KEY = 'cle-de-test'
})

describe('transport smtp — retenu, jamais replié sur Resend', () => {
  it('n’appelle pas Resend', async () => {
    const r = await sendEngineEmail(sb(), envoi('smtp'))
    expect(mockSend).not.toHaveBeenCalled()
    expect(r.ok).toBe(false)
    expect(r.blocked).toBe(true)
    expect(r.error).toBe('transport_indisponible')
  })

  it('bloque AVANT la clé d’API — une clé absente ne doit pas masquer le motif', async () => {
    // Sans cet ordre, retirer RESEND_API_KEY rendrait « non configuré » et on
    // chercherait un problème de configuration là où il y a une règle métier.
    delete process.env.RESEND_API_KEY
    const r = await sendEngineEmail(sb(), envoi('smtp'))
    expect(r.error).toBe('transport_indisponible')
    expect(r.blocked).toBe(true)
  })

  it('journalise ce qui SERAIT parti, avec son motif', async () => {
    await sendEngineEmail(sb(), envoi('smtp'))
    // Le blocage s'écrit dans email_logs : c'est ce qui permet de compter le
    // froid en attente sans le faire partir.
    expect(mockFrom).toHaveBeenCalledWith('email_logs')
  })

  it('bloque même si le régulateur tourne et que tout va bien par ailleurs', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'regulator_settings') return chain({ data: { paused: false, canaux_suspendus: [] } })
      return chain({ data: null })
    })
    const client = { from: (...a: unknown[]) => mockFrom(...a) } as unknown as SupabaseClient
    const r = await sendEngineEmail(client, envoi('smtp'))
    expect(mockSend).not.toHaveBeenCalled()
    expect(r.error).toBe('transport_indisponible')
  })
})

describe('transport resend — le sollicité continue de partir', () => {
  it('ne bloque pas quand le transport est absent (le défaut historique)', async () => {
    const r = await sendEngineEmail(sb(), envoi(undefined))
    // Il peut échouer plus loin (mocks incomplets), mais JAMAIS sur ce motif :
    // le défaut ne doit rien changer à ce qui tournait déjà.
    expect(r.error).not.toBe('transport_indisponible')
  })

  it('ne bloque pas non plus quand il est explicitement « resend »', async () => {
    const r = await sendEngineEmail(sb(), envoi('resend'))
    expect(r.error).not.toBe('transport_indisponible')
  })
})
