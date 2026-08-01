/**
 * @jest-environment node
 */
import {
  EMPTY_STATE,
  SALES_STAGE_IDS,
  cellStatuses,
  hasInterest,
  isPendingTask,
  nextStage,
  stageForStepKind,
  stageIndex,
  type SalesStateRow,
} from '../stages'

const state = (over: Partial<SalesStateRow> = {}): SalesStateRow => ({
  ...EMPTY_STATE,
  passed: [],
  skipped: [],
  stageDates: {},
  ...over,
})

describe('modèle des étapes', () => {
  it('ordonne les huit colonnes de la vente', () => {
    expect(SALES_STAGE_IDS).toEqual(['seq', 'email', 'wa', 'call', 'rdv', 'propo', 'nego', 'signe'])
  })

  it('ne dépasse jamais la dernière étape', () => {
    expect(nextStage('nego')).toBe('signe')
    expect(nextStage('signe')).toBe('signe')
  })

  it('range LinkedIn dans la colonne des messages manuels', () => {
    expect(stageForStepKind('whatsapp')).toBe('wa')
    expect(stageForStepKind('linkedin')).toBe('wa')
    expect(stageForStepKind('call')).toBe('call')
    expect(stageForStepKind('email')).toBe('email')
    expect(stageForStepKind('wait')).toBeNull()
  })
})

describe('cellStatuses', () => {
  it('marque le passé, le présent et le futur', () => {
    const cells = cellStatuses(state({ reached: 'call' }))
    expect(cells.seq).toBe('done')
    expect(cells.email).toBe('done')
    expect(cells.wa).toBe('done')
    expect(cells.call).toBe('active')
    expect(cells.rdv).toBe('locked')
    expect(cells.signe).toBe('locked')
  })

  it('garde une étape franchie « faite » quand la séquence revient en arrière', () => {
    // La séquence repasse par un email après un WhatsApp : la colonne WhatsApp
    // ne doit pas se re-verrouiller — c'est tout l'intérêt du pointeur monotone.
    const cells = cellStatuses(state({ reached: 'email', passed: ['seq', 'email', 'wa'] }))
    expect(cells.email).toBe('active')
    expect(cells.wa).toBe('done')
  })

  it('affiche une étape sautée plutôt que de la faire disparaître', () => {
    const cells = cellStatuses(state({ reached: 'rdv', skipped: ['wa', 'call'], skipReason: 'a pris RDV lui-même' }))
    expect(cells.wa).toBe('skip')
    expect(cells.call).toBe('skip')
    expect(cells.rdv).toBe('active')
  })

  it('porte l’état de la ligne sur la cellule courante', () => {
    expect(cellStatuses(state({ reached: 'call', state: 'lost' })).call).toBe('lost')
    expect(cellStatuses(state({ reached: 'call', state: 'nurt' })).call).toBe('nurt')
    expect(cellStatuses(state({ reached: 'seq', state: 'black' })).seq).toBe('black')
  })

  it('marque toute la ligne comme faite quand c’est signé', () => {
    const cells = cellStatuses(state({ reached: 'signe', state: 'won' }))
    expect(Object.values(cells).every((c) => c === 'done')).toBe(true)
  })
})

describe('tâches en attente', () => {
  it('ne compte que WhatsApp et Appel, et seulement s’ils sont en cours', () => {
    const s = state({ reached: 'wa' })
    expect(isPendingTask(s, 'wa')).toBe(true)
    expect(isPendingTask(s, 'call')).toBe(false)
    expect(isPendingTask(s, 'email')).toBe(false)
  })

  it('disparaît dès que le prospect a réagi — on n’insiste pas', () => {
    const s = state({ reached: 'wa', replied: true })
    expect(hasInterest(s)).toBe(true)
    expect(isPendingTask(s, 'wa')).toBe(false)
  })

  it('ne demande rien sur une ligne close', () => {
    expect(isPendingTask(state({ reached: 'call', state: 'lost' }), 'call')).toBe(false)
  })
})

describe('index des étapes', () => {
  it('rend -1 pour une étape inconnue', () => {
    expect(stageIndex('inconnue')).toBe(-1)
    expect(stageIndex('rdv')).toBe(4)
  })
})
