/**
 * @jest-environment node
 *
 * Une séquence ne part que si elle est ACTIVÉE.
 *
 * Le tableau proposait les brouillons au même titre que les séquences en
 * service ; l'inscription repartait alors en 409 `sequence_inactive`, visible
 * dans la console du navigateur et nulle part à l'écran. Ces tests fixent les
 * deux moitiés du contrat : le refus nomme la séquence et son état, et une
 * séquence activée passe — y compris la séquence WhatsApp, dont la première
 * étape n'est pas un e-mail et crée donc sa tâche tout de suite.
 */
import { handleEnroll } from '../_handlers'
import type { SalesEnrollPayload } from '@/app/api/_lib/schemas'

const mockFrom = jest.fn()
const mockEnrollInSequence = jest.fn()
const mockProcessSequenceEnrollment = jest.fn()

jest.mock('@/app/api/_lib/service-client', () => ({
  getServiceClient: () => ({ from: (...args: unknown[]) => mockFrom(...args) }),
}))

jest.mock('@/lib/automations/engine', () => ({
  enrollInSequence: (...args: unknown[]) => mockEnrollInSequence(...args),
  processSequenceEnrollment: (...args: unknown[]) => mockProcessSequenceEnrollment(...args),
}))

type Result = { data: unknown; error: unknown }

/**
 * Un maillon PostgREST : toute méthode de filtre renvoie le même maillon, et le
 * maillon lui-même est attendable. C'est ce que fait le vrai client — un select
 * sans filtre s'attend directement (`await sb.from(t).select(c)`), et sans ce
 * `then` un tel appel rendrait le maillon au lieu de ses données.
 */
function chain(result: Result) {
  const link: Record<string, unknown> = {}
  const self = () => link
  const settle = () => Promise.resolve(result)
  Object.assign(link, {
    select: self,
    eq: self,
    in: settle,
    maybeSingle: settle,
    upsert: () => Promise.resolve({ data: null, error: null }),
    then: (resolve: (v: Result) => unknown) => Promise.resolve(result).then(resolve),
  })
  return link
}

const OPP = { id: 'opp-1', owner_id: null, entreprise: null }
const OPP_ROW = { id: 'opp-1', entreprise_id: 42, contact_id: 'contact-1' }

const SEQUENCE_WHATSAPP = {
  id: 'seq-wa',
  name: 'WhatsApp seul — sans e-mail',
  kind: 'sequence',
  status: 'draft',
  definition: { steps: [{ kind: 'whatsapp' }, { kind: 'wait' }] },
}

/**
 * Branche les tables sur des réponses fixes. `opportunites` est interrogée deux
 * fois (le contrôle d'accès, puis les colonnes de travail) : la file rend la
 * bonne réponse à chaque passage.
 */
function wireTables(
  automation: Record<string, unknown> | null,
  attributions: { automation_id: string; agent_id: string }[] = [],
  proprietaire: string | null = null,
) {
  const opportunites = [
    { data: [{ ...OPP, owner_id: proprietaire }], error: null },
    { data: [OPP_ROW], error: null },
  ]
  mockFrom.mockImplementation((table: string) => {
    switch (table) {
      case 'opportunites':
        return chain(opportunites.shift() ?? { data: [], error: null })
      case 'automations':
        return chain({ data: automation, error: null })
      case 'contacts':
        return chain({ data: [], error: null })
      case 'sequence_agent_assignments':
        return chain({ data: attributions, error: null })
      case 'sequence_enrollments':
        return chain({ data: { id: 'enr-1', automation_id: 'seq-wa' }, error: null })
      default:
        return chain({ data: null, error: null })
    }
  })
}

const body: SalesEnrollPayload = { automation_id: 'seq-wa', opportunite_ids: ['opp-1'] }
const scope = { ownerId: null, userId: 'user-1' }

