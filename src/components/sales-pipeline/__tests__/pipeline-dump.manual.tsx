/**
 * Le pipeline commercial rendu en HTML, pour le MESURER dans un vrai navigateur.
 *
 * « Le contenu est mal proportionné sur un 13 pouces » n'est pas une plainte
 * qu'on corrige à l'estime : jsdom ne met rien en page, et à l'œil sur un grand
 * écran tout paraît normal. Ce fichier sort le DOM réel avec sa vraie feuille de
 * style ; le script de capture relève ensuite la hauteur de chaque bandeau et
 * dit combien il reste pour le tableau.
 *
 * Comme `canvas-dump.manual.tsx` : exclu de la suite (`testPathIgnorePatterns`),
 * lancé à la main.
 *
 *     PIPELINE_DUMP=/tmp/sp.html npx jest --testMatch='**\/pipeline-dump.manual.tsx'
 */
import React from 'react'
import fs from 'node:fs'
import path from 'node:path'
import { render, screen, waitFor } from '@testing-library/react'
import type { SalesBoardData } from '../types'

const board = (): SalesBoardData =>
  ({
    rows: Array.from({ length: 6 }, (_, i) => ({
      id: `opp-${i}`,
      companyId: i + 1,
      companyName: `Garage Ferrand ${i + 1}`,
      ville: 'Meaux',
      site: null,
      phone: '0612345678',
      email: `contact${i}@example.fr`,
      emailMissing: i === 2,
      contact: { id: `c${i}`, name: 'Marc Ferrand', role: 'Gérant', phone: '0612345678', email: null },
      ownerId: null,
      ownerName: null,
      montant: 2400,
      type: 'site',
      mrr: null,
      stageId: 3,
      stageName: 'Approche',
      position: 'step:sw',
      state: { state: 'progress', reached: 2, done: [], skipped: [], skipReason: null, stateReason: null, stageDates: {}, replied: false },
      cells: { 'entry': 'done', 'step:s1': 'done', 'step:sw': 'active', 'step:s2': 'locked', 'step:s3': 'locked', 'stage:1': 'locked', 'stage:2': 'locked' },
      notes: [],
      hasTodo: i < 2,
      sequence: {
        enrollmentId: 'e1',
        automationId: 'seq-1',
        name: 'WhatsApp seul — sans e-mail',
        status: 'active',
        currentStep: 2,
        totalSteps: 4,
        stepKind: 'wait',
        stepLabel: 'En attente de réponse',
        sendAt: new Date(Date.now() + 2 * 86400000).toISOString(),
        holdReason: 'awaiting_reply',
        rank: null,
        gapMinutes: null,
        stepId: 'sw',
        variant: null,
      },
      tasks: [],
      archived: null,
      joignable: { companyPhones: ['0612345678'], contacts: [] },
    })) as unknown as SalesBoardData['rows'],
    total: 6,
    page: 0,
    perPage: 8,
    counts: { actifs: 41, rdvPlus: 6, won: 3, todo: 9, value: 74800, missingEmail: 4 },
    columns: (
      [
        ['entry', 'entry', 'Prospect', 'entrée', null, '#8AA0C0'],
        ['step:s1', 'sequence', 'Accroche WhatsApp', 'J+0', 'whatsapp', '#1F8A5B'],
        ['step:sw', 'sequence', 'En attente de réponse', 'relance auto à J+3', 'wait', '#A24E86'],
        ['step:s2', 'sequence', 'Relance', 'J+3 · si silence', 'call', '#C8881F'],
        ['step:s3', 'sequence', 'Récapitulatif', 'J+8', 'email', '#2F7AE0'],
        ['stage:1', 'pipeline', 'RDV calé', null, null, '#7A5AE0'],
        ['stage:2', 'pipeline', 'Client signé', null, null, '#1F8A5B'],
      ] as const
    ).map(([id, group, label, hint, kind, color], index) => ({
      id,
      group,
      label,
      hint,
      kind,
      color,
      index,
      mode: 'auto',
      cta: 'Ouvrir',
    })) as unknown as SalesBoardData['columns'],
    columnCounts: { 'step:sw': { active: 6, done: 0 } },
    missingEmail: [],
    sequenceHasEmailStep: true,
    pipelines: [
      { id: 'p-1', nom: 'Streak Mars/Avril', isDefault: true },
      { id: 'p-2', nom: 'Agent SAMA', isDefault: false },
    ],
    selectedPipelineId: 'p-1',
    selectedSequenceId: 'seq-1',
    selectedPart: 'seq-1',
    partCounts: { sequences: { 'seq-1': 24, 'seq-2': 11, 'seq-3': 7, 'seq-4': 3 }, noSequence: 128, all: 173 },
    agents: [
      { id: 'a1', name: 'Bilal Cacan', isAdmin: false },
      { id: 'a2', name: 'Matteo Sallami', isAdmin: false },
    ],
    sequences: [
      { id: 'seq-1', name: 'WhatsApp seul — sans e-mail', status: 'on', steps: [], windows: [], activeEnrollments: 24 },
      { id: 'seq-2', name: 'WhatsApp seul — site direct', status: 'draft', steps: [], windows: [], activeEnrollments: 11 },
      { id: 'seq-3', name: 'E-mail + WhatsApp — mix', status: 'draft', steps: [], windows: [], activeEnrollments: 7 },
      { id: 'seq-4', name: 'E-mail + fixe', status: 'draft', steps: [], windows: [], activeEnrollments: 3 },
    ] as unknown as SalesBoardData['sequences'],
    sequenceAcces: { restreint: false, masquees: 0 },
    regulator: {
      paused: false,
      testMode: false,
      gapMinMinutes: 4,
      gapMaxMinutes: 11,
      dailyCap: 60,
      sentToday: 18,
      timezone: 'Europe/Paris',
      openWindows: [
        [540, 720],
        [840, 1080],
      ],
      queued: 12,
      blocked: 2,
      nextSendAt: new Date(Date.now() + 9 * 60000).toISOString(),
    },
    queue: [],
  }) as unknown as SalesBoardData

