/**
 * @jest-environment node
 */
import { __resetServiceClientForTests } from '@/app/api/_lib/service-client'

const mockFrom = jest.fn()
const mockVerifyMany = jest.fn()
const mockLoadDue = jest.fn()

jest.mock('@/env', () => ({
  SUPABASE_URL: 'http://localhost',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role',
}))

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: (...args: unknown[]) => mockFrom(...args),
    auth: { getUser: jest.fn() },
  })),
}))

jest.mock('@/lib/email/verify/service', () => ({
  loadDueForVerification: (...args: unknown[]) => mockLoadDue(...args),
  verifyMany: (...args: unknown[]) => mockVerifyMany(...args),
}))

const ORIGINAL_ENV = { ...process.env }

const settingsChain = (ttl: number | undefined) => ({
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  maybeSingle: jest.fn().mockResolvedValue({ data: ttl == null ? null : { verify_ttl_days: ttl }, error: null }),
})

const request = (headers: Record<string, string> = {}) =>
  new Request('http://localhost/api/email/verify/tick', { headers })

const importRoute = async () => (await import('../tick/route')) as typeof import('../tick/route')

beforeEach(() => {
  jest.resetModules()
  jest.clearAllMocks()
  __resetServiceClientForTests()
  process.env = { ...ORIGINAL_ENV, NODE_ENV: 'test' }
  delete process.env.CRON_SECRET
  delete process.env.PG_CRON_SECRET
  mockFrom.mockImplementation(() => settingsChain(120))
  mockLoadDue.mockResolvedValue({ emails: [], remaining: 0 })
  mockVerifyMany.mockResolvedValue([])
})

afterAll(() => {
  process.env = ORIGINAL_ENV
})

describe('authentification du ticker', () => {
  it('accepte le secret pg_cron', async () => {
    process.env.PG_CRON_SECRET = 'secret'
    const { GET } = await importRoute()
    expect((await GET(request({ 'x-pg-cron-secret': 'secret' }))).status).toBe(200)
  })

  it('accepte le secret Vercel', async () => {
    process.env.CRON_SECRET = 'secret'
    const { GET } = await importRoute()
    expect((await GET(request({ authorization: 'Bearer secret' }))).status).toBe(200)
  })

  it('refuse un mauvais secret', async () => {
    process.env.PG_CRON_SECRET = 'secret'
    const { GET } = await importRoute()
    expect((await GET(request({ 'x-pg-cron-secret': 'autre' }))).status).toBe(401)
  })

  it('refuse tout en production sans secret configuré', async () => {
    process.env = { ...ORIGINAL_ENV, NODE_ENV: 'production' }
    delete process.env.CRON_SECRET
    delete process.env.PG_CRON_SECRET
    const { GET } = await importRoute()
    expect((await GET(request())).status).toBe(401)
  })

  it('laisse passer en développement sans secret', async () => {
    const { GET } = await importRoute()
    expect((await GET(request())).status).toBe(200)
  })
})

describe('travail du tick', () => {
  it('ne fait rien quand la file est vide', async () => {
    const { GET } = await importRoute()
    const body = await (await GET(request())).json()

    expect(body).toEqual(expect.objectContaining({ ok: true, checked: 0 }))
    expect(mockVerifyMany).not.toHaveBeenCalled()
  })

  it('vérifie la tranche et rend le détail par statut', async () => {
    mockLoadDue.mockResolvedValue({ emails: ['a@x.fr', 'b@y.fr', 'c@z.fr'], remaining: 42 })
    mockVerifyMany.mockResolvedValue([
      { email: 'a@x.fr', status: 'valid' },
      { email: 'b@y.fr', status: 'invalid' },
      { email: 'c@z.fr', status: 'risky' },
    ])

    const { GET } = await importRoute()
    const body = await (await GET(request())).json()

    // Le détail rend le tick lisible dans les journaux : on voit d'un coup
    // d'œil si une salve d'imports est massivement invalide.
    expect(body.checked).toBe(3)
    expect(body.remaining).toBe(42)
    expect(body.byStatus).toEqual({ valid: 1, risky: 1, invalid: 1, unknown: 0, pending: 0 })
  })

  it('borne le travail d’un tick', async () => {
    const { GET } = await importRoute()
    await GET(request())
    // Une fonction serverless a soixante secondes : la file se vide sur
    // plusieurs passages, pas en un seul.
    expect(mockLoadDue).toHaveBeenCalledWith(expect.anything(), 300)
  })

  it('applique la fraîcheur réglée dans le régulateur', async () => {
    mockFrom.mockImplementation(() => settingsChain(45))
    mockLoadDue.mockResolvedValue({ emails: ['a@x.fr'], remaining: 0 })
    const { GET } = await importRoute()
    await GET(request())

    expect(mockVerifyMany).toHaveBeenCalledWith(expect.anything(), ['a@x.fr'], {
      validTtlDays: 45,
      force: true,
    })
  })

  it('retombe sur 120 jours quand le réglage n’existe pas encore', async () => {
    // Migration non appliquée : on ne vérifie pas avec une fraîcheur absurde.
    mockFrom.mockImplementation(() => settingsChain(undefined))
    mockLoadDue.mockResolvedValue({ emails: ['a@x.fr'], remaining: 0 })
    const { GET } = await importRoute()
    const body = await (await GET(request())).json()
    expect(body.ttlDays).toBe(120)
  })
})