beforeEach(() => {
  jest.clearAllMocks()
  mockEnrollInSequence.mockResolvedValue({ enrolled: true, enrollmentId: 'enr-1' })
  mockProcessSequenceEnrollment.mockResolvedValue(undefined)
})

describe('handleEnroll — état de la séquence', () => {
  it('refuse un brouillon en NOMMANT la séquence et son état', async () => {
    wireTables(SEQUENCE_WHATSAPP)

    const res = await handleEnroll(body, scope, {})
    const payload = await res.json()

    expect(res.status).toBe(409)
    expect(payload).toEqual({
      error: 'sequence_inactive',
      sequence_name: 'WhatsApp seul — sans e-mail',
      sequence_status: 'draft',
    })
    // Rien n'est parti : le refus précède toute inscription.
    expect(mockEnrollInSequence).not.toHaveBeenCalled()
  })

  it('distingue une séquence mise en pause d’un brouillon', async () => {
    wireTables({ ...SEQUENCE_WHATSAPP, status: 'paused' })

    const payload = await (await handleEnroll(body, scope, {})).json()

    expect(payload.sequence_status).toBe('paused')
  })

  it('inscrit dès que la séquence est activée, et crée la tâche du jour 0', async () => {
    wireTables({ ...SEQUENCE_WHATSAPP, status: 'on' })

    const res = await handleEnroll(body, scope, {})
    const payload = await res.json()

    expect(res.status).toBe(200)
    expect(payload).toMatchObject({
      ok: true,
      enrolled: 1,
      results: [{ opportunite_id: 'opp-1', status: 'enrolled' }],
    })
    // Première étape WhatsApp : elle ne passe pas par le régulateur des e-mails,
    // sa tâche est créée dans la foulée.
    expect(mockProcessSequenceEnrollment).toHaveBeenCalledTimes(1)
  })

  it('ne crée aucune tâche immédiate quand la séquence ouvre sur un e-mail', async () => {
    wireTables({
      ...SEQUENCE_WHATSAPP,
      status: 'on',
      definition: { steps: [{ kind: 'email' }, { kind: 'whatsapp' }] },
    })

    await handleEnroll(body, scope, {})

    // L'e-mail du jour 0 entre dans la file du régulateur, qui choisit l'heure.
    expect(mockProcessSequenceEnrollment).not.toHaveBeenCalled()
  })
})

/**
 * Le garde d'accès doit dire OUI exactement quand le tableau de l'agent
 * proposait la séquence. La version d'avant exigeait une attribution nominative
 * sur toute séquence : la table étant vide en production, elle refusait tout à
 * tout le monde — un agent ne pouvait mettre personne en séquence.
 */
describe('handleEnroll — accès de l’agent', () => {
  const agent = { ownerId: 'agent-1', userId: 'agent-1' }
  const ACTIVE = { ...SEQUENCE_WHATSAPP, status: 'on' }

  it('laisse passer une séquence ouverte à tous, sans attribution', async () => {
    wireTables(ACTIVE, [], agent.ownerId)

    expect((await handleEnroll(body, agent, {})).status).toBe(200)
  })

  it('refuse une séquence restreinte où l’agent n’est pas nommé', async () => {
    wireTables(
      { ...ACTIVE, settings: { acces: 'choisis' } },
      [{ automation_id: 'seq-wa', agent_id: 'un-autre' }],
      agent.ownerId,
    )

    const res = await handleEnroll(body, agent, {})

    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: 'sequence_non_assignee' })
    expect(mockEnrollInSequence).not.toHaveBeenCalled()
  })

  it('laisse passer une séquence restreinte où l’agent est nommé', async () => {
    wireTables(
      { ...ACTIVE, settings: { acces: 'choisis' } },
      [{ automation_id: 'seq-wa', agent_id: 'agent-1' }],
      agent.ownerId,
    )

    expect((await handleEnroll(body, agent, {})).status).toBe(200)
  })
})
