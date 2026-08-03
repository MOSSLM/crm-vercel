import { clampDays, moveStep } from '../sequence-steps'
import type { SequenceStep } from '../types'

const step = (id: string, day: number, kind: SequenceStep['kind'] = 'email'): SequenceStep => ({ id, day, kind })

describe('moveStep', () => {
  it('échange deux étapes voisines', () => {
    const steps = [step('a', 0), step('b', 2, 'call'), step('c', 5)]
    const out = moveStep(steps, 'c', -1)
    expect(out.map((s) => s.id)).toEqual(['a', 'c', 'b'])
  })

  it('garde les jours croissants après le déplacement', () => {
    // 'c' remonte devant 'b' : il ne peut pas rester à J+5 puis 'b' à J+2,
    // sinon le moteur planifierait 'b' avant l'étape qui la précède.
    const steps = [step('a', 0), step('b', 2), step('c', 5)]
    const out = moveStep(steps, 'c', -1)
    expect(out.map((s) => s.day)).toEqual([0, 5, 5])
  })

  it('ne fait rien aux extrémités ni sur un identifiant inconnu', () => {
    const steps = [step('a', 0), step('b', 2)]
    expect(moveStep(steps, 'a', -1)).toBe(steps)
    expect(moveStep(steps, 'b', 1)).toBe(steps)
    expect(moveStep(steps, 'zz', 1)).toBe(steps)
  })
})

describe('clampDays', () => {
  it('laisse intactes les étapes déjà ordonnées', () => {
    const steps = [step('a', 0), step('b', 3), step('c', 3)]
    const out = clampDays(steps)
    expect(out[0]).toBe(steps[0])
    expect(out[2]).toBe(steps[2])
  })

  it('remonte un jour qui reculerait', () => {
    const out = clampDays([step('a', 4), step('b', 1)])
    expect(out.map((s) => s.day)).toEqual([4, 4])
  })
})
