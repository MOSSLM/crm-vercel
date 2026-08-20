/**
 * Ce qui se vérifie ici, c'est le critère du registre des bots, mot pour mot :
 * « il faut adresse + code postal + nom + métier concordants ; trois sur quatre
 * ne suffisent pas ». Un module qui rendrait `lesQuatre: true` à trois critères
 * autoriserait exactement l'écriture que la règle interdit.
 */
import {
  ECART_SERRE,
  SEUILS,
  alertes,
  baremeDe,
  concordance,
  fichesAChoisir,
  identiteEvidente,
  libelleAdresse,
  nomCompareA,
  resumeDeLaFile,
  type CandidatSiret,
  type FicheDuParc,
} from '../choix-siret'

const candidat = (over: Partial<CandidatSiret> = {}): CandidatSiret => ({
  id: 'c1',
  entrepriseId: 1,
  siret: '12345678900012',
  denomination: 'TOP CLIMATISATION',
  enseignes: ['CLIMIZ'],
  adresse: '12 rue des Lilas',
  codePostal: '21000',
  ville: 'Dijon',
  etatAdministratif: 'A',
  nafCode: '43.22A',
  score: 90,
  detail: { nom: 40, codePostal: 25, ville: 15, activite: 10, etat: 5, alertes: [] },
  ...over,
})

const fiche = (over: Partial<FicheDuParc> = {}): FicheDuParc => ({
  entrepriseId: 1,
  nom: 'CLIMIZ',
  ville: 'Dijon',
  codePostal: '21000',
  ...over,
})

describe('concordance — les quatre critères du registre', () => {
  it('les quatre concordent quand les quatre sont au seuil', () => {
  const c = concordance({
      nom: SEUILS['score-ts'].nom,
      codePostal: 25,
      ville: SEUILS['score-ts'].adresse,
      activite: 10,
    })
    expect(c).toMatchObject({ nom: true, codePostal: true, adresse: true, metier: true })
    expect(c.compte).toBe(4)
    expect(c.lesQuatre).toBe(true)
  })

  it('trois sur quatre ne suffisent pas — c’est la règle, pas une préférence', () => {
    const c = concordance({ nom: 45, codePostal: 25, ville: 15, activite: 0 })
    expect(c.compte).toBe(3)
    expect(c.lesQuatre).toBe(false)
  })

  it('le MÊME DÉPARTEMENT n’est pas une concordance de code postal', () => {
    // `score.ts` accorde 10 points sur 25 au même département : c'est un
    // encouragement à regarder, pas une adresse commune. Deux communes d'un
    // même département sont deux adresses — et c'est exactement le cas qui
    // ressemble le plus à un bon candidat sans en être un.
    const c = concordance({ nom: 45, codePostal: 10, ville: 15, activite: 10 })
    expect(c.codePostal).toBe(false)
    expect(c.compte).toBe(3)
  })

  it('un détail absent ne concorde sur rien plutôt que sur tout', () => {
    // Les 506 lignes en attente ont été notées par plusieurs générations du
    // module : un `score_detail` nul doit valoir « on ne sait pas », jamais
    // « tout va bien ».
    const c = concordance(null)
    expect(c.compte).toBe(0)
    expect(c.lesQuatre).toBe(false)
  })
})

