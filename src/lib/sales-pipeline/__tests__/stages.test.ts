/**
 * @jest-environment node
 */
import {
  EMPTY_STATE,
  buildColumns,
  cellStatuses,
  channelOf,
  defaultHandoffOrdre,
  hasInterest,
  isLostStage,
  isPendingTask,
  parseColumnId,
  stageColumnId,
  stageCta,
  stepColumnId,
  type PipelineStageRef,
  type SalesStateRow,
} from '../stages'
import type { SeqStepKind } from '@/components/automations/types'

/** Les étapes réelles du pipeline « Agent SAMA ». */
const STAGES: PipelineStageRef[] = [
  { id: 1, nom: 'Nouveau lead', ordre: 10 },
  { id: 2, nom: 'Première approche', ordre: 15 },
  { id: 3, nom: 'Contacté (appelé)', ordre: 20 },
  { id: 4, nom: 'En échange', ordre: 30 },
  { id: 5, nom: 'Intéressé', ordre: 40 },
  { id: 6, nom: 'RDV calé', ordre: 50 },
  { id: 7, nom: 'Client signé', ordre: 60 },
  { id: 8, nom: 'Perdu', ordre: 70 },
]

const STEPS = [
  { id: 's1', kind: 'email' as SeqStepKind, day: 0, label: 'Vos clients vous cherchent' },
  { id: 's2', kind: 'whatsapp' as SeqStepKind, day: 1, label: null },
  { id: 's3', kind: 'call' as SeqStepKind, day: 5, label: 'Appel de qualification' },
]

const columnsOf = (over: Partial<Parameters<typeof buildColumns>[0]> = {}) =>
  buildColumns({ steps: STEPS, sequenceName: 'Artisans', stages: STAGES, handoffOrdre: 50, ...over })

const state = (over: Partial<SalesStateRow> = {}): SalesStateRow => ({
  ...EMPTY_STATE,
  skipped: [],
  stageDates: {},
  ...over,
})

describe('identifiants de colonne', () => {
  it('préfixe séquence et pipeline pour qu’on ne les confonde jamais', () => {
    expect(stepColumnId('s1')).toBe('step:s1')
    expect(stageColumnId(6)).toBe('stage:6')
    expect(parseColumnId('step:s1')).toEqual({ group: 'sequence', ref: 's1' })
    expect(parseColumnId('stage:6')).toEqual({ group: 'pipeline', ref: '6' })
  })

  it('rejette ce qui n’est pas un identifiant de colonne', () => {
    expect(parseColumnId('rdv')).toBeNull()
    expect(parseColumnId('step:')).toBeNull()
    expect(parseColumnId('autre:1')).toBeNull()
  })
})

describe('buildColumns', () => {
  it('met la séquence à gauche, le pipeline à droite', () => {
    const columns = columnsOf()
    expect(columns.map((c) => c.id)).toEqual(['step:s1', 'step:s2', 'step:s3', 'stage:6', 'stage:7'])
    expect(columns.slice(0, 3).every((c) => c.group === 'sequence')).toBe(true)
    expect(columns.slice(3).every((c) => c.group === 'pipeline')).toBe(true)
  })

  it('numérote les colonnes dans l’ordre — c’est le pointeur monotone', () => {
    expect(columnsOf().map((c) => c.index)).toEqual([0, 1, 2, 3, 4])
  })

  it('n’affiche que les étapes à partir de la reprise', () => {
    const columns = columnsOf({ handoffOrdre: 30 })
    const stages = columns.filter((c) => c.group === 'pipeline').map((c) => c.label)
    expect(stages).toEqual(['En échange', 'Intéressé', 'RDV calé', 'Client signé'])
  })

  it('exclut « Perdu » : c’est un état de ligne, pas une colonne', () => {
    expect(columnsOf({ handoffOrdre: 0 }).some((c) => c.label === 'Perdu')).toBe(false)
  })

  it('reprend le libellé de l’étape, sinon le nom du canal', () => {
    const columns = columnsOf()
    expect(columns[0].label).toBe('Vos clients vous cherchent')
    expect(columns[1].label).toBe('WhatsApp')
  })

  it('affiche le jour de chaque étape de séquence', () => {
    expect(columnsOf().map((c) => c.hint)).toEqual(['immédiat', 'J+1', 'J+5', null, null])
  })

  it('marque l’email comme automatique et le reste comme manuel', () => {
    const columns = columnsOf()
    expect(columns[0].mode).toBe('auto')
    expect(columns[1].mode).toBe('manual')
    expect(columns[2].mode).toBe('manual')
    expect(columns[3].mode).toBe('deal')
  })

  it('tient debout sans séquence', () => {
    const columns = columnsOf({ steps: [] })
    expect(columns.every((c) => c.group === 'pipeline')).toBe(true)
    expect(columns).toHaveLength(2)
  })
})

