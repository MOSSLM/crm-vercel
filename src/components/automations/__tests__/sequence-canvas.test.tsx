/**
 * Le plan de séquence : ce qui est posé où, et ce que déplacer une carte veut
 * dire.
 *
 * Le calcul des positions est vérifié à part (`lib/automations/__tests__/canvas`).
 * Ici on tient les deux promesses de l'écran : les deux voies sont réellement
 * dessinées de part et d'autre, et tirer une carte l'édite au lieu de la
 * déplacer visuellement — sans qu'un simple clic, lui, ne déplace rien.
 */
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { SequenceCanvas } from '../SequenceCanvas'
import { CARTE_L, COLONNE_L } from '@/lib/automations/canvas'
import type { SequenceStep } from '../types'

/** jsdom ne connaît pas `PointerEvent` ni la capture de pointeur. */
beforeAll(() => {
  if (!window.PointerEvent) {
    Object.assign(window, { PointerEvent: MouseEvent })
  }
  Element.prototype.setPointerCapture = jest.fn()
  Element.prototype.releasePointerCapture = jest.fn()
})

const STEPS: SequenceStep[] = [
  { id: 's1', kind: 'whatsapp', day: 0, mode: 'manual' },
  { id: 's2', kind: 'wait', day: 0, waitMode: 'reply', replyTimeoutDays: 3 },
  { id: 's3', kind: 'whatsapp', day: 3, mode: 'manual', branch: { waitId: 's2', on: 'reply' } },
  { id: 's4', kind: 'call', day: 3, mode: 'manual', branch: { waitId: 's2', on: 'timeout' } },
  { id: 's5', kind: 'email', day: 6, mode: 'auto' },
]

function poser(over: Partial<React.ComponentProps<typeof SequenceCanvas>> = {}) {
  const onDeplacer = jest.fn()
  const onSelect = jest.fn()
  const utils = render(
    <div className="au-skin">
      <SequenceCanvas
        steps={STEPS}
        selectedId={null}
        onSelect={onSelect}
        onDelete={jest.fn()}
        onMove={jest.fn()}
        onDeplacer={onDeplacer}
        onAjouter={jest.fn()}
        carte={({ step, index }) => (
          <div data-testid={`carte-${step.id}`}>
            {index}. {step.kind}
          </div>
        )}
        {...over}
      />
    </div>,
  )
  return { ...utils, onDeplacer, onSelect }
}

/** Le conteneur positionné d'une carte — c'est lui qui porte les coordonnées. */
const noeudDe = (id: string) => screen.getByTestId(`carte-${id}`).closest('.seq-node') as HTMLElement
const gauche = (el: HTMLElement) => parseFloat(el.style.left)

/**
 * Du plan vers l'écran, via la transformation réellement appliquée.
 *
 * Les cartes portent des coordonnées de PLAN (`style.left`), le pointeur parle
 * en coordonnées d'ÉCRAN, et le zoom initial dépend de la taille de la fenêtre
 * — que jsdom rend à zéro. Viser une carte en lui passant son `left` brut
 * enverrait donc le curseur ailleurs, et le test mesurerait ce décalage plutôt
 * que la logique de dépôt.
 */
function versEcran(container: HTMLElement, x: number, y: number): [number, number] {
  const plan = container.querySelector('.seq-plan') as HTMLElement
  const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)\s*scale\(([\d.]+)\)/.exec(plan.style.transform)
  if (!m) throw new Error(`transformation illisible : ${plan.style.transform}`)
  const [, tx, ty, z] = m
  return [x * Number(z) + Number(tx), y * Number(z) + Number(ty)]
}

/** Le point d'écran visant le milieu de la carte posée à ces coordonnées de plan. */
const viser = (container: HTMLElement, el: HTMLElement): [number, number] =>
  versEcran(container, gauche(el) + CARTE_L / 2, parseFloat(el.style.top))

describe('SequenceCanvas — la forme à l’écran', () => {
  it('dessine toutes les étapes, l’entrée et la fin', () => {
    poser()

    for (const s of STEPS) expect(screen.getByTestId(`carte-${s.id}`)).toBeInTheDocument()
    expect(screen.getByText('Entrée')).toBeInTheDocument()
    expect(screen.getByText('Fin de séquence')).toBeInTheDocument()
  })

  it('écarte les deux voies de part et d’autre du tronc', () => {
    poser()

    const tronc = gauche(noeudDe('s1'))
    // « Il a répondu » à gauche, « Sans réponse » à droite : une colonne de
    // chaque côté du tronc, à un pas d'écart.
    expect(gauche(noeudDe('s3'))).toBe(tronc - COLONNE_L)
    expect(gauche(noeudDe('s4'))).toBe(tronc + COLONNE_L)
  })

  it('fait partir les deux voies de la même hauteur', () => {
    poser()

    expect(noeudDe('s3').style.top).toBe(noeudDe('s4').style.top)
  })

  it('nomme les deux issues et annonce que les chemins se rejoignent', () => {
    poser()

    expect(screen.getByText('Il a répondu')).toBeInTheDocument()
    expect(screen.getByText('Sans réponse')).toBeInTheDocument()
    expect(screen.getByText('les deux chemins se rejoignent')).toBeInTheDocument()
  })

  it('trace un lien par liaison, coloré sur les deux sorties de la fourche', () => {
    const { container } = poser()

    expect(container.querySelectorAll('path.seq-lien').length).toBeGreaterThan(0)
    expect(container.querySelector('path.seq-lien[data-on="reply"]')).toBeTruthy()
    expect(container.querySelector('path.seq-lien[data-on="timeout"]')).toBeTruthy()
  })
})

describe('SequenceCanvas — tirer une carte', () => {
  /** Un geste complet, en coordonnées écran. */
  const tirer = (el: HTMLElement, de: [number, number], vers: [number, number]) => {
    fireEvent.pointerDown(el, { button: 0, clientX: de[0], clientY: de[1] })
    fireEvent.pointerMove(el, { clientX: vers[0], clientY: vers[1] })
    fireEvent.pointerUp(el, { clientX: vers[0], clientY: vers[1] })
  }

  it('ne déplace rien sur un clic — il sélectionne', () => {
    const { onDeplacer, onSelect } = poser()

    // Deux pixels : sous le seuil, c'est un clic, pas un glisser.
    tirer(noeudDe('s3'), [200, 200], [202, 201])

    expect(onDeplacer).not.toHaveBeenCalled()
    expect(onSelect).toHaveBeenCalledWith('s3')
  })

  it('fait passer une carte dans l’autre voie quand on la tire de ce côté', () => {
    const { container, onDeplacer, onSelect } = poser()

    tirer(noeudDe('s3'), [50, 50], viser(container, noeudDe('s4')))

    expect(onSelect).not.toHaveBeenCalled()
    expect(onDeplacer).toHaveBeenCalledTimes(1)
    const [stepId, cible] = onDeplacer.mock.calls[0]
    expect(stepId).toBe('s3')
    expect(cible.branch).toEqual({ waitId: 's2', on: 'timeout' })
  })

  it('ramène une carte sur le tronc quand on la tire au centre', () => {
    const { container, onDeplacer } = poser()

    tirer(noeudDe('s3'), [50, 50], viser(container, noeudDe('s5')))

    const [, cible] = onDeplacer.mock.calls[0]
    expect(cible.branch).toBeNull()
  })

  it('ne déplace rien quand on lâche là où la carte est déjà', () => {
    const { container, onDeplacer } = poser()

    tirer(noeudDe('s3'), [50, 50], viser(container, noeudDe('s3')))

    expect(onDeplacer).not.toHaveBeenCalled()
  })
})
