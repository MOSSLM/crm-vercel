/**
 * @jest-environment node
 */
import { createHmac } from 'node:crypto'
import { __resetServiceClientForTests } from '@/app/api/_lib/service-client'

const mockFrom = jest.fn()
const mockRpc = jest.fn()

jest.mock('@/env', () => ({
  SUPABASE_URL: 'http://localhost',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role',
}))

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
    auth: { getUser: jest.fn() },
  })),
}))

const SECRET = `whsec_${Buffer.from('un-secret-de-test-assez-long').toString('base64')}`
const ORIGINAL_ENV = { ...process.env }

/* ── Faux client Supabase ────────────────────────────────────────────────── */

type TableSpy = {
  inserts: unknown[]
  updates: unknown[]
  upserts: unknown[]
  /** Filtres posés sur les mises à jour, pour vérifier QUI a été gelé. */
  filters: Array<[string, unknown]>
}

/**
 * Une chaîne qui répond à tout et se laisse inspecter. Les routes enchaînent
 * `.select().eq().maybeSingle()` dans des ordres variables : plutôt que de
 * modéliser PostgREST, on rend un objet thenable qui accepte n'importe quelle
 * suite d'appels.
 */
function table(name: string, spies: Record<string, TableSpy>, result: { data: unknown; error?: unknown }) {
  const spy: TableSpy = spies[name] ?? { inserts: [], updates: [], upserts: [], filters: [] }
  spies[name] = spy

  const chain: Record<string, unknown> = {}
  const passthrough = ['select', 'eq', 'in', 'ilike', 'gte', 'lte', 'neq', 'or', 'not', 'order', 'limit']
  for (const method of passthrough) {
    chain[method] = jest.fn((col?: unknown, value?: unknown) => {
      if (typeof col === 'string' && value !== undefined) spy.filters.push([col, value])
      return chain
    })
  }
  chain.insert = jest.fn((rows: unknown) => {
    spy.inserts.push(rows)
    return chain
  })
  chain.update = jest.fn((patch: unknown) => {
    spy.updates.push(patch)
    return chain
  })
  chain.upsert = jest.fn((rows: unknown) => {
    spy.upserts.push(rows)
    return chain
  })
  chain.maybeSingle = jest.fn().mockResolvedValue(result)
  chain.single = jest.fn().mockResolvedValue(result)
  // Les appels non terminés par `.maybeSingle()` sont attendus directement.
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
  return chain
}

function setupClient(responses: Record<string, { data: unknown; error?: unknown }> = {}) {
  const spies: Record<string, TableSpy> = {}
  mockFrom.mockImplementation((name: string) =>
    table(name, spies, responses[name] ?? { data: [], error: null }),
  )
  mockRpc.mockResolvedValue({ error: null })
  return spies
}

/* ── Requêtes signées ────────────────────────────────────────────────────── */

let counter = 0

function signedRequest(body: unknown, over: { secret?: string; id?: string; timestamp?: string } = {}) {
  const payload = JSON.stringify(body)
  const id = over.id ?? `msg_${++counter}`
  const timestamp = over.timestamp ?? String(Math.floor(Date.now() / 1000))
  const key = Buffer.from((over.secret ?? SECRET).replace(/^whsec_/, ''), 'base64')
  const signature = createHmac('sha256', key).update(`${id}.${timestamp}.${payload}`).digest('base64')
  return new Request('http://localhost/api/webhooks/resend', {
    method: 'POST',
    body: payload,
    headers: {
      'svix-id': id,
      'svix-timestamp': timestamp,
      'svix-signature': `v1,${signature}`,
    },
  })
}

const bounced = (email: string, bounce: { type?: string; subType?: string }) => ({
  type: 'email.bounced',
  created_at: new Date().toISOString(),
  data: { email_id: 're_1', to: [email], bounce },
})