describe('les DEUX barèmes de la base — 48 candidats sur 54 sont au format proeco', () => {
  /**
   * Le détail relevé en base le 20/08 sur « AVIZ'ENERGIE », candidat à 100/100
   * que l'écran affichait « 1/4 critères ». C'est le témoin de la régression :
   * il est recopié tel quel, sans être arrondi ni simplifié.
   */
  const AVIZ_ENERGIE = {
    nom: 25,
    etat: 5,
    adresse: 45,
    activite: 10,
    codePostal: 20,
    niveau_adresse: 'exacte',
    nom_compare_a: "raison sociale : AVIZ'ENERGIE",
    alertes: [],
  }

  it('reconnaît le barème à ses clés propres', () => {
    expect(baremeDe(AVIZ_ENERGIE)).toBe('proeco')
    expect(baremeDe({ nom: 45, ville: 15 })).toBe('score-ts')
    expect(baremeDe(null)).toBe('score-ts')
  })

  it('rend ses quatre critères à un candidat parfait du barème proeco', () => {
    // AVANT LA CORRECTION : 1/4. Le seuil « nom ≥ 36 » appliqué à un barème qui
    // plafonne le nom à 25 rejetait TOUS ses candidats, même parfaits — et
    // l'écran poussait à écarter le meilleur de la file.
    const c = concordance(AVIZ_ENERGIE)
    expect(c.compte).toBe(4)
    expect(c.lesQuatre).toBe(true)
    expect(c.bareme).toBe('proeco')
  })

  it('lit `adresse` et non `ville` sur le barème proeco', () => {
    // Lire la mauvaise colonne rend 0 et fait échouer le critère EN SILENCE :
    // rien à l'écran ne dirait qu'on a regardé au mauvais endroit.
    expect(concordance({ ...AVIZ_ENERGIE, adresse: 20, niveau_adresse: 'voie' }).adresse).toBe(false)
    expect(concordance({ ...AVIZ_ENERGIE, adresse: 0, niveau_adresse: 'non' }).adresse).toBe(false)
  })

  it('tient le code postal à l’égalité stricte dans les deux barèmes', () => {
    // 7 sur 20 chez proeco = même département, exactement comme 10 sur 25 chez
    // `score.ts`. Un encouragement à regarder, jamais une concordance.
    expect(concordance({ ...AVIZ_ENERGIE, codePostal: 7 }).codePostal).toBe(false)
    expect(concordance({ nom: 45, codePostal: 10, ville: 15, activite: 10 }).codePostal).toBe(false)
  })

  it('dit à quoi l’adresse a été comparée, au lieu de le laisser supposer', () => {
    expect(libelleAdresse(AVIZ_ENERGIE)).toBe('adresse exacte')
    expect(libelleAdresse({ ...AVIZ_ENERGIE, niveau_adresse: 'voie' })).toBe('même voie')
    expect(libelleAdresse({ nom: 45, ville: 15 })).toBe('commune')
  })

  it('lit le nom comparé quelle que soit la casse de la clé', () => {
    expect(nomCompareA(AVIZ_ENERGIE)).toBe("raison sociale : AVIZ'ENERGIE")
    expect(nomCompareA({ nomCompareA: 'enseigne : CLIMIZ' })).toBe('enseigne : CLIMIZ')
    expect(nomCompareA(null)).toBeNull()
  })
})

describe('alertes', () => {
  it('reprend celles du score', () => {
    expect(alertes(candidat({ detail: { alertes: ['Activité inattendue : NAF 49.32Z'] } }))).toEqual([
      'Activité inattendue : NAF 49.32Z',
    ])
  })

  it('rattrape une cessation que le score n’avait pas signalée', () => {
    const a = alertes(candidat({ etatAdministratif: 'C', detail: { alertes: [] } }))
    expect(a).toEqual(['Entreprise CESSÉE au registre'])
  })

  it('ne la dit pas deux fois quand le score l’a déjà dite', () => {
    const a = alertes(
      candidat({ etatAdministratif: 'C', detail: { alertes: ['Entreprise CESSÉE le 2024-03-01'] } }),
    )
    expect(a).toHaveLength(1)
  })
})

