/**
 * L'attente-réponse a sa colonne.
 *
 * Avant : toutes les attentes étaient exclues des colonnes. Un prospect garé
 * après son accroche WhatsApp restait donc affiché sous le message DÉJÀ envoyé,
 * avec un bouton « Étape faite » qui ne faisait rien — la séquence attendait une
 * réponse — et sans aucun endroit pour dire que la réponse était arrivée. On
 * croyait à une panne.
 *
 * Après : une attente-RÉPONSE a sa colonne, celle où l'on note ce que le
 * prospect a dit. Une attente de délai pur n'en a toujours pas : elle s'écoule
 * seule, il n'y a rien à y décider.
 */
import { buildColumns, estColonneVisible, stepColumnId, type SequenceStepRef } from '../stages'
import { visibleStepPosition } from '@/app/api/sales-pipeline/_board'

const etape = (id: string, kind: SequenceStepRef['kind'], extra: Partial<SequenceStepRef> = {}) =>
  ({ id, kind, day: 0, label: null, ...extra }) as SequenceStepRef

/** accroche WhatsApp · attente-réponse (relance à J+3) · appel · délai · e-mail */
const STEPS: SequenceStepRef[] = [
  etape('s1', 'whatsapp'),
  etape('s2', 'wait', { waitMode: 'reply', replyTimeoutDays: 3 }),
  etape('s3', 'call'),
  etape('s4', 'wait', { waitMode: 'days' }),
  etape('s5', 'email'),
]

describe('estColonneVisible', () => {
  it('donne une colonne à une attente-réponse, pas à un délai', () => {
    expect(estColonneVisible({ kind: 'wait', waitMode: 'reply' })).toBe(true)
    expect(estColonneVisible({ kind: 'wait', waitMode: 'days' })).toBe(false)
    // Sans `waitMode`, c'est un délai : rien à décider.
    expect(estColonneVisible({ kind: 'wait' })).toBe(false)
  })

  it('laisse passer tous les canaux', () => {
    for (const kind of ['whatsapp', 'call', 'email', 'linkedin', 'task']) {
      expect(estColonneVisible({ kind })).toBe(true)
    }
  })
})

describe('la colonne d’attente', () => {
  const colonnes = buildColumns({
    steps: STEPS.filter(estColonneVisible),
    sequenceName: 'Test',
    stages: [],
    handoffOrdre: 0,
  })
  const attente = colonnes.find((c) => c.id === stepColumnId('s2'))

  it('existe entre le message et ce qui suit', () => {
    expect(colonnes.map((c) => c.id)).toEqual([
      'entry:start',
      stepColumnId('s1'),
      stepColumnId('s2'),
      stepColumnId('s3'),
      stepColumnId('s5'),
    ])
  })

  it('annonce le délai de relance automatique — le chiffre qui décide', () => {
    expect(attente).toMatchObject({ kind: 'wait', hint: 'relance auto à J+3' })
  })

  it('dit « jusqu’à réponse » quand rien ne relance tout seul', () => {
    const sans = buildColumns({
      steps: [etape('w', 'wait', { waitMode: 'reply' })],
      sequenceName: null,
      stages: [],
      handoffOrdre: 0,
    })
    expect(sans.find((c) => c.kind === 'wait')?.hint).toBe('jusqu’à réponse')
  })

  it('appelle à noter la réponse, pas à valider une étape', () => {
    // Rien ne part d'une attente : « Étape faite » y promettait un avancement
    // qui n'arrivait jamais.
    expect(attente?.cta).toBe('Noter la réponse')
    expect(attente?.mode).toBe('manual')
  })
})

describe('visibleStepPosition', () => {
  // `current_step` compte TOUTES les étapes, attentes comprises ; les colonnes
  // n'en comptent qu'une partie. Les deux numérotations doivent rester
  // d'accord, sinon la ligne se décale d'un cran par attente franchie.
  it('range la ligne sur la colonne d’attente quand la séquence y est garée', () => {
    // index 1 = l'attente-réponse : 2ᵉ colonne d'étape.
    expect(visibleStepPosition(STEPS, 1)).toBe(2)
  })

  it('ne compte pas les délais purs', () => {
    // index 3 = le délai `days` ; on reste sur l'appel, la 3ᵉ colonne.
    expect(visibleStepPosition(STEPS, 3)).toBe(3)
    // index 4 = l'e-mail, 4ᵉ colonne.
    expect(visibleStepPosition(STEPS, 4)).toBe(4)
  })

  it('reste à zéro avant la première étape', () => {
    expect(visibleStepPosition(STEPS, -1)).toBe(0)
  })
})
