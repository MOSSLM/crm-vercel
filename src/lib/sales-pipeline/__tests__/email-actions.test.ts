/**
 * @jest-environment node
 */
// Ce que fait le pipeline commercial d'un prospect qu'aucun email ne peut
// atteindre : sauter l'étape pour enchaîner sur WhatsApp, ou enregistrer
// l'adresse à la main sur la fiche entreprise.

const mockProcessSequenceEnrollment = jest.fn()
const mockCancelEnrollmentWork = jest.fn()
const mockVerifyEmail = jest.fn()

jest.mock('@/lib/automations/engine', () => ({
  processSequenceEnrollment: (...args: unknown[]) => mockProcessSequenceEnrollment(...args),
  cancelEnrollmentWork: (...args: unknown[]) => mockCancelEnrollmentWork(...args),
}))

// `setProspectEmail` vérifie l'adresse dans la foulée, et `verifyEmail` sort sur
// le réseau (DNS-over-HTTPS). Sans ce mock le verdict dépend de la machine :
// « indéterminé » sur un poste sans résolution sortante, « valide » sur un
// runner qui a du réseau — ce qui faisait passer ce fichier en local et échouer
// en intégration continue. Ce que ces cas testent, c'est le pipeline commercial,
// pas le vérificateur : le verdict est donc fourni.
// Seul `verifyEmail` est remplacé ; le reste du module est réel, car
// `regulator-db` et `engine` en importent d'autres fonctions.
jest.mock('@/lib/email/verify/service', () => ({
  ...jest.requireActual('@/lib/email/verify/service'),
  verifyEmail: (...args: unknown[]) => mockVerifyEmail(...args),
}))

/** Verdict rendu quand aucun résolveur DNS n'a répondu. */
const UNRESOLVED_VERDICT = {
  email: 'contact@garage.fr',
  status: 'unknown' as const,
  reason: 'dns_unresolved',
  details: { suggestion: null },
  expiresAt: 0,
}

import { setProspectEmail, skipEmailStep } from '../actions'
import type { SupabaseClient } from '@supabase/supabase-js'

type ChainOpts = { list?: unknown; single?: unknown }

/**
 * Chaîne Supabase minimale : `await` direct rend la liste, `maybeSingle()` rend
 * la ligne unique. Les écritures sont capturées plutôt qu'exécutées.
 */
const chain = (opts: ChainOpts = {}) => {
  const captured: { updates: Record<string, unknown>[]; upserts: Record<string, unknown>[] } = {
    updates: [],
    upserts: [],
  }
  const c: any = { captured }
  for (const m of ['select', 'eq', 'in', 'not', 'order', 'limit']) c[m] = jest.fn(() => c)
  c.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve({ data: opts.list ?? [], error: null }).then(resolve, reject)
  c.maybeSingle = jest.fn(() => Promise.resolve({ data: opts.single ?? null, error: null }))
  c.update = jest.fn((u: Record<string, unknown>) => {
    captured.updates.push(u)
    return c
  })
  c.upsert = jest.fn((u: Record<string, unknown>) => {
    captured.upserts.push(u)
    return Promise.resolve({ error: null })
  })
  return c
}

const clientOf = (tables: Record<string, any>) =>
  ({
    from: (table: string) => {
      if (!tables[table]) throw new Error(`table inattendue : ${table}`)
      return tables[table]
    },
  }) as unknown as SupabaseClient

const enrollment = (over: Record<string, unknown> = {}) => ({
  id: 'enr-1',
  automation_id: 'auto-1',
  contact_id: 'c-1',
  entreprise_id: 7,
  opportunite_id: 'opp-1',
  current_step: 0,
  status: 'active',
  entered_at: new Date().toISOString(),
  ...over,
})

beforeEach(() => {
  mockProcessSequenceEnrollment.mockReset()
  mockProcessSequenceEnrollment.mockResolvedValue(undefined)
  mockCancelEnrollmentWork.mockReset()
  mockVerifyEmail.mockReset()
  mockVerifyEmail.mockResolvedValue(UNRESOLVED_VERDICT)
})

