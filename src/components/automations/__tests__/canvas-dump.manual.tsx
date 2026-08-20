/**
 * Sortie HTML du plan, pour l'inspecter dans un vrai navigateur.
 *
 * Ce n'est pas une assertion : c'est un outil de relecture visuelle. jsdom ne
 * met rien en page, donc les tests voisins ne peuvent vérifier que des
 * coordonnées — pas ce que ça donne à l'écran. Ce fichier crache le DOM réel du
 * composant avec sa vraie feuille de style, qu'on ouvre ensuite au navigateur.
 *
 * Volontairement nommé `.manual` : il n'entre pas dans la suite (cf. le
 * `testPathIgnorePatterns` de jest.config). On le lance à la main :
 *
 *     CANVAS_DUMP=/tmp/plan.html npx jest --testMatch='**\/canvas-dump.manual.tsx'
 *
 * C'est ce qui a fait apparaître trois défauts que jsdom ne pouvait pas voir :
 * le bouton « Ajouter ici » enfoui sous les cartes d'une voie, un grand vide
 * sous chaque en-tête de voie, et un trait de liaison qui remontait à
 * contresens derrière les cartes.
 */
import React from 'react'
import fs from 'node:fs'
import path from 'node:path'
import { render } from '@testing-library/react'
import { SequenceCanvas } from '../SequenceCanvas'
import type { SequenceStep } from '../types'

beforeAll(() => {
  if (!window.PointerEvent) {
    Object.assign(window, { PointerEvent: MouseEvent })
  }
  Element.prototype.setPointerCapture = jest.fn()
  Element.prototype.releasePointerCapture = jest.fn()
  // Une fenêtre plausible : sans elle, jsdom rend 0×0 et le cadrage initial
  // tombe au zoom minimum, ce qui ne ressemble à rien de ce qu'on verra.
  Element.prototype.getBoundingClientRect = () =>
    ({ width: 860, height: 700, left: 0, top: 0, right: 860, bottom: 700, x: 0, y: 0 }) as DOMRect
})

const STEPS: SequenceStep[] = [
  { id: 's1', kind: 'whatsapp', day: 0, mode: 'manual', template: null },
  { id: 's2', kind: 'wait', day: 0, waitMode: 'reply', replyTimeoutDays: 3 },
  { id: 's3', kind: 'whatsapp', day: 3, mode: 'manual', branch: { waitId: 's2', on: 'reply' } },
  { id: 's4', kind: 'call', day: 3, mode: 'manual', branch: { waitId: 's2', on: 'timeout' } },
  { id: 's5', kind: 'call', day: 5, mode: 'manual', branch: { waitId: 's2', on: 'timeout' } },
  { id: 's6', kind: 'email', day: 8, mode: 'auto' },
]

it('écrit le plan en HTML', () => {
  const { container } = render(
    <div className="au-skin" data-density="regular">
      <div className="au-body" style={{ height: 700 }}>
        <div className="pane" style={{ background: 'transparent', gridColumn: '1 / -1' }}>
          <div className="pane-hd">
            <div className="title-row">Séquence</div>
          </div>
          <div className="seq-host">
            <SequenceCanvas
              steps={STEPS}
              selectedId="s3"
              onSelect={() => {}}
              onDelete={() => {}}
              onMove={() => {}}
              onDeplacer={() => {}}
              onAjouter={() => {}}
      onRediriger={() => {}}
              carte={({ step, index }) => (
                <div className="seq-step" data-kind={step.kind} data-reply={step.waitMode === 'reply'}>
                  <div className="hd">
                    <span className="num">{index}</span>
                    <span className="ic-wrap" />
                    <div className="title" style={{ minWidth: 0 }}>
                      <div>{TITRES[step.kind] ?? step.kind}</div>
                      <div className="sub">{SOUS_TITRES[step.kind] ?? ''}</div>
                    </div>
                  </div>
                  <div className="ft">
                    <span className="wait-chip">{step.day > 0 ? `J+${step.day}` : 'immédiat'}</span>
                    {step.kind === 'email' && <span className="wait-chip accent">régulateur</span>}
                    {step.mode === 'manual' && <span className="wait-chip manual">à la main</span>}
                  </div>
                </div>
              )}
            />
          </div>
        </div>
      </div>
    </div>,
  )

  const css = fs.readFileSync(path.join(__dirname, '..', 'automations-skin.css'), 'utf8')
  const sortie = process.env.CANVAS_DUMP || '/tmp/canvas.html'
  fs.writeFileSync(
    sortie,
    `<!doctype html><meta charset="utf-8"><style>${css}\nbody{margin:0;font-family:system-ui}</style>${container.innerHTML}`,
  )
  expect(fs.existsSync(sortie)).toBe(true)
})

const TITRES: Record<string, string> = {
  whatsapp: 'Accroche directe — le site',
  call: 'Relance après site envoyé',
  email: 'Récapitulatif et proposition',
  wait: 'Attendre une réponse',
}
const SOUS_TITRES: Record<string, string> = {
  whatsapp: 'Message à valider manuellement',
  call: 'Action manuelle — file de démarchage',
  email: 'Envoi automatique via Resend',
  wait: 'Relance automatique à J+3 sans réponse',
}
