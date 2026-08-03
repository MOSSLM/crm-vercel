/**
 * @jest-environment node
 *
 * Réattribuer une tâche est le seul geste qui contredit le régulateur. Il doit
 * donc être étroit : admin uniquement, tâche encore ouverte, destinataire réel.
 */
import { __resetServiceClientForTests } from '@/app/api/_lib/service-client'

const mockFrom = jest.fn()

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

jest.mock('@/app/api/_lib/auth', () => ({
  requireUser: jest.fn().mockResolvedValue({ ok: true, user: { id: 'admin-1', email: 'a@b.c' }, accessToken: 't' }),
}))

jest.mock('@/app/api/_lib/require-role', () => ({
  requireRole: jest.fn().mockResolvedValue({ ok: true }),
}))

const AGENT = '11111111-1111-4111-8111-111111111111'
const TASK = 'task-1'

const request = (assignee: string | null) =>
  new Request(`http://localhost/api/automations/prospection/${TASK}/assign`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
    body: JSON.stringify({ assignee_id: assignee }),
  })

const params = { params: Promise.resolve({ id: TASK }) }

/** Chaîne `.select().eq().maybeSingle()` renvoyant une ligne donnée. */
const selectRow = (data: unknown) => ({
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  maybeSingle: jest.fn().mockResolvedValue({ data, error: null }),
})

describe('PATCH /api/automations/prospection/[id]/assign', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    __resetServiceClientForTests()
  })

  it('confie la tâche et journalise le motif', async () => {
    const update = jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) })
    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_profiles') return selectRow({ id: AGENT })
      return { ...selectRow({ id: TASK, status: 'pending', assignee_id: null }), update }
    })

    const { PATCH } = await import('../route')
    const res = await PATCH(request(AGENT), params)

    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalledWith({ assignee_id: AGENT, routing_reason: 'réattribué à la main' })
  })

  it('accepte « personne » — la tâche reste visible, non distribuée', async () => {
    const update = jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) })
    mockFrom.mockImplementation(() => ({
      ...selectRow({ id: TASK, status: 'snoozed', assignee_id: AGENT }),
      update,
    }))

    const { PATCH } = await import('../route')
    const res = await PATCH(request(null), params)

    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalledWith({ assignee_id: null, routing_reason: 'retiré de toutes les files' })
  })

  it('refuse de redonner une tâche déjà traitée', async () => {
    mockFrom.mockImplementation(() => selectRow({ id: TASK, status: 'done', assignee_id: AGENT }))

    const { PATCH } = await import('../route')
    const res = await PATCH(request(AGENT), params)

    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toMatchObject({ error: 'tache_close' })
  })

  it('refuse un destinataire qui n’existe pas', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_profiles') return selectRow(null)
      return selectRow({ id: TASK, status: 'pending', assignee_id: null })
    })

    const { PATCH } = await import('../route')
    const res = await PATCH(request(AGENT), params)

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: 'destinataire_inconnu' })
  })

  it('404 sur une tâche disparue', async () => {
    mockFrom.mockImplementation(() => selectRow(null))

    const { PATCH } = await import('../route')
    const res = await PATCH(request(AGENT), params)

    expect(res.status).toBe(404)
  })

  it('réattribue quand même si routing_reason manque en base', async () => {
    // `routing_reason` n'est qu'un texte d'affichage : son absence ne doit pas
    // empêcher de déplacer la tâche.
    const eq = jest
      .fn()
      .mockResolvedValueOnce({ error: { code: 'PGRST204', message: "Could not find the 'routing_reason' column" } })
      .mockResolvedValueOnce({ error: null })
    const update = jest.fn().mockReturnValue({ eq })
    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_profiles') return selectRow({ id: AGENT })
      return { ...selectRow({ id: TASK, status: 'pending', assignee_id: null }), update }
    })

    const { PATCH } = await import('../route')
    const res = await PATCH(request(AGENT), params)

    expect(res.status).toBe(200)
    expect(update).toHaveBeenLastCalledWith({ assignee_id: AGENT })
  })
})