describe('skipEmailStep', () => {
  /** email (J+0) → attente (J+1) → whatsapp (J+2) : le cas courant. */
  const steps = [
    { id: 's1', kind: 'email', day: 0 },
    { id: 's2', kind: 'wait', day: 1 },
    { id: 's3', kind: 'whatsapp', day: 2 },
  ]

  it('barre l’étape email, saute l’attente et enchaîne sur WhatsApp', async () => {
    const enrollments = chain({ list: [enrollment()], single: enrollment({ current_step: 2 }) })
    const state = chain({ single: null })
    const sb = clientOf({
      sales_pipeline_state: state,
      sequence_enrollments: enrollments,
      automations: chain({ single: { definition: { steps } } }),
    })

    const result = await skipEmailStep(sb, 'opp-1')

    // L'inscription se pose sur l'étape WhatsApp, tout de suite.
    expect(enrollments.captured.updates[0]).toEqual(
      expect.objectContaining({ current_step: 2, send_at: null, hold_reason: null, next_run_at: expect.any(String) }),
    )
    // La tâche manuelle est créée sans attendre le prochain tick.
    expect(mockProcessSequenceEnrollment).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ skipped: ['step:s1'], advanced: 1, nextKind: 'whatsapp' })
    expect(state.captured.upserts[0]).toEqual(
      expect.objectContaining({ opportunite_id: 'opp-1', skipped: ['step:s1'] }),
    )
  })

  it('termine l’inscription quand il ne reste que des emails', async () => {
    const enrollments = chain({ list: [enrollment()] })
    const sb = clientOf({
      sales_pipeline_state: chain({ single: null }),
      sequence_enrollments: enrollments,
      automations: chain({ single: { definition: { steps: [{ id: 's1', kind: 'email', day: 0 }] } } }),
    })

    const result = await skipEmailStep(sb, 'opp-1')

    expect(enrollments.captured.updates[0]).toEqual(
      expect.objectContaining({ status: 'finished', current_step: 1 }),
    )
    expect(mockProcessSequenceEnrollment).not.toHaveBeenCalled()
    expect(result.nextKind).toBeNull()
  })

  it('ne touche à rien quand l’étape courante n’est pas un email', async () => {
    const enrollments = chain({ list: [enrollment({ current_step: 2 })] })
    const state = chain({ single: null })
    const sb = clientOf({
      sales_pipeline_state: state,
      sequence_enrollments: enrollments,
      automations: chain({ single: { definition: { steps } } }),
    })

    const result = await skipEmailStep(sb, 'opp-1')

    expect(enrollments.captured.updates).toHaveLength(0)
    expect(result).toEqual({ skipped: [], advanced: 0, nextKind: null })
    // Rien à barrer : on n'écrit pas d'état pour rien.
    expect(state.captured.upserts).toHaveLength(0)
  })

  it('conserve les colonnes déjà sautées', async () => {
    const state = chain({ single: { opportunite_id: 'opp-1', skipped: ['step:s0'], state: 'progress' } })
    const sb = clientOf({
      sales_pipeline_state: state,
      sequence_enrollments: chain({ list: [enrollment()], single: enrollment({ current_step: 2 }) }),
      automations: chain({ single: { definition: { steps } } }),
    })

    await skipEmailStep(sb, 'opp-1', ['step:sX'])

    expect(state.captured.upserts[0].skipped).toEqual(
      expect.arrayContaining(['step:s0', 'step:sX', 'step:s1']),
    )
  })
})

describe('setProspectEmail', () => {
  it('enregistre l’adresse sur la fiche entreprise et dégèle la séquence', async () => {
    const entreprises = chain()
    const enrollments = chain({ list: [{ id: 'enr-1' }] })
    const sb = clientOf({
      opportunites: chain({ single: { id: 'opp-1', entreprise_id: 7, contact_id: 'c-1' } }),
      entreprises,
      sequence_enrollments: enrollments,
    })

    const result = await setProspectEmail(sb, { opportuniteId: 'opp-1' }, '  Contact@Garage.fr ')

    expect(entreprises.captured.updates[0]).toEqual(
      expect.objectContaining({ email: 'Contact@Garage.fr' }),
    )
    // L'adresse nettoyée est bien celle qui part au vérificateur, et `force`
    // court-circuite le verdict en cache : une correction manuelle doit être
    // retestée tout de suite. Cette assertion garde aussi le mock honnête — si
    // elle tombe, c'est que le vrai vérificateur est appelé et que le test
    // repart sur le réseau.
    expect(mockVerifyEmail).toHaveBeenCalledWith(sb, 'Contact@Garage.fr', { force: true })
    // Le contact garde son adresse : on n'écrase jamais une fiche personne.
    expect(result).toEqual({
      ok: true,
      result: {
        email: 'Contact@Garage.fr',
        target: 'entreprise',
        resumed: 1,
        // L'adresse est vérifiée dans la foulée, et le verdict est remonté tel
        // quel. Ici le vérificateur rend « indéterminé » (aucun résolveur DNS
        // n'a répondu) : on n'invente pas un verdict, et l'adresse est quand
        // même enregistrée.
        verification: { status: 'unknown', reason: expect.any(String), suggestion: null },
      },
    })
    expect(enrollments.captured.updates[0]).toEqual(
      expect.objectContaining({ hold_reason: null, next_run_at: expect.any(String) }),
    )
  })

  it('accepte une entreprise sans passer par une opportunité', async () => {
    const entreprises = chain()
    const sb = clientOf({ entreprises, sequence_enrollments: chain({ list: [] }) })

    const result = await setProspectEmail(sb, { entrepriseId: 7 }, 'contact@garage.fr')

    expect(result.ok).toBe(true)
    expect(entreprises.captured.updates[0]).toEqual(expect.objectContaining({ email: 'contact@garage.fr' }))
  })

  it('refuse une adresse qui n’en est pas une', async () => {
    const sb = clientOf({})
    for (const bad of ['', 'garage', 'garage@', 'a@b']) {
      expect(await setProspectEmail(sb, { entrepriseId: 7 }, bad)).toEqual({
        ok: false,
        error: 'email_invalide',
      })
    }
  })

  it('retombe sur le contact quand l’opportunité n’a pas d’entreprise', async () => {
    const contacts = chain()
    const sb = clientOf({
      opportunites: chain({ single: { id: 'opp-1', entreprise_id: null, contact_id: 'c-1' } }),
      contacts,
      sequence_enrollments: chain({ list: [] }),
    })

    const result = await setProspectEmail(sb, { opportuniteId: 'opp-1' }, 'jean@garage.fr')

    expect(contacts.captured.updates[0]).toEqual({ email: 'jean@garage.fr' })
    expect(result).toEqual({
      ok: true,
      result: {
        email: 'jean@garage.fr',
        target: 'contact',
        resumed: 0,
        verification: { status: 'unknown', reason: expect.any(String), suggestion: null },
      },
    })
  })
})