describe('étape de reprise par défaut', () => {
  it('choisit l’étape de rendez-vous', () => {
    expect(defaultHandoffOrdre(STAGES)).toBe(50)
  })

  it('à défaut, prend l’étape qui suit l’entrée de la séquence', () => {
    const sansRdv = STAGES.filter((s) => !/rdv/i.test(s.nom))
    expect(defaultHandoffOrdre(sansRdv, 3)).toBe(30) // après « Contacté (appelé) »
  })

  it('à défaut, coupe le pipeline en deux', () => {
    const sansRdv = STAGES.filter((s) => !/rdv/i.test(s.nom))
    expect(defaultHandoffOrdre(sansRdv, null)).toBeGreaterThan(10)
  })

  it('ne plante pas sur un pipeline vide', () => {
    expect(defaultHandoffOrdre([])).toBe(0)
  })
})

describe('cellStatuses', () => {
  const columns = columnsOf()

  it('marque le passé, le présent et le futur', () => {
    const cells = cellStatuses(columns, 'step:s3', state())
    expect(cells['step:s1']).toBe('done')
    expect(cells['step:s2']).toBe('done')
    expect(cells['step:s3']).toBe('active')
    expect(cells['stage:6']).toBe('locked')
  })

  it('passe la main au pipeline sans rien oublier derrière', () => {
    const cells = cellStatuses(columns, 'stage:6', state())
    expect(cells['step:s3']).toBe('done')
    expect(cells['stage:6']).toBe('active')
    expect(cells['stage:7']).toBe('locked')
  })

  it('affiche une étape sautée plutôt que de la faire disparaître', () => {
    const cells = cellStatuses(columns, 'stage:6', state({ skipped: ['step:s2', 'step:s3'] }))
    expect(cells['step:s2']).toBe('skip')
    expect(cells['step:s3']).toBe('skip')
  })

  it('porte l’état de la ligne sur la cellule courante', () => {
    expect(cellStatuses(columns, 'step:s3', state({ state: 'lost' }))['step:s3']).toBe('lost')
    expect(cellStatuses(columns, 'step:s3', state({ state: 'nurt' }))['step:s3']).toBe('nurt')
    expect(cellStatuses(columns, 'step:s1', state({ state: 'black' }))['step:s1']).toBe('black')
  })

  it('marque toute la ligne comme faite quand c’est signé', () => {
    const cells = cellStatuses(columns, 'stage:7', state({ state: 'won' }))
    expect(Object.values(cells).every((c) => c === 'done')).toBe(true)
  })

  it('retombe sur la première colonne quand la position est inconnue', () => {
    expect(cellStatuses(columns, null, state())['step:s1']).toBe('active')
    expect(cellStatuses(columns, 'step:disparue', state())['step:s1']).toBe('active')
  })
})

describe('tâches en attente', () => {
  const columns = columnsOf()

  it('ne compte que les colonnes manuelles, et seulement si elles sont en cours', () => {
    const s = state()
    expect(isPendingTask(columns, 'step:s2', s, 'step:s2')).toBe(true)
    expect(isPendingTask(columns, 'step:s2', s, 'step:s3')).toBe(false)
    expect(isPendingTask(columns, 'step:s1', s, 'step:s1')).toBe(false) // email = auto
    expect(isPendingTask(columns, 'stage:6', s, 'stage:6')).toBe(false) // deal
  })

  it('disparaît dès que le prospect a réagi — on n’insiste pas', () => {
    const s = state({ replied: true })
    expect(hasInterest(s)).toBe(true)
    expect(isPendingTask(columns, 'step:s2', s, 'step:s2')).toBe(false)
  })

  it('ne demande rien sur une ligne close', () => {
    expect(isPendingTask(columns, 'step:s2', state({ state: 'lost' }), 'step:s2')).toBe(false)
  })
})

describe('divers', () => {
  it('reconnaît une étape « perdu »', () => {
    expect(isLostStage('Perdu')).toBe(true)
    expect(isLostStage('Abandonné')).toBe(true)
    expect(isLostStage('RDV calé')).toBe(false)
  })

  it('devine le bon bouton pour une étape de pipeline', () => {
    expect(stageCta('RDV calé')).toBe('Caler le RDV')
    expect(stageCta('Devis envoyé')).toBe('Envoyer la proposition')
    expect(stageCta('Client signé')).toBe('Marquer comme signé')
  })

  it('rend un canal connu, et un repli pour l’inconnu', () => {
    expect(channelOf('whatsapp').label).toBe('WhatsApp')
    expect(channelOf('inconnu').label).toBe('Tâche')
    expect(channelOf(null).label).toBe('Tâche')
  })
})
