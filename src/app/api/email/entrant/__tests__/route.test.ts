/**
 * @jest-environment node
 */
import { createHmac } from 'node:crypto'

const enregistrerEntrant = jest.fn(async () => ({
  messageId: 'log-1',
  doublon: false,
  nature: 'reponse',
  motif: '',
  moyen: 'sous_adressage',
  inscriptionId: 'i-1',
  entrepriseId: 42,
  debloque: true,
  raison: null,
  protege: true,
}))

jest.mock('@/lib/email/reception-db', () => ({
  enregistrerEntrant: (...a: unknown[]) => enregistrerEntrant(...(a as [])),
}))
jest.mock('@/app/api/_lib/service-client', () => ({ getServiceClient: () => ({}) }))

import { POST, signatureAttendue } from '../route'

const CLE = 'une-cle-de-test-assez-longue'
const ENV = { ...process.env }

const corpsExemple = {
  de: 'Cédric <cedric@sarl-martin.fr>',
  pour: 'contact+11111111-2222-4333-8444-555555555555@samadigitalstudio.fr',
  objet: 'Re: votre site',
  texte: 'ça m’intéresse',
  messageId: 'CAF-1@sarl-martin.fr',
}

function poster(corps: unknown, options: { cle?: string; horodatage?: string; signature?: string } = {}) {
  const brut = JSON.stringify(corps)
  const horodatage = options.horodatage ?? String(Math.floor(Date.now() / 1000))
  const signature =
    options.signature ??
    (options.cle ? `sha256=${createHmac('sha256', options.cle).update(`${horodatage}.${brut}`).digest('hex')}` : null)
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (signature) {
    headers['x-sama-signature'] = signature
    headers['x-sama-horodatage'] = horodatage
  }
  return POST(new Request('http://localhost/api/email/entrant', { method: 'POST', headers, body: brut }))
}

beforeEach(() => {
  enregistrerEntrant.mockClear()
  process.env = { ...ENV, RECEPTION_CLE: CLE, NODE_ENV: 'test' } as NodeJS.ProcessEnv
})
afterAll(() => {
  process.env = ENV
})

describe('POST /api/email/entrant', () => {
  it('accepte un message signé et rend le bilan', async () => {
    const res = await poster(corpsExemple, { cle: CLE })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ ok: true, recus: 1, debloques: 1, doublons: 0 })
    expect(enregistrerEntrant).toHaveBeenCalledTimes(1)
  })

  it('normalise un `pour` unique en liste', async () => {
    await poster(corpsExemple, { cle: CLE })
    const [, msg] = enregistrerEntrant.mock.calls[0] as unknown as [unknown, { pour: string[] }]
    expect(msg.pour).toEqual([corpsExemple.pour])
  })

  it('accepte un lot, et compte ce qu’il a fait', async () => {
    const res = await poster({ messages: [corpsExemple, { ...corpsExemple, messageId: 'CAF-2@x' }] }, { cle: CLE })
    expect((await res.json()).recus).toBe(2)
    expect(enregistrerEntrant).toHaveBeenCalledTimes(2)
  })

  // Sans signature, n'importe qui pourrait poster « il a répondu » et faire
  // partir l'étape suivante — écrite pour quelqu'un qui vient de parler.
  it('refuse un corps non signé', async () => {
    const res = await poster(corpsExemple)
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('signature_manquante')
    expect(enregistrerEntrant).not.toHaveBeenCalled()
  })

  it('refuse une signature faite avec une autre clé', async () => {
    const res = await poster(corpsExemple, { cle: 'une-autre-cle' })
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('signature_invalide')
  })

  // Sans contrôle de fraîcheur, un message capté se rejouerait indéfiniment.
  it('refuse un horodatage périmé, même correctement signé', async () => {
    const vieux = String(Math.floor(Date.now() / 1000) - 3600)
    const res = await poster(corpsExemple, { cle: CLE, horodatage: vieux })
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('horodatage_perime')
  })

  it('refuse un corps qui n’a pas la forme attendue', async () => {
    const res = await poster({ objet: 'sans expéditeur' }, { cle: CLE })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('corps_invalide')
  })

  // En production, une porte ouverte se refuse et se NOMME : la panne doit
  // dire quoi faire, pas juste échouer.
  it('refuse en production quand la clé manque, en nommant la variable', async () => {
    process.env = { ...ENV, NODE_ENV: 'production' } as NodeJS.ProcessEnv
    delete process.env.RECEPTION_CLE
    const res = await poster(corpsExemple)
    expect(res.status).toBe(503)
    expect((await res.json()).variable).toBe('RECEPTION_CLE')
  })

  it('signatureAttendue lie l’horodatage AU corps', () => {
    const a = signatureAttendue(CLE, '100', '{"x":1}')
    expect(signatureAttendue(CLE, '101', '{"x":1}')).not.toBe(a)
    expect(signatureAttendue(CLE, '100', '{"x":2}')).not.toBe(a)
  })
})
