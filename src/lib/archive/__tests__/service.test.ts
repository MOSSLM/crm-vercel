/**
 * @jest-environment node
 */
import type { SupabaseClient } from '@supabase/supabase-js'

const stopOutreach = jest.fn().mockResolvedValue({ enrollments: 0, jobs: 0, tasks: 0 })
jest.mock('@/lib/sales-pipeline/actions', () => ({
  stopOutreach: (...args: unknown[]) => stopOutreach(...args),
}))

import { ArchiveError, archiveTargets, unarchiveTargets, upsertConcurrentFromUrl } from '../service'

type Call = {
  table: string
  op: 'select' | 'update' | 'upsert' | 'delete'
  payload?: Record<string, unknown>
  filters: [string, unknown][]
}
type Result = { data: unknown; error: unknown }

/**
 * Faux client Supabase : un builder chaînable qui enregistre l'appel au moment
 * où il est attendu, et délègue la réponse au handler du test. Assez pour
 * vérifier *quelles* écritures partent, sur quelles tables et avec quels
 * filtres — ce qui est tout l'enjeu de la cascade.
 */
const makeSb = (handler: (call: Call) => Result) => {
  const calls: Call[] = []
  const from = (table: string) => {
    const state: Call = { table, op: 'select', filters: [] }
    const run = (): Result => {
      calls.push({ ...state, filters: [...state.filters] })
      return handler(state)
    }
    const builder: Record<string, unknown> = {
      select: () => builder,
      update: (p: Record<string, unknown>) => {
        state.op = 'update'
        state.payload = p
        return builder
      },
      upsert: (p: Record<string, unknown>) => {
        state.op = 'upsert'
        state.payload = p
        return builder
      },
      eq: (c: string, v: unknown) => {
        state.filters.push([c, v])
        return builder
      },
      in: (c: string, v: unknown) => {
        state.filters.push([c, v])
        return builder
      },
      maybeSingle: async () => run(),
      then: (res: (r: Result) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve(run()).then(res, rej),
    }
    return builder
  }
  return { sb: { from } as unknown as SupabaseClient, calls }
}

const ok = (data: unknown): Result => ({ data, error: null })
const empty: Result = { data: [], error: null }

const findCall = (calls: Call[], table: string, op: Call['op']) =>
  calls.find((c) => c.table === table && c.op === op)

beforeEach(() => stopOutreach.mockClear())

describe('archiveTargets', () => {
  it('archive une entreprise, ses opportunités, et coupe les envois en vol', async () => {
    const { sb, calls } = makeSb((c) => {
      if (c.table === 'entreprises') return ok([{ id: 42 }])
      if (c.table === 'opportunites') return ok([{ id: 'o1' }, { id: 'o2' }])
      return empty
    })

    const res = await archiveTargets(sb, {
      entrepriseIds: [42],
      reason: 'pas_de_budget',
      note: '  rappelé trois fois  ',
      actorId: 'user-1',
    })

    expect(res).toMatchObject({ entreprises: 1, opportunites: 2, concurrent: null })

    const ent = findCall(calls, 'entreprises', 'update')!
    expect(ent.payload).toMatchObject({
      archive_reason: 'pas_de_budget',
      archive_note: 'rappelé trois fois',
      archived_by: 'user-1',
      // Sort la fiche de la file de qualification et des compteurs qui la
      // filtrent déjà, sans toucher à ces cinq fichiers.
      hidden_in_qualification: true,
    })
    expect(ent.payload!.archived_at).toEqual(expect.any(String))

    // La cascade vise bien les opportunités *de l'entreprise*.
    const opp = findCall(calls, 'opportunites', 'update')!
    expect(opp.filters).toEqual([['entreprise_id', [42]]])
    // Et surtout : on ne touche pas au stage, sinon les automations rejouent.
    expect(opp.payload).not.toHaveProperty('stage_id')

    // Sans ça un email de séquence part après l'archivage.
    expect(stopOutreach.mock.calls.map((c) => c[1]).sort()).toEqual(['o1', 'o2'])
    expect(stopOutreach.mock.calls[0][2]).toBe('exited')
  })

  it('archive une opportunité seule sans toucher à son entreprise', async () => {
    const { sb, calls } = makeSb((c) =>
      c.table === 'opportunites' ? ok([{ id: 'o9' }]) : empty,
    )

    const res = await archiveTargets(sb, {
      opportunityIds: ['o9'],
      reason: 'hors_cible',
      actorId: null,
    })

    expect(res).toMatchObject({ entreprises: 0, opportunites: 1 })
    expect(findCall(calls, 'entreprises', 'update')).toBeUndefined()
    expect(findCall(calls, 'opportunites', 'update')!.filters).toEqual([['id', ['o9']]])
  })

  it('ne compte qu’une fois une opportunité atteinte par les deux chemins', async () => {
    const { sb } = makeSb((c) => (c.table === 'opportunites' ? ok([{ id: 'o1' }]) : ok([{ id: 7 }])))

    const res = await archiveTargets(sb, {
      entrepriseIds: [7],
      opportunityIds: ['o1'],
      reason: 'doublon',
      actorId: 'u',
    })

    expect(res.opportunites).toBe(1)
    expect(stopOutreach).toHaveBeenCalledTimes(1)
  })

  it('rattache la fiche au concurrent, en réutilisant le domaine déjà connu', async () => {
    const { sb, calls } = makeSb((c) => {
      if (c.table === 'concurrents') return ok({ id: 'c-1', domaine: 'agence-web.fr', nom: 'Agence Web' })
      if (c.table === 'entreprises') return ok([{ id: 5 }])
      return empty
    })

    const res = await archiveTargets(sb, {
      entrepriseIds: [5],
      reason: 'refait_par_concurrent',
      concurrentUrl: 'https://WWW.Agence-Web.fr/realisations',
      actorId: 'u',
    })

    expect(res.concurrent).toEqual({ id: 'c-1', domaine: 'agence-web.fr', nom: 'Agence Web' })
    // Déduplication : la ligne existait, on ne réinsère rien.
    expect(findCall(calls, 'concurrents', 'upsert')).toBeUndefined()
    expect(findCall(calls, 'concurrents', 'select')!.filters).toEqual([['domaine', 'agence-web.fr']])
    expect(findCall(calls, 'entreprises', 'update')!.payload).toMatchObject({
      archive_concurrent_id: 'c-1',
    })
  })

  it('crée le concurrent quand le domaine est inconnu, avec un nom lisible', async () => {
    const { sb, calls } = makeSb((c) => {
      if (c.table === 'concurrents' && c.op === 'select') return ok(null)
      if (c.table === 'concurrents' && c.op === 'upsert')
        return ok({ id: 'c-2', domaine: 'studio-durand.fr', nom: 'Studio Durand' })
      return empty
    })

    const ref = await upsertConcurrentFromUrl(sb, 'studio-durand.fr', 'u')

    expect(ref.id).toBe('c-2')
    expect(findCall(calls, 'concurrents', 'upsert')!.payload).toMatchObject({
      domaine: 'studio-durand.fr',
      nom: 'Studio Durand',
      site_url: 'https://studio-durand.fr',
      created_by: 'u',
    })
  })

  // `canonicalizeDomain` ne valide rien : sans ce garde-fou le registre se
  // remplirait de saisies libres.
  it('refuse une saisie qui n’est pas un domaine', async () => {
    const { sb, calls } = makeSb(() => empty)

    await expect(upsertConcurrentFromUrl(sb, 'pas une url', null)).rejects.toMatchObject({
      message: 'url_concurrent_invalide',
      status: 400,
    })
    expect(calls).toHaveLength(0)
  })

  it('remonte une erreur base en ArchiveError 500', async () => {
    const { sb } = makeSb(() => ({ data: null, error: { message: 'boom' } }))

    await expect(
      archiveTargets(sb, { entrepriseIds: [1], reason: 'autre', actorId: null }),
    ).rejects.toBeInstanceOf(ArchiveError)
  })
})

describe('unarchiveTargets', () => {
  it('remet les cinq colonnes à null, rend la fiche à la qualification, et ne relance rien', async () => {
    const { sb, calls } = makeSb((c) =>
      c.table === 'entreprises' ? ok([{ id: 3 }]) : ok([{ id: 'o1' }]),
    )

    const res = await unarchiveTargets(sb, { entrepriseIds: [3] })

    expect(res).toMatchObject({ entreprises: 1, opportunites: 1, concurrent: null })

    const ent = findCall(calls, 'entreprises', 'update')!
    expect(ent.payload).toEqual({
      archived_at: null,
      archived_by: null,
      archive_reason: null,
      archive_note: null,
      archive_concurrent_id: null,
      hidden_in_qualification: false,
    })
    // La cascade vaut dans les deux sens.
    expect(findCall(calls, 'opportunites', 'update')!.filters).toEqual([['entreprise_id', [3]]])
    // Relancer un envoi reste une action explicite du pipeline commercial.
    expect(stopOutreach).not.toHaveBeenCalled()
  })
})