const delivered = (email: string) => ({
  type: 'email.delivered',
  created_at: new Date().toISOString(),
  data: { email_id: 're_2', to: [email] },
})

const importRoute = async () => (await import('../route')) as typeof import('../route')

beforeEach(() => {
  jest.resetModules()
  jest.clearAllMocks()
  __resetServiceClientForTests()
  process.env = { ...ORIGINAL_ENV, RESEND_WEBHOOK_SECRET: SECRET, NODE_ENV: 'test' }
})

afterAll(() => {
  process.env = ORIGINAL_ENV
})

/* ── Signature ───────────────────────────────────────────────────────────── */

describe('signature', () => {
  it('refuse une requête sans en-têtes de signature', async () => {
    setupClient()
    const { POST } = await importRoute()
    const res = await POST(
      new Request('http://localhost/api/webhooks/resend', { method: 'POST', body: '{}' }),
    )
    expect(res.status).toBe(401)
  })

  it('refuse une signature calculée avec un autre secret', async () => {
    setupClient()
    const { POST } = await importRoute()
    const autre = `whsec_${Buffer.from('un-autre-secret-tout-aussi-long').toString('base64')}`
    const res = await POST(signedRequest(delivered('jean@garage.fr'), { secret: autre }))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'signature_invalide' })
  })

  it('refuse un message capté puis rejoué plus tard', async () => {
    setupClient()
    const { POST } = await importRoute()
    const vieux = String(Math.floor(Date.now() / 1000) - 3600)
    const res = await POST(signedRequest(delivered('jean@garage.fr'), { timestamp: vieux }))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'horodatage_perime' })
  })

  it('refuse tout en production tant que le secret n’est pas posé', async () => {
    setupClient()
    process.env = { ...ORIGINAL_ENV, NODE_ENV: 'production' }
    delete process.env.RESEND_WEBHOOK_SECRET
    const { POST } = await importRoute()
    const res = await POST(
      new Request('http://localhost/api/webhooks/resend', { method: 'POST', body: '{}' }),
    )
    // Sans vérification, n'importe qui pourrait condamner nos adresses en
    // postant de faux rebonds.
    expect(res.status).toBe(503)
  })

  it('accepte une signature valide', async () => {
    setupClient()
    const { POST } = await importRoute()
    const res = await POST(signedRequest(delivered('jean@garage.fr')))
    expect(res.status).toBe(200)
  })
})

/* ── Idempotence ─────────────────────────────────────────────────────────── */

