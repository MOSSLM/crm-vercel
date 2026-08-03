/**
 * @jest-environment node
 *
 * Le bug corrigé ici : activer la phase de test répondait « Enregistrement
 * impossible » sans rien expliquer, parce que la colonne `test_mode` n'existait
 * pas encore sur la base. Une migration manquante doit se dire, pas se deviner.
 */
import { __resetServiceClientForTests } from '@/app/api/_lib/service-client'

const mockFrom = jest.fn()
const mockBuildRegulatorView = jest.fn()

jest.mock('@/env', () => ({
  SUPABASE_URL: 'http://localhost',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role',
}))

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: (...args: unknown[]) => mockFrom(...args),
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.c' } }, error: null }) },
  })),
}))

jest.mock('@/app/api/_lib/auth', () => ({
  requireUser: jest.fn().mockResolvedValue({ ok: true, user: { id: 'u1', email: 'a@b.c' }, accessToken: 't' }),
}))

jest.mock('@/app/api/_lib/require-role', () => ({
  requireRole: jest.fn().mockResolvedValue({ ok: true }),
}))

jest.mock('../_view', () => ({
  TEST_GUARD_MIGRATION: 'sql/20260802_test_phase_guard.sql',
  buildRegulatorView: (...args: unknown[]) => mockBuildRegulatorView(...args),
}))

const patchRequest = (body: unknown) =>
  new Request('http://localhost/api/automations/regulator', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
    body: JSON.stringify(body),
  })

/** Un upsert qui échoue avec l'erreur passée (ou réussit si `error` est nul). */
const upsertWith = (error: { code?: string; message: string } | null) => ({
  upsert: jest.fn().mockResolvedValue({ error }),
})

describe('PATCH /api/automations/regulator', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    __resetServiceClientForTests()
    mockBuildRegulatorView.mockResolvedValue({ settings: { testMode: true }, testGuardReady: true })
  })

  it('enregistre la phase de test et renvoie la vue à jour', async () => {
    const table = upsertWith(null)
    mockFrom.mockReturnValue(table)

    const { PATCH } = await import('../route')
    const res = await PATCH(patchRequest({ test_mode: true }))

    expect(res.status).toBe(200)
    expect(table.upsert).toHaveBeenCalledWith({ id: 'global', test_mode: true }, { onConflict: 'id' })
    await expect(res.json()).resolves.toMatchObject({ settings: { testMode: true } })
  })

  it('nomme le fichier SQL à jouer quand la colonne test_mode manque', async () => {
    mockFrom.mockReturnValue(
      upsertWith({
        code: 'PGRST204',
        message: "Could not find the 'test_mode' column of 'regulator_settings' in the schema cache",
      }),
    )

    const { PATCH } = await import('../route')
    const res = await PATCH(patchRequest({ test_mode: true }))

    expect(res.status).toBe(503)
    const payload = await res.json()
    expect(payload.error).toBe('migration_non_appliquee')
    expect(payload.sql_file).toBe('sql/20260802_test_phase_guard.sql')
    expect(payload.message).toContain('sql/20260802_test_phase_guard.sql')
  })

  it('remonte le message Postgres pour une vraie panne', async () => {
    mockFrom.mockReturnValue(upsertWith({ code: '23514', message: 'violates check constraint' }))

    const { PATCH } = await import('../route')
    const res = await PATCH(patchRequest({ daily_cap: 40 }))

    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toMatchObject({ message: 'violates check constraint' })
  })

  it('refuse un écart maximum inférieur au minimum', async () => {
    mockFrom.mockReturnValue(upsertWith(null))

    const { PATCH } = await import('../route')
    const res = await PATCH(patchRequest({ gap_min_minutes: 20, gap_max_minutes: 5 }))

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: 'ecart_incoherent' })
  })
})
