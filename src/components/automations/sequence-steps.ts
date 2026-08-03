// sequence-steps.ts — manipulations pures de la liste d'étapes d'une séquence.
//
// L'ordre EST la séquence : on doit pouvoir intercaler un appel entre deux
// emails sans tout refaire. Ces fonctions vivent hors du composant pour être
// vérifiables sans monter l'éditeur entier.
import type { SequenceStep } from './types'

/**
 * Déplace une étape d'un cran. Les jours restent croissants : une étape ne peut
 * pas partir avant celle qu'elle suit désormais — sinon le moteur calculerait
 * une date antérieure à l'étape précédente et l'enverrait immédiatement.
 */
export function moveStep(steps: SequenceStep[], id: string, dir: -1 | 1): SequenceStep[] {
  const i = steps.findIndex((s) => s.id === id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= steps.length) return steps

  const next = [...steps]
  ;[next[i], next[j]] = [next[j], next[i]]
  return clampDays(next)
}

/** Force des jours non décroissants, sans toucher à ceux qui vont déjà bien. */
export function clampDays(steps: SequenceStep[]): SequenceStep[] {
  let floor = 0
  return steps.map((s) => {
    const day = Math.max(floor, s.day ?? 0)
    floor = day
    return day === s.day ? s : { ...s, day }
  })
}
