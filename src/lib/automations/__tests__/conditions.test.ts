import {
  CONDITIONS_ECARTEES,
  effectifPlancher,
  evaluerCondition,
  issueDeLaCondition,
  libelleCondition,
  operateursDe,
  raisonDeRefus,
  type Condition,
  type FaitsProspect,
} from '../conditions'

/**
 * LES CONDITIONS, ET LA SEULE CHOSE QU'IL FAUT RETENIR :
 * il y a TROIS réponses, pas deux. `oui`, `non`, et `non_mesure`.
 * Un « non » mesuré et un « non » faute de données ne sont pas la même chose —
 * c'est la règle qui gouverne tout ce CRM, et c'est ici qu'elle décide du sort
 * d'un prospect.
 */

const c = (p: Partial<Condition>): Condition =>
  ({ champ: 'a_email', operateur: 'vrai', ...p }) as Condition

describe('les trois réponses', () => {
  it('tranche quand le fait est là', () => {
    expect(evaluerCondition(c({ champ: 'a_email', operateur: 'vrai' }), { aEmail: true })).toBe('oui')
    expect(evaluerCondition(c({ champ: 'a_email', operateur: 'vrai' }), { aEmail: false })).toBe('non')
  })

  it('distingue « pas allé chercher » de « il n’y en a pas »', () => {
    // `undefined` = lecture jamais faite. `false` = on a regardé, il n'y a rien.
    // Les deux ne peuvent pas rendre la même chose, sinon on ne saura jamais si
    // une voie a été prise pour une raison ou par défaut.
    expect(evaluerCondition(c({ champ: 'a_email', operateur: 'vrai' }), {})).toBe('non_mesure')
    expect(evaluerCondition(c({ champ: 'a_email', operateur: 'vrai' }), { aEmail: false })).toBe('non')
  })

  it('refuse de trancher sur une condition incohérente', () => {
    // Une définition à moitié éditée ne décide pas du sort d'un prospect.
    expect(evaluerCondition(c({ champ: 'cohorte', operateur: 'vrai' }), { cohorte: 'A_site_faible' }))
      .toBe('non_mesure')
    expect(evaluerCondition(c({ champ: 'cohorte', operateur: 'est', valeurs: [] }), { cohorte: 'A_site_faible' }))
      .toBe('non_mesure')
    expect(evaluerCondition(c({ champ: 'ca', operateur: 'au_moins' }), { ca: 100_000 }))
      .toBe('non_mesure')
  })
})

describe('la présence web, à trois états', () => {
  const test = (etat: FaitsProspect['presenceWeb']) =>
    evaluerCondition(c({ champ: 'presence_web', operateur: 'est', valeurs: ['absent'] }), { presenceWeb: etat })

  it('« absent confirmé » et « on n’a pas pu savoir » sont deux valeurs MESURÉES', () => {
    expect(test('absent')).toBe('oui')
    expect(test('inconnu')).toBe('non')
    expect(test('present')).toBe('non')
    // Aucun constat du tout, en revanche : on n'a jamais regardé.
    expect(test(null)).toBe('non_mesure')
  })

  it('sait interroger « on n’a pas pu savoir » comme une valeur à part entière', () => {
    expect(
      evaluerCondition(
        c({ champ: 'presence_web', operateur: 'est', valeurs: ['inconnu'] }),
        { presenceWeb: 'inconnu' },
      ),
    ).toBe('oui')
  })

  it('plusieurs valeurs dans une condition, c’est un OU', () => {
    const cond = c({ champ: 'presence_web', operateur: 'est', valeurs: ['absent', 'inconnu'] })
    expect(evaluerCondition(cond, { presenceWeb: 'absent' })).toBe('oui')
    expect(evaluerCondition(cond, { presenceWeb: 'inconnu' })).toBe('oui')
    expect(evaluerCondition(cond, { presenceWeb: 'present' })).toBe('non')
  })
})

