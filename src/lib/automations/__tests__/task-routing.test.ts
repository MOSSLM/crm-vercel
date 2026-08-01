/**
 * @jest-environment node
 */
import { routeBatch, routeTask, type RoutingContext } from '../task-routing'

const ADMIN = 'admin-1'

const ctx = (over: Partial<RoutingContext> = {}): RoutingContext => ({
  mode: 'pref',
  maxPerAgent: 2,
  adminId: ADMIN,
  loads: new Map(),
  ...over,
})

describe('routeTask', () => {
  it('envoie tout à l’admin en mode « tout à l’admin »', () => {
    expect(routeTask({ ownerId: 'lea' }, ctx({ mode: 'admin' })).assigneeId).toBe(ADMIN)
  })

  it('donne la tâche au propriétaire du contact', () => {
    const r = routeTask({ ownerId: 'lea' }, ctx())
    expect(r.assigneeId).toBe('lea')
    expect(r.reason).toBe('propriétaire du contact')
  })

  it('bascule chez l’admin quand personne ne suit le contact', () => {
    const r = routeTask({ ownerId: null }, ctx())
    expect(r.assigneeId).toBe(ADMIN)
    expect(r.reason).toContain('aucun propriétaire')
  })

  it('retombe sur celui qui a lancé la séquence, puis sur le propriétaire du deal', () => {
    expect(routeTask({ ownerId: null, createdBy: 'thomas' }, ctx()).assigneeId).toBe('thomas')
    expect(routeTask({ ownerId: null, opportunityOwnerId: 'nadia' }, ctx()).assigneeId).toBe('nadia')
  })

  it('bascule chez l’admin quand la file de l’agent est pleine', () => {
    const r = routeTask({ ownerId: 'lea' }, ctx({ loads: new Map([['lea', 2]]) }))
    expect(r.assigneeId).toBe(ADMIN)
    expect(r.reason).toContain('pleine')
  })

  it('bascule chez l’admin quand l’agent est indisponible', () => {
    const r = routeTask({ ownerId: 'nadia' }, ctx({ unavailable: new Set(['nadia']) }))
    expect(r.assigneeId).toBe(ADMIN)
  })

  it('en mode strict, la tâche attend son propriétaire absent', () => {
    const r = routeTask({ ownerId: 'nadia' }, ctx({ mode: 'strict', unavailable: new Set(['nadia']) }))
    expect(r.assigneeId).toBe('nadia')
    expect(r.reason).toContain('attend')
  })

  it('en mode strict, la charge maximale ne s’applique pas', () => {
    const r = routeTask({ ownerId: 'lea' }, ctx({ mode: 'strict', loads: new Map([['lea', 99]]) }))
    expect(r.assigneeId).toBe('lea')
  })

  it('sans admin configuré, la tâche reste non assignée plutôt que d’aller n’importe où', () => {
    expect(routeTask({ ownerId: null }, ctx({ adminId: null })).assigneeId).toBeNull()
  })
})

describe('routeBatch', () => {
  it('fait déborder chez l’admin au fil du lot', () => {
    const out = routeBatch(
      [{ ownerId: 'lea' }, { ownerId: 'lea' }, { ownerId: 'lea' }],
      ctx({ maxPerAgent: 2 }),
    )
    expect(out.map((o) => o.assigneeId)).toEqual(['lea', 'lea', ADMIN])
  })

  it('ne modifie pas la map de charges reçue', () => {
    const loads = new Map([['lea', 0]])
    routeBatch([{ ownerId: 'lea' }], ctx({ loads }))
    expect(loads.get('lea')).toBe(0)
  })
})
