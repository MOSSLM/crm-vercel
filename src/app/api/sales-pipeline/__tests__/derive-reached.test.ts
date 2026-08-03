/**
 * @jest-environment node
 */
jest.mock('@/app/api/_lib/service-client', () => ({ getServiceClient: () => ({}) }))
jest.mock('@/app/api/automations/regulator/_view', () => ({ buildRegulatorView: jest.fn() }))

import { derivePosition, toStateRow } from '../_board'
import { ENTRY_COLUMN_ID, buildColumns, type PipelineStageRef } from '@/lib/sales-pipeline/stages'
import type { SalesSequenceInfo } from '../_board'
import type { SeqStepKind } from '@/components/automations/types'

const STAGES: PipelineStageRef[] = [
  { id: 1, nom: 'Nouveau lead', ordre: 10 },
  { id: 6, nom: 'RDV calé', ordre: 50 },
  { id: 7, nom: 'Client signé', ordre: 60 },
  { id: 8, nom: 'Perdu', ordre: 70 },
]

const STEPS = [
  { id: 's1', kind: 'email' as SeqStepKind, day: 0, label: null },
  { id: 's2', kind: 'whatsapp' as SeqStepKind, day: 1, label: null },
]

const columns = buildColumns({ steps: STEPS, sequenceName: 'Artisans', stages: STAGES, handoffOrdre: 50 })

const sequence = (over: Partial<SalesSequenceInfo> = {}): SalesSequenceInfo => ({
  enrollmentId: 'e1',
  automationId: 'a1',
  name: 'Artisans',
  status: 'active',
  currentStep: 1,
  totalSteps: 2,
  stepKind: 'email',
  stepLabel: 'Email 1',
  sendAt: null,
  holdReason: null,
  rank: null,
  gapMinutes: null,
  ...over,
})

describe('toStateRow', () => {
  it('rend un état neutre quand la ligne n’a pas encore d’historique', () => {
    const s = toStateRow(undefined)
    expect(s.state).toBe('progress')
    expect(s.skipped).toEqual([])
    expect(s.replied).toBe(false)
  })

  it('nettoie ce qui vient de la base', () => {
    const s = toStateRow({
      opportunite_id: 'o1',
      skipped: ['step:s2', ''],
      skip_reason: 'a répondu',
      state: 'bizarre',
      state_reason: null,
      nurture_at: null,
      replied: null,
      rdv_at: null,
      propo_amount: '1200.50',
      objection: null,
      stage_dates: null,
    })
    expect(s.skipped).toEqual(['step:s2'])
    expect(s.state).toBe('progress') // valeur inconnue → on ne casse pas le rendu
    expect(s.propoAmount).toBe(1200.5)
    expect(s.stageDates).toEqual({})
  })
})

describe('derivePosition', () => {
  it('suit l’étape courante de la séquence', () => {
    expect(derivePosition({ columns, sequence: sequence({ currentStep: 1 }), steps: STEPS, stageId: 1 })).toBe('step:s1')
    expect(derivePosition({ columns, sequence: sequence({ currentStep: 2 }), steps: STEPS, stageId: 1 })).toBe('step:s2')
  })

  it('vaut aussi pour une séquence en pause — la ligne ne bouge pas', () => {
    expect(
      derivePosition({ columns, sequence: sequence({ status: 'paused', currentStep: 2 }), steps: STEPS, stageId: 1 }),
    ).toBe('step:s2')
  })

  it('passe la main au pipeline quand la séquence est finie', () => {
    expect(derivePosition({ columns, sequence: sequence({ status: 'finished' }), steps: STEPS, stageId: 6 })).toBe(
      'stage:6',
    )
  })

  it('sans étape atteinte, la séquence finie dépose la ligne à la reprise', () => {
    expect(derivePosition({ columns, sequence: sequence({ status: 'exited' }), steps: STEPS, stageId: 1 })).toBe(
      'stage:6',
    )
  })

  it('sans séquence, suit l’étape de pipeline de l’opportunité', () => {
    expect(derivePosition({ columns, sequence: null, steps: [], stageId: 7 })).toBe('stage:7')
  })

  it('une étape trop en amont gare la ligne dans le stock à démarcher', () => {
    // « Nouveau lead » n'a pas de colonne (elle est avant la reprise) : le
    // prospect attend d'être mis en séquence.
    expect(derivePosition({ columns, sequence: null, steps: [], stageId: 1 })).toBe(ENTRY_COLUMN_ID)
    expect(derivePosition({ columns, sequence: null, steps: [], stageId: null })).toBe(ENTRY_COLUMN_ID)
  })

  it('ne plante pas sans colonnes', () => {
    expect(derivePosition({ columns: [], sequence: null, steps: [], stageId: 1 })).toBeNull()
  })

  it('ignore une étape de séquence qui n’est plus dans les colonnes affichées', () => {
    // La séquence affichée a changé : l'inscription pointe une étape inconnue.
    const other = sequence({ currentStep: 1 })
    expect(derivePosition({ columns, sequence: other, steps: [{ id: 'autre' }], stageId: 7 })).toBe('stage:7')
  })
})