describe('l’effectif est un CODE INSEE, pas un nombre', () => {
  it('ramène la tranche à son plancher', () => {
    expect(effectifPlancher('00')).toBe(0)
    expect(effectifPlancher('01')).toBe(1)
    expect(effectifPlancher('11')).toBe(10)
    expect(effectifPlancher('53')).toBe(10_000)
  })

  it('NN N’EST PAS ZÉRO', () => {
    // 672 des 2 884 lignes renseignées portent NN — près d'un quart. Le traiter
    // comme zéro ferait passer un quart du fichier pour des entreprises sans
    // salarié, et « au plus 2 » les ramasserait toutes.
    expect(effectifPlancher('NN')).toBeNull()
    expect(effectifPlancher(null)).toBeNull()
    expect(effectifPlancher('  ')).toBeNull()
    // `00`, lui, est un vrai zéro mesuré : l'entreprise n'emploie personne.
    expect(effectifPlancher('00')).toBe(0)
  })

  it('un effectif inconnu ne répond pas « non » à un seuil', () => {
    const cond = c({ champ: 'effectif', operateur: 'au_plus', seuil: 2 })
    expect(evaluerCondition(cond, { effectif: effectifPlancher('01') })).toBe('oui')
    expect(evaluerCondition(cond, { effectif: effectifPlancher('11') })).toBe('non')
    expect(evaluerCondition(cond, { effectif: effectifPlancher('NN') })).toBe('non_mesure')
  })

  it('ne confond pas Number(null) avec zéro', () => {
    // `Number(null)` vaut ZÉRO, pas NaN — le piège est déjà payé ailleurs dans
    // ce CRM. Un CA absent ne doit pas satisfaire « au plus 1000 ».
    expect(evaluerCondition(c({ champ: 'ca', operateur: 'au_plus', seuil: 1000 }), { ca: null }))
      .toBe('non_mesure')
    expect(evaluerCondition(c({ champ: 'ca', operateur: 'au_plus', seuil: 1000 }), { ca: 0 }))
      .toBe('oui')
  })
})

describe('où va-t-on quand on ne sait pas', () => {
  const cond = (siInconnu?: 'oui' | 'non') =>
    c({ champ: 'audit_pret', operateur: 'vrai', siInconnu })

  it('par défaut : la voie NON, et le verdict reste honnête', () => {
    const r = issueDeLaCondition(cond(), {})
    expect(r.oui).toBe(false)
    // Le verdict n'est PAS « non » : c'est ce qui permettra de compter combien
    // de prospects sont partis dans une voie qu'on a devinée.
    expect(r.verdict).toBe('non_mesure')
  })

  it('se règle sans jamais salir le verdict', () => {
    const r = issueDeLaCondition(cond('oui'), {})
    expect(r.oui).toBe(true)
    expect(r.verdict).toBe('non_mesure')
  })

  it('ne s’applique JAMAIS à une condition qu’on a su évaluer', () => {
    expect(issueDeLaCondition(cond('oui'), { auditPret: false })).toEqual({ verdict: 'non', oui: false })
    expect(issueDeLaCondition(cond('non'), { auditPret: true })).toEqual({ verdict: 'oui', oui: true })
  })
})

describe('ce que l’éditeur doit savoir', () => {
  it('ne propose que les opérateurs qui vont avec le champ', () => {
    expect(operateursDe('a_email')).toEqual(['vrai', 'faux'])
    expect(operateursDe('cohorte')).toEqual(['est', 'nest_pas'])
    expect(operateursDe('ca')).toEqual(['au_moins', 'au_plus'])
  })

  it('refuse en français ce qui ne s’écrira pas', () => {
    expect(raisonDeRefus({})).toBe('Choisir ce qu’on teste.')
    expect(raisonDeRefus({ champ: 'cohorte', operateur: 'vrai' })).toMatch(/ne se teste pas/)
    expect(raisonDeRefus({ champ: 'cohorte', operateur: 'est', valeurs: ['  '] })).toMatch(/au moins une valeur/)
    expect(raisonDeRefus({ champ: 'ca', operateur: 'au_moins' })).toMatch(/seuil/)
    expect(raisonDeRefus({ champ: 'ca', operateur: 'au_moins', seuil: 0 })).toBeNull()
  })

  it('écrit la condition en français sur le nœud', () => {
    expect(libelleCondition({ champ: 'audit_pret', operateur: 'vrai' })).toBe('L’audit est prêt')
    expect(libelleCondition({ champ: 'presence_web', operateur: 'est', valeurs: ['absent'] }))
      .toBe('Présence web : Pas de site (confirmé)')
    expect(libelleCondition({ champ: 'cohorte', operateur: 'nest_pas', valeurs: ['A_site_faible'] }))
      .toBe('Cohorte : ni A · site faible')
    expect(libelleCondition({ champ: 'ca', operateur: 'au_moins', seuil: 200000 })).toBe('Chiffre d’affaires ≥ 200000')
    expect(libelleCondition({})).toBe('Condition à écrire')
  })

  it('dit ce qu’on écarte, plutôt que de le cacher', () => {
    const noms = CONDITIONS_ECARTEES.map((x) => x.nom)
    expect(noms).toContain('A ouvert / a cliqué')
    expect(noms).toContain('Désabonné')
    expect(noms).toContain('Has score')
    // Chaque refus porte sa raison : un éditeur qui propose treize conditions
    // dont quatre ne marchent pas est pire qu'un qui en propose neuf.
    expect(CONDITIONS_ECARTEES.every((x) => x.pourquoi.length > 20)).toBe(true)
  })
})
