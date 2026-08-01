/**
 * @jest-environment node
 */
jest.mock('@/app/api/_lib/service-client', () => ({ getServiceClient: () => ({}) }))
jest.mock('@/app/api/automations/regulator/_view', () => ({ buildRegulatorView: jest.fn() }))

import { deriveReached, toStateRow } from '../_board'
import { EMPTY_STATE, type SalesStateRow } from '@/lib/sales-pipeline/stages'
import type { SalesSequenceInfo } from '../_board'

const state = (over: Partial<SalesStateRow> = {}): SalesStateRow => ({
  ...EMPTY_STATE,
  passed: [],
  skipped: [],
  stageDates: {},
  ...over,
})

const sequence = (over: Partial<SalesSequenceInfo> = {}): SalesSequenceInfo => ({
  enrollmentId: 'e1',
  automationId: 'a1',
  name: 'Artisans',
  status: 'active',
  currentStep: 1,
  totalSteps: 5,
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
    expect(s.reached).toBe('seq')
    expect(s.state).toBe('progress')
    expect(s.passed).toEqual([])
  })

  it('ignore les étapes inconnues plutôt que de casser le rendu', () => {
    const s = toStateRow({
      opportunite_id: 'o1',
      reached: 'nawak',
      passed: ['seq', 'inconnue'],
      skipped: null,
      skip_reason: null,
      state: 'bizarre',
      state_reason: null,
      nurture_at: null,
      replied: null,
      rdv_at: null,
      propo_amount: '1200.50',
      objection: null,
      stage_dates: null,
    })
    expect(s.reached).toBe('seq')
    expect(s.passed).toEqual(['seq'])
    expect(s.state).toBe('progress')
    expect(s.propoAmount).toBe(1200.5)
  })
})

describe('deriveReached', () => {
  it('reste sur la colonne Séquence tant que rien n’est lancé', () => {
    expect(deriveReached(state(), null).reached).toBe('seq')
  })

  it('suit l’étape courante de la séquence', () => {
    expect(deriveReached(state(), sequence({ stepKind: 'email' })).reached).toBe('email')
    expect(deriveReached(state(), sequence({ stepKind: 'whatsapp' })).reached).toBe('wa')
    expect(deriveReached(state(), sequence({ stepKind: 'call' })).reached).toBe('call')
  })

  it('passe la main au commercial quand la séquence est terminée', () => {
    expect(deriveReached(state({ passed: ['seq'] }), sequence({ status: 'finished' })).reached).toBe('rdv')
    expect(deriveReached(state({ passed: ['seq'] }), null).reached).toBe('rdv')
  })

  it('ne renvoie jamais un prospect qui a réagi vers un WhatsApp ou un appel', () => {
    const s = state({ replied: true })
    expect(deriveReached(s, sequence({ stepKind: 'whatsapp' })).reached).toBe('rdv')
    expect(deriveReached(s, sequence({ stepKind: 'call' })).reached).toBe('rdv')
  })

  it('laisse la phase commerciale à l’abri de la séquence', () => {
    // Une séquence de relance qui repart sur un email ne ramène pas une ligne
    // en négociation vers la colonne Email.
    const s = state({ reached: 'nego' })
    expect(deriveReached(s, sequence({ stepKind: 'email' })).reached).toBe('nego')
  })

  it('force la signature sur une affaire gagnée', () => {
    expect(deriveReached(state({ state: 'won', reached: 'propo' }), null).reached).toBe('signe')
  })

  it('gèle la ligne sur son état quand elle est perdue ou en nurturing', () => {
    const lost = state({ state: 'lost', reached: 'call' })
    expect(deriveReached(lost, sequence({ stepKind: 'email' }))).toEqual(lost)
    const nurt = state({ state: 'nurt', reached: 'email' })
    expect(deriveReached(nurt, null)).toEqual(nurt)
  })
})
