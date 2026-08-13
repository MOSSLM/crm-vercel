/**
 * La vue « tous pipelines confondus ».
 *
 * Une affaire reste dans le pipeline où elle est née : regarder « Streak
 * Mars/Avril » cachait donc purement et simplement les prospects d'« Agent
 * SAMA », et deux prospects au même stade dans deux pipelines ne se voyaient
 * jamais côte à côte. Les colonnes de droite deviennent des RÔLES — « RDV calé »
 * est la même chose partout, `stageRole` sait déjà le dire.
 */
import {
  buildColumns,
  colonneDeLEtape,
  isRoleColumn,
  parseColumnId,
  roleColumnId,
  type PipelineStageRef,
} from '../stages'

/** Deux pipelines qui nomment les mêmes phases différemment. */
const STAGES: PipelineStageRef[] = [
  { id: 1, nom: 'Nouveau lead', ordre: 1 },
  { id: 2, nom: 'Première approche', ordre: 2 },
  { id: 3, nom: 'RDV calé', ordre: 3 },
  { id: 4, nom: 'Client signé', ordre: 4 },
  { id: 5, nom: 'Perdu', ordre: 5 },
  // Pipeline « Streak » : mêmes phases, autres mots, autres identifiants.
  { id: 40, nom: 'Rendez-vous de vente', ordre: 2 },
  { id: 41, nom: 'Signature', ordre: 3 },
  { id: 42, nom: 'Abandonné', ordre: 4 },
]

const colonnes = (parRole: boolean) =>
  buildColumns({ steps: [], sequenceName: null, stages: STAGES, handoffOrdre: 0, parRole })

describe('colonnes par rôle', () => {
  it('fond les étapes équivalentes de deux pipelines en une seule colonne', () => {
    const ids = colonnes(true)
      .filter((c) => c.group === 'pipeline')
      .map((c) => c.id)

    // « RDV calé » et « Rendez-vous de vente » ne font qu'une colonne ; idem
    // pour « Client signé » et « Signature ».
    expect(ids).toEqual([
      roleColumnId('nouveau'),
      roleColumnId('approche'),
      roleColumnId('rdv'),
      roleColumnId('signe'),
    ])
  })

  it('laisse « Perdu » hors du tableau, comme en vue simple', () => {
    const labels = colonnes(true).map((c) => c.label)

    expect(labels).not.toContain('Perdu')
    expect(labels).not.toContain('Abandonné')
  })

  it('n’affiche que les phases réellement présentes dans le parc', () => {
    const ids = buildColumns({
      steps: [],
      sequenceName: null,
      stages: [{ id: 1, nom: 'RDV calé', ordre: 1 }],
      handoffOrdre: 0,
      parRole: true,
    })
      .filter((c) => c.group === 'pipeline')
      .map((c) => c.id)

    // Une colonne « Proposition » vide sur tout le parc n'apprendrait rien.
    expect(ids).toEqual([roleColumnId('rdv')])
  })

  it('garde les étapes nommées quand on regarde UN pipeline', () => {
    const ids = colonnes(false)
      .filter((c) => c.group === 'pipeline')
      .map((c) => c.id)

    expect(ids).toContain('stage:3')
    expect(ids.every((id) => !isRoleColumn(id))).toBe(true)
  })
})

describe('colonneDeLEtape', () => {
  it('range chaque étape sous le rôle qu’elle porte, quel que soit son pipeline', () => {
    expect(colonneDeLEtape(3, STAGES, true)).toBe(roleColumnId('rdv'))
    expect(colonneDeLEtape(40, STAGES, true)).toBe(roleColumnId('rdv'))
    expect(colonneDeLEtape(4, STAGES, true)).toBe(roleColumnId('signe'))
    expect(colonneDeLEtape(41, STAGES, true)).toBe(roleColumnId('signe'))
  })

  it('garde l’étape elle-même en vue simple', () => {
    expect(colonneDeLEtape(3, STAGES, false)).toBe('stage:3')
  })

  it('ne range nulle part une affaire sans étape, ou sur une étape inconnue', () => {
    expect(colonneDeLEtape(null, STAGES, true)).toBeNull()
    expect(colonneDeLEtape(999, STAGES, true)).toBeNull()
  })
})

describe('parseColumnId', () => {
  it('reconnaît une colonne de rôle comme une phase commerciale', () => {
    // C'est ce qui permet à `advanceStage` de la traiter comme une étape de
    // pipeline, puis de la résoudre dans le pipeline de l'affaire.
    expect(parseColumnId(roleColumnId('rdv'))).toEqual({ group: 'pipeline', ref: 'rdv' })
    expect(parseColumnId('stage:7')).toEqual({ group: 'pipeline', ref: '7' })
  })

  it('distingue les deux formes', () => {
    expect(isRoleColumn(roleColumnId('signe'))).toBe(true)
    expect(isRoleColumn('stage:7')).toBe(false)
  })
})