describe('idempotence', () => {
  it('ne traite pas deux fois un événement rejoué', async () => {
    setupClient({ email_events: { data: null, error: { code: '23505', message: 'duplicate key' } } })
    const { POST } = await importRoute()
    const res = await POST(signedRequest(bounced('jean@garage.fr', { type: 'Permanent' })))

    expect(await res.json()).toEqual({ ok: true, duplicate: true })
    // Aucun compteur touché : c'est tout l'intérêt de la clé primaire sur
    // `event_id`. Un rejeu ne doit rien changer.
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('rend 500 quand l’enregistrement échoue, pour que Resend REJOUE', async () => {
    // Répondre 200 ici ferait considérer l'événement comme livré : le rebond
    // serait perdu, l'adresse morte resterait marquée valide, et elle
    // continuerait de recevoir. C'est précisément ce que ce dispositif existe
    // pour empêcher.
    setupClient({
      email_events: { data: null, error: { code: 'PGRST205', message: 'Could not find the table' } },
    })
    const { POST } = await importRoute()
    const res = await POST(signedRequest(bounced('jean@garage.fr', { type: 'Permanent' })))

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.error).toContain('Could not find the table')
    // Rien n'a été condamné sur la foi d'un événement qu'on n'a pas su ranger.
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('rend 500 quand la base est injoignable', async () => {
    mockFrom.mockImplementation(() => {
      throw new Error('fetch failed')
    })
    const { POST } = await importRoute()
    const res = await POST(signedRequest(bounced('jean@garage.fr', { type: 'Permanent' })))

    expect(res.status).toBe(500)
    expect((await res.json()).error).toContain('fetch failed')
  })

  it('traite l’événement quand l’insertion crée bien une ligne', async () => {
    setupClient({ email_events: { data: [{ event_id: 'msg_x' }], error: null } })
    const { POST } = await importRoute()
    await POST(signedRequest(bounced('jean@garage.fr', { type: 'Permanent' })))
    expect(mockRpc).toHaveBeenCalledWith(
      'bump_email_event_counters',
      expect.objectContaining({ p_email: 'jean@garage.fr', p_kind: 'hard_bounce' }),
    )
  })
})

/* ── Rebonds ─────────────────────────────────────────────────────────────── */

describe('rebond dur', () => {
  const setup = () =>
    setupClient({
      email_events: { data: [{ event_id: 'msg_x' }], error: null },
      contacts: { data: [{ id: 'c-1' }], error: null },
      entreprises: { data: [{ id: 7 }], error: null },
    })

  it('condamne l’adresse définitivement', async () => {
    const spies = setup()
    const { POST } = await importRoute()
    await POST(signedRequest(bounced('jean@garage.fr', { type: 'Permanent' })))

    const verdict = spies.email_verifications.upserts[0] as Record<string, unknown>
    expect(verdict).toEqual(
      expect.objectContaining({
        email: 'jean@garage.fr',
        status: 'invalid',
        sub_status: 'bounce_dur',
        source: 'bounce',
      }),
    )
    // Cent ans : l'adresse ne repassera jamais par le vérificateur.
    expect(new Date(verdict.expires_at as string).getFullYear()).toBeGreaterThan(2100)
  })

  it('inscrit l’adresse en liste de suppression', async () => {
    const spies = setup()
    const { POST } = await importRoute()
    await POST(signedRequest(bounced('jean@garage.fr', { type: 'Permanent' })))

    expect(spies.email_suppressions.inserts[0]).toEqual(
      expect.objectContaining({ email: 'jean@garage.fr', reason: 'hard_bounce' }),
    )
  })

  it('gèle les séquences en cours AVANT que les emails suivants ne partent', async () => {
    const spies = setup()
    const { POST } = await importRoute()
    await POST(signedRequest(bounced('jean@garage.fr', { type: 'Permanent' })))

    // C'est le point critique : sans ce gel, les deux relances de la séquence
    // partiraient quand même vers une boîte qu'on sait morte.
    expect(spies.sequence_enrollments.updates).toContainEqual(
      expect.objectContaining({ hold_reason: 'email_invalid', send_at: null }),
    )
  })

  it('reconnaît un rebond dur annoncé par son sous-type', async () => {
    setup()
    const { POST } = await importRoute()
    await POST(signedRequest(bounced('jean@garage.fr', { subType: 'NoEmail' })))
    expect(mockRpc).toHaveBeenCalledWith('bump_email_event_counters', expect.objectContaining({ p_kind: 'hard_bounce' }))
  })
})

describe('rebond doux', () => {
  it('compte sans condamner', async () => {
    const spies = setupClient({ email_events: { data: [{ event_id: 'msg_x' }], error: null } })
    const { POST } = await importRoute()
    await POST(signedRequest(bounced('jean@garage.fr', { type: 'Transient', subType: 'MailboxFull' })))

    expect(mockRpc).toHaveBeenCalledWith('bump_email_event_counters', expect.objectContaining({ p_kind: 'soft_bounce' }))
    // Une boîte pleine se vide : on ne raye pas un prospect pour ça.
    expect(spies.email_suppressions?.inserts ?? []).toHaveLength(0)
  })
})

/* ── Livraison ───────────────────────────────────────────────────────────── */

describe('livraison', () => {
  it('reconduit la fraîcheur sans rien revérifier', async () => {
    const spies = setupClient({
      email_events: { data: [{ event_id: 'msg_x' }], error: null },
      regulator_settings: { data: { verify_ttl_days: 120 }, error: null },
    })
    const { POST } = await importRoute()
    await POST(signedRequest(delivered('jean@garage.fr')))

    const patch = spies.email_verifications.updates[0] as Record<string, unknown>
    expect(patch).toEqual(
      expect.objectContaining({ status: 'valid', sub_status: 'prouvee', score: 100, source: 'delivered' }),
    )

    // 120 jours plus tard, à un jour près : c'est la promesse « une adresse qui
    // reçoit n'est jamais retestée ».
    const days = (new Date(patch.expires_at as string).getTime() - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(119)
    expect(days).toBeLessThan(121)
  })

  it('respecte la fraîcheur réglée dans le régulateur', async () => {
    const spies = setupClient({
      email_events: { data: [{ event_id: 'msg_x' }], error: null },
      regulator_settings: { data: { verify_ttl_days: 30 }, error: null },
    })
    const { POST } = await importRoute()
    await POST(signedRequest(delivered('jean@garage.fr')))

    const patch = spies.email_verifications.updates[0] as Record<string, unknown>
    const days = (new Date(patch.expires_at as string).getTime() - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(29)
    expect(days).toBeLessThan(31)
  })
})

/* ── Plainte ─────────────────────────────────────────────────────────────── */

describe('plainte', () => {
  it('supprime l’adresse et sort le prospect du pipeline', async () => {
    const spies = setupClient({
      email_events: { data: [{ event_id: 'msg_x' }], error: null },
      entreprises: { data: [{ id: 7 }], error: null },
      opportunites: { data: [{ id: 'opp-1' }], error: null },
    })
    const { POST } = await importRoute()
    await POST(
      signedRequest({
        type: 'email.complained',
        created_at: new Date().toISOString(),
        data: { email_id: 're_3', to: ['jean@garage.fr'] },
      }),
    )

    expect(spies.email_suppressions.inserts[0]).toEqual(
      expect.objectContaining({ email: 'jean@garage.fr', reason: 'complaint' }),
    )
    // Une plainte n'est pas qu'un souci de délivrabilité : c'est un prospect
    // qui dit non.
    expect(spies.sales_pipeline_state.upserts[0]).toEqual(
      expect.objectContaining({ opportunite_id: 'opp-1', state: 'black' }),
    )
  })
})

/* ── Événements sans effet ───────────────────────────────────────────────── */

describe('événements sans effet sur le verdict', () => {
  it('journalise une ouverture sans toucher au verdict', async () => {
    const spies = setupClient({ email_events: { data: [{ event_id: 'msg_x' }], error: null } })
    const { POST } = await importRoute()
    const res = await POST(
      signedRequest({
        type: 'email.opened',
        created_at: new Date().toISOString(),
        data: { email_id: 're_4', to: ['jean@garage.fr'] },
      }),
    )

    expect(await res.json()).toEqual(expect.objectContaining({ ok: true, applied: false }))
    expect(spies.email_events.inserts).toHaveLength(1)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('normalise le destinataire avant de l’utiliser', async () => {
    setupClient({ email_events: { data: [{ event_id: 'msg_x' }], error: null } })
    const { POST } = await importRoute()
    await POST(
      signedRequest({
        type: 'email.delivered',
        created_at: new Date().toISOString(),
        data: { email_id: 're_5', to: '  Jean@Garage.FR ' },
      }),
    )
    // Sans normalisation, le verdict serait rangé sous une clé que personne ne
    // relit — l'adresse resterait éternellement « à vérifier ».
    expect(mockRpc).toHaveBeenCalledWith(
      'bump_email_event_counters',
      expect.objectContaining({ p_email: 'jean@garage.fr', p_domain: 'garage.fr' }),
    )
  })
})
