/**
 * @jest-environment node
 */
import { allowRecipient, isTestPhaseActive, resetTestGuardCache } from '../test-guard'

type Row = Record<string, unknown>

/** Client Supabase minimal : deux tables, des lectures, rien d'autre. */
const client = (opts: { testMode?: boolean | 'missing'; addresses?: string[] }) => {
  const calls = { regulator: 0, addresses: 0 }
  return {
    calls,
    from(table: string) {
      if (table === 'regulator_settings') {
        calls.regulator++
        if (opts.testMode === 'missing') {
          return {
            select: () => ({ eq: () => ({ maybeSingle: () => Promise.reject(new Error('relation absente')) }) }),
          }
        }
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: { test_mode: !!opts.testMode } as Row }) }),
          }),
        }
      }
      if (table === 'test_email_addresses') {
        calls.addresses++
        return { select: () => Promise.resolve({ data: (opts.addresses ?? []).map((email) => ({ email })) }) }
      }
      throw new Error(`table inattendue: ${table}`)
    },
  } as unknown as Parameters<typeof allowRecipient>[0] & { calls: typeof calls }
}

describe('garde-fou de la phase de test', () => {
  beforeEach(() => resetTestGuardCache())

  it('laisse tout passer quand la phase de test est coupée', async () => {
    const sb = client({ testMode: false })
    await expect(allowRecipient(sb, 'contact@garage-cristal.fr')).resolves.toEqual({ allowed: true })
    // Inutile de charger la liste blanche si personne ne la consulte.
    expect(sb.calls.addresses).toBe(0)
  })

  it('laisse passer une adresse de la liste', async () => {
    const sb = client({ testMode: true, addresses: ['codingmos@gmail.com'] })
    const verdict = await allowRecipient(sb, 'codingmos@gmail.com')
    expect(verdict.allowed).toBe(true)
  })

  it('retient un vrai prospect et dit pourquoi', async () => {
    const sb = client({ testMode: true, addresses: ['codingmos@gmail.com'] })
    const verdict = await allowRecipient(sb, 'contact@garage-cristal.fr')
    expect(verdict.allowed).toBe(false)
    expect(verdict.reason).toBe('mode_test')
    // On rappelle qui reçoit encore : sinon le blocage passe pour une panne.
    expect(verdict.allowlist).toEqual(['codingmos@gmail.com'])
  })

  it('ignore la casse et les espaces', async () => {
    const sb = client({ testMode: true, addresses: ['  CodingMos@Gmail.com '] })
    await expect(allowRecipient(sb, 'codingmos@gmail.com')).resolves.toEqual(
      expect.objectContaining({ allowed: true }),
    )
  })

  it('bloque tout quand la liste est vide — c’est le sens sûr', async () => {
    const sb = client({ testMode: true, addresses: [] })
    const verdict = await allowRecipient(sb, 'codingmos@gmail.com')
    expect(verdict.allowed).toBe(false)
  })

  it('retient un destinataire absent plutôt que de le laisser filer', async () => {
    const sb = client({ testMode: true, addresses: ['codingmos@gmail.com'] })
    await expect(allowRecipient(sb, null)).resolves.toEqual(expect.objectContaining({ allowed: false }))
  })

  it('n’invente pas de phase de test si la migration n’est pas appliquée', async () => {
    const sb = client({ testMode: 'missing' })
    await expect(allowRecipient(sb, 'contact@garage-cristal.fr')).resolves.toEqual({ allowed: true })
    await expect(isTestPhaseActive(sb)).resolves.toBe(false)
  })

  it('met les réglages en cache — le ticker enchaîne les envois', async () => {
    const sb = client({ testMode: true, addresses: ['codingmos@gmail.com'] })
    await allowRecipient(sb, 'a@b.fr')
    await allowRecipient(sb, 'c@d.fr')
    expect(sb.calls.regulator).toBe(1)
  })

  it('reprend les réglages à zéro après un changement', async () => {
    const sb = client({ testMode: true, addresses: ['codingmos@gmail.com'] })
    await allowRecipient(sb, 'a@b.fr')
    resetTestGuardCache()
    await allowRecipient(sb, 'a@b.fr')
    expect(sb.calls.regulator).toBe(2)
  })
})
