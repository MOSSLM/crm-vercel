import {
  CHAMPS_INSCRIPTION,
  CHAMPS_TACHE,
  libelleGeste,
  photographier,
  resumeAnnulation,
  verdictAnnulation,
  type ContexteAnnulation,
} from '../annulation'

const CONTEXTE: ContexteAnnulation = {
  dejaAnnule: false,
  tacheAbsente: false,
  gestePlusRecent: null,
  envoisDepuis: 0,
}

describe('verdictAnnulation', () => {
  it('autorise quand rien n’a bougé depuis', () => {
    const v = verdictAnnulation(CONTEXTE)
    expect(v.possible).toBe(true)
    expect(v.motif).toMatch(/exact/)
  })

  it('refuse un geste déjà annulé', () => {
    expect(verdictAnnulation({ ...CONTEXTE, dejaAnnule: true }).possible).toBe(false)
  })

  it('refuse si la tâche a disparu', () => {
    const v = verdictAnnulation({ ...CONTEXTE, tacheAbsente: true })
    expect(v.possible).toBe(false)
    expect(v.motif).toMatch(/supprimée/)
  })

  it('refuse d’annuler autre chose que le dernier geste, et dit lequel', () => {
    // On dépile : restaurer celui du dessous écraserait ce que celui du dessus
    // a écrit, et l'inscription se retrouverait dans un état jamais vécu.
    const v = verdictAnnulation({
      ...CONTEXTE,
      gestePlusRecent: { geste: 'terminer', le: '2026-08-22T10:00:00.000Z' },
    })
    expect(v.possible).toBe(false)
    expect(v.motif).toContain('terminée')
    expect(v.motif).toContain('22/08')
  })

  it('refuse quand un message est parti depuis — et le dit au singulier', () => {
    const v = verdictAnnulation({ ...CONTEXTE, envoisDepuis: 1 })
    expect(v.possible).toBe(false)
    expect(v.motif).toContain('1 message est parti')
    expect(v.motif).not.toContain('sont partis')
  })

  it('accorde le pluriel quand il y en a plusieurs', () => {
    expect(verdictAnnulation({ ...CONTEXTE, envoisDepuis: 3 }).motif).toContain('3 messages sont partis')
  })

  it('annonce le geste plus récent AVANT l’envoi : c’est l’ordre de ce qu’ils apprennent', () => {
    // Un geste postérieur rend l'annulation impossible quoi qu'il arrive ; le
    // dire d'abord évite d'annoncer une mauvaise nouvelle inutile.
    const v = verdictAnnulation({
      ...CONTEXTE,
      gestePlusRecent: { geste: 'ignorer', le: '2026-08-22T10:00:00.000Z' },
      envoisDepuis: 2,
    })
    expect(v.motif).toContain('ignorée')
    expect(v.motif).not.toContain('messages sont partis')
  })
})

describe('photographier', () => {
  it('ne garde que les colonnes qu’on sait reposer', () => {
    const photo = photographier(
      { id: 'x', status: 'pending', done_at: null, due_at: 'hier', payload: { a: 1 }, updated_at: 'maintenant' },
      CHAMPS_TACHE,
    )
    expect(Object.keys(photo!).sort()).toEqual([...CHAMPS_TACHE].sort())
    // `id` et `updated_at` sont exclus exprès : les reposer ferait bagarrer le
    // déclencheur d'horodatage avec nous.
    expect(photo).not.toHaveProperty('updated_at')
  })

  it('remplace une colonne absente par null plutôt que de l’oublier', () => {
    const photo = photographier({ status: 'done' }, CHAMPS_TACHE)
    expect(photo).toEqual({ status: 'done', done_at: null, due_at: null, payload: null })
  })

  it('rend null sur une ligne absente — une inscription peut ne pas exister', () => {
    expect(photographier(null, CHAMPS_INSCRIPTION)).toBeNull()
  })
})

describe('resumeAnnulation', () => {
  it('dit tout ce qui va être reposé', () => {
    const texte = resumeAnnulation({
      tache: { status: 'pending' },
      inscription: { current_step: 2 },
      premiereTouchePosee: true,
      stageId: 7,
    })
    expect(texte).toContain('« pending »')
    // L'étape est affichée en base 1 : l'humain compte à partir de 1.
    expect(texte).toContain('étape 3')
    expect(texte).toContain('premier contact')
    expect(texte).toContain('affaire')
  })

  it('reste lisible quand il n’y a qu’une tâche', () => {
    const texte = resumeAnnulation({
      tache: { status: 'pending' },
      inscription: null,
      premiereTouchePosee: false,
      stageId: null,
    })
    expect(texte).toBe('la tâche redevient « pending »')
  })
})

describe('libelleGeste', () => {
  it('accorde au féminin, parce qu’on parle d’une tâche', () => {
    expect(libelleGeste('terminer')).toBe('terminée')
    expect(libelleGeste('ignorer')).toBe('ignorée')
    expect(libelleGeste('reporter')).toBe('reportée')
  })
})