jest.mock('@/utils/authedFetch', () => ({
  authedFetch: async () => ({ ok: true, json: async () => board() }),
}))
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))
jest.mock('sonner', () => ({ toast: { error: () => {}, success: () => {} } }))

it('écrit le pipeline en HTML', async () => {
  const { SalesPipeline } = await import('../SalesPipeline')
  const { container } = render(<SalesPipeline />)
  await waitFor(() => expect(screen.getAllByText(/pipeline commercial/i).length).toBeGreaterThan(0))
  await waitFor(() => expect(container.querySelector('.mx-scroll')).toBeTruthy())

  const css = [
    fs.readFileSync(path.join(__dirname, '..', '..', 'marketing-pipeline', 'mp-skin.css'), 'utf8'),
    fs.readFileSync(path.join(__dirname, '..', 'sp-skin.css'), 'utf8'),
  ]
    // Les `@import` sont déjà résolus à la main ci-dessus.
    .join('\n')
    .replace(/@import[^;]+;/g, '')

  const sortie = process.env.PIPELINE_DUMP || '/tmp/sp.html'
  fs.writeFileSync(
    sortie,
    `<!doctype html><meta charset="utf-8"><style>
      html,body{margin:0;height:100%}
      /* La coque du CRM : une barre d'application, puis la page qui prend le reste. */
      .shell{display:flex;flex-direction:column;height:100vh}
      .appbar{height:52px;flex:0 0 52px;border-bottom:1px solid #e6edf7;background:#fff}
      ${css}
    </style><div class="shell"><div class="appbar"></div>${container.innerHTML}</div>`,
  )
  expect(fs.existsSync(sortie)).toBe(true)
})