describe('fichesAChoisir', () => {
  it('groupe par fiche et met le meilleur candidat en tête', () => {
    const f = fichesAChoisir(
      [candidat({ siret: 'A'.padEnd(14, '0'), score: 60, detail: { nom: 20 } }), candidat({ score: 90 })],
      [fiche()],
    )
    expect(f).toHaveLength(1)
    expect(f[0].entreprises[0].retenu.score).toBe(90)
    expect(f[0].meilleurScore).toBe(90)
  })

  it('signale les fiches SERRÉES — deux candidats que le score ne départage pas', () => {
    // Sans ce drapeau, l'œil valide le premier de la liste sans voir qu'il y
    // avait un second à deux points. C'est pour cette raison exacte que
    // `classer` rend tous les candidats et pas seulement le meilleur.
    const f = fichesAChoisir(
      [candidat({ score: 88 }), candidat({ siret: '99999999900012', score: 88 - (ECART_SERRE - 1) })],
      [fiche()],
    )
    // SIREN différents : deux entreprises distinctes, donc le vrai cas dangereux.
    expect(f[0].serree).toBe(true)
    expect(f[0].memeEntreprise).toBe(false)
  })

  it('ne crie pas au serré quand l’écart tranche', () => {
    const f = fichesAChoisir(
      [candidat({ score: 90 }), candidat({ siret: '99999999900012', score: 90 - ECART_SERRE })],
      [fiche()],
    )
    expect(f[0].serree).toBe(false)
  })

  it('met les fiches évidentes en tête : une session avance à la vitesse de ses décisions faciles', () => {
    const dur = candidat({ entrepriseId: 2, score: 99, detail: { nom: 45, codePostal: 10 } })
    const facile = candidat({ entrepriseId: 3, score: 70 })
    const f = fichesAChoisir([dur, facile], [fiche({ entrepriseId: 2 }), fiche({ entrepriseId: 3 })])
    // Le score le plus haut est le DUR ; c'est bien le facile qui passe devant.
    expect(f.map((x) => x.fiche.entrepriseId)).toEqual([3, 2])
    expect(f[0].evidente).toBe(true)
    expect(f[1].evidente).toBe(false)
  })

  it('n’affiche pas une fiche sans candidat : une file qui ne se vide jamais n’est pas une file', () => {
    expect(fichesAChoisir([], [fiche()])).toEqual([])
  })

  it('ignore un candidat dont la fiche n’est plus à trancher', () => {
    // La fiche a été tranchée entre-temps par le bouton d'une fiche : la route
    // ne la rend plus, et son candidat orphelin ne doit pas ressusciter.
    expect(fichesAChoisir([candidat({ entrepriseId: 404 })], [fiche()])).toEqual([])
  })
})

describe('deux SIRET de même SIREN : une entreprise, deux établissements', () => {
  /**
   * Signalé par Matteo le 20/08 devant « Aviz'energie » et « CK Travaux » :
   * « c'est le même SIREN avec 2 SIRET différents, même entreprise… les deux
   * font sens, comment faire ? ». La question était juste, et l'écran n'y
   * répondait pas : il criait « deux candidats se tiennent, lisez l'adresse »
   * sur un cas qui n'a presque aucun enjeu.
   */
  const SIREN = '50861602600037'.slice(0, 9)
  const etablissement = (suffixe: string, score: number) =>
    candidat({ siret: `${SIREN}${suffixe}`, score })

  it('reconnaît que tous les candidats sont la même entreprise', () => {
    const f = fichesAChoisir([etablissement('00037', 90), etablissement('00011', 88)], [fiche()])
    expect(f[0].memeEntreprise).toBe(true)
    expect(f[0].siren).toBe(SIREN)
    // UNE entreprise, DEUX établissements — et une seule décision à prendre.
    expect(f[0].entreprises).toHaveLength(1)
    expect(f[0].entreprises[0].etablissements).toBe(2)
    // Le mieux noté est retenu d'office : c'est celui dont l'adresse colle le
    // mieux, puisque le score porte l'adresse et le code postal.
    expect(f[0].entreprises[0].retenu.siret).toBe(`${SIREN}00037`)
    expect(f[0].entreprises[0].autres.map((c) => c.siret)).toEqual([`${SIREN}00011`])
    // Et surtout : ce n'est PAS un cas serré. Deux établissements à deux points
    // d'écart ne sont pas un danger, et crier dessus use l'attention qu'on veut
    // garder pour les vrais.
    expect(f[0].serree).toBe(false)
  })

  it('ne le dit PAS quand les SIREN diffèrent — là, le danger est réel', () => {
    const f = fichesAChoisir(
      [candidat({ siret: '11111111100011', score: 90 }), candidat({ siret: '22222222200022', score: 88 })],
      [fiche()],
    )
    expect(f[0].memeEntreprise).toBe(false)
    expect(f[0].siren).toBeNull()
    // Serrée ET deux entreprises distinctes : c'est le cas qu'il faut crier.
    expect(f[0].serree).toBe(true)
  })

  it('ne le dit pas sur un candidat unique : il n’y a pas de choix à faire', () => {
    expect(fichesAChoisir([etablissement('00037', 90)], [fiche()])[0].memeEntreprise).toBe(false)
  })
})

describe('identiteEvidente — ce qui se tranche sans humain, et ce qui ne se tranche pas', () => {
  const parfait = { nom: 25, codePostal: 20, adresse: 45, activite: 10, etat: 5, niveau_adresse: 'exacte' }
  const SIREN = '508616026'

  it('tranche quand un SEUL SIREN est candidat et que les quatre concordent', () => {
    const [f] = fichesAChoisir(
      [candidat({ siret: `${SIREN}00037`, detail: parfait, score: 100 })],
      [fiche()],
    )
    expect(identiteEvidente(f)?.siret).toBe(`${SIREN}00037`)
  })

  it('tranche aussi avec PLUSIEURS ÉTABLISSEMENTS du même SIREN', () => {
    // Ce n'est pas un choix entre deux entreprises : l'identité légale, les
    // finances et le RGE sont identiques, seule l'adresse change — et le mieux
    // noté est celui dont l'adresse colle.
    const [f] = fichesAChoisir(
      [
        candidat({ siret: `${SIREN}00037`, detail: parfait, score: 100 }),
        candidat({ siret: `${SIREN}00011`, detail: { ...parfait, adresse: 20, niveau_adresse: 'voie' }, score: 75 }),
      ],
      [fiche()],
    )
    expect(identiteEvidente(f)?.siret).toBe(`${SIREN}00037`)
  })

  it('NE TRANCHE PAS quand deux ENTREPRISES sont candidates — le piège KM Dépannage', () => {
    // Deux SIREN à la même adresse et au même patronyme, l'un chauffagiste et
    // l'autre taxi. Les deux peuvent concorder sur quatre critères ; seul un
    // humain, ou le NAF, les sépare. On ne prend pas le risque.
    const [f] = fichesAChoisir(
      [
        candidat({ siret: '11111111100011', detail: parfait, score: 100 }),
        candidat({ siret: '22222222200022', detail: parfait, score: 99 }),
      ],
      [fiche()],
    )
    expect(identiteEvidente(f)).toBeNull()
  })

  it('NE TRANCHE PAS à trois critères sur quatre — la règle le dit', () => {
    const [f] = fichesAChoisir(
      [candidat({ siret: `${SIREN}00037`, detail: { ...parfait, activite: 0 }, score: 90 })],
      [fiche()],
    )
    expect(identiteEvidente(f)).toBeNull()
  })

  it('NE TRANCHE PAS sur un code postal de même département', () => {
    const [f] = fichesAChoisir(
      [candidat({ siret: `${SIREN}00037`, detail: { ...parfait, codePostal: 7 }, score: 88 })],
      [fiche()],
    )
    expect(identiteEvidente(f)).toBeNull()
  })
})

describe('resumeDeLaFile', () => {
  it('compte la charge de travail, pas seulement les lignes', () => {
    const f = fichesAChoisir(
      [
        candidat({ entrepriseId: 1 }),
        candidat({ entrepriseId: 2, siret: '99999999900012', detail: { nom: 45 } }),
      ],
      [fiche({ entrepriseId: 1 }), fiche({ entrepriseId: 2 })],
    )
    expect(resumeDeLaFile(f)).toEqual({
      fiches: 2,
      entreprises: 2,
      etablissements: 2,
      evidentes: 1,
      serrees: 0,
    })
  })
})
