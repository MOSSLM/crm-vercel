import {
  CRITERES_VIDES,
  COLONNES_PAR_DEFAUT,
  aplatir,
  colonnesDeLaVue,
  filtrerTaches,
  ligneRetenue,
  ligneSatisfait,
  normaliserCriteres,
  resumerCriteres,
  seauDeLEcheance,
  trierLignes,
  valeursProposees,
  type CriteresVue,
  type LigneTache,
} from '../vue-taches'

/** Une ligne plausible, qu'on décline champ par champ. */
function ligne(p: Partial<LigneTache> = {}): LigneTache {
  return {
    id: 'T1',
    canal: 'call',
    statut: 'pending',
    titre: 'Appel 1',
    echeance: '2026-08-14T09:00:00.000Z',
    faiteLe: null,
    entrepriseId: 1,
    entreprise: 'SARL Martin',
    ville: 'Écully',
    cohorte: 'B_sans_site',
    agentId: 'a1',
    agent: 'Bilal',
    campagneId: null,
    campagne: null,
    etapeId: null,
    inscriptionId: null,
    motif: null,
    premiereTouche: null,
    aRepondu: false,
    ...p,
  }
}

// Un mardi 19 août 2026, 10 h à Paris (08 h UTC) : c'est « maintenant » pour
// tous les tests d'échéance, sinon les seaux dépendraient du jour où l'on lance
// la suite.
const MAINTENANT = new Date('2026-08-19T08:00:00.000Z')
const CTX = { maintenant: MAINTENANT, fuseau: 'Europe/Paris' }

describe('les seaux d’échéance', () => {
  it('range chaque échéance dans un seul seau', () => {
    expect(seauDeLEcheance('2026-08-14T09:00:00Z', MAINTENANT)).toBe('echue')
    expect(seauDeLEcheance('2026-08-19T15:00:00Z', MAINTENANT)).toBe('aujourdhui')
    expect(seauDeLEcheance('2026-08-20T09:00:00Z', MAINTENANT)).toBe('demain')
    expect(seauDeLEcheance('2026-08-24T09:00:00Z', MAINTENANT)).toBe('semaine')
    expect(seauDeLEcheance('2026-09-17T09:00:00Z', MAINTENANT)).toBe('plus_tard')
    expect(seauDeLEcheance(null, MAINTENANT)).toBe('sans')
  })

  it('ne déclare pas échu ce qui est dû plus tôt DANS la journée', () => {
    // 7 h du matin alors qu'il est 10 h : ce n'est pas du retard, la journée
    // n'est pas finie. La frontière est le DÉBUT DU JOUR civil, exactement
    // comme `isLate` (`demarchage-buckets.ts`) — sans quoi tout le travail du
    // matin s'afficherait en retard dès 9 h 01, et le mot « échue » ne
    // voudrait plus rien dire pour les 640 appels qui, eux, traînent depuis
    // des jours.
    expect(seauDeLEcheance('2026-08-19T05:00:00Z', MAINTENANT)).toBe('aujourdhui')
    // 22 h à Paris la veille — là, la journée est bien finie.
    expect(seauDeLEcheance('2026-08-18T20:00:00Z', MAINTENANT)).toBe('echue')
  })

  it('lit le jour civil dans le fuseau, pas en UTC', () => {
    // 23 h 30 à Paris le 19 = 21 h 30 UTC. En UTC on serait encore le 19 dans
    // les deux cas ; c'est à minuit passé que les deux lectures divergent.
    const minuitPasse = new Date('2026-08-19T22:30:00.000Z') // 00 h 30 le 20 à Paris
    expect(seauDeLEcheance('2026-08-19T18:00:00Z', minuitPasse, 'Europe/Paris')).toBe('echue')
    expect(seauDeLEcheance('2026-08-20T10:00:00Z', minuitPasse, 'Europe/Paris')).toBe('aujourdhui')
  })
})

describe('un filtre seul', () => {
  it('additionne les valeurs d’une même pastille — toujours un OU', () => {
    const f = { champ: 'canal' as const, operateur: 'est' as const, valeurs: ['call', 'whatsapp'] }
    expect(ligneSatisfait(ligne({ canal: 'call' }), f)).toBe(true)
    expect(ligneSatisfait(ligne({ canal: 'whatsapp' }), f)).toBe(true)
    expect(ligneSatisfait(ligne({ canal: 'email' }), f)).toBe(false)
  })

  it('ne vide pas le tableau tant que la pastille est vide', () => {
    // La pastille qu'on vient d'ajouter n'a pas encore de valeur : elle ne doit
    // rien retirer sous les doigts de celui qui la remplit.
    const f = { champ: 'canal' as const, operateur: 'est' as const, valeurs: [] }
    expect(ligneSatisfait(ligne(), f)).toBe(true)
  })

  it('« n’est pas » retient aussi ce qui n’a pas de valeur du tout', () => {
    // Une tâche sans campagne n'est pas « la campagne B » : elle doit sortir
    // d'un « campagne : ni B ». L'inverse cacherait les 698 tâches orphelines.
    const f = { champ: 'campagne' as const, operateur: 'nest_pas' as const, valeurs: ['c1'] }
    expect(ligneSatisfait(ligne({ campagneId: 'c1' }), f)).toBe(false)
    expect(ligneSatisfait(ligne({ campagneId: 'c2' }), f)).toBe(true)
    expect(ligneSatisfait(ligne({ campagneId: null }), f)).toBe(true)
  })

  it('cherche sans casse ni accent', () => {
    const f = { champ: 'ville' as const, operateur: 'contient' as const, valeurs: ['ECULLY'] }
    expect(ligneSatisfait(ligne({ ville: 'Écully' }), f)).toBe(true)
    expect(aplatir('Château-Gaillard')).toBe('chateau-gaillard')
  })

  it('traite la chaîne vide comme une absence', () => {
    const vide = { champ: 'motif' as const, operateur: 'vide' as const, valeurs: [] }
    expect(ligneSatisfait(ligne({ motif: null }), vide)).toBe(true)
    expect(ligneSatisfait(ligne({ motif: '  ' }), vide)).toBe(true)
    expect(ligneSatisfait(ligne({ motif: 'reprise' }), vide)).toBe(false)
  })

  it('lit le premier contact en base, jamais en le devinant', () => {
    const premier = { champ: 'contact' as const, operateur: 'est' as const, valeurs: ['premier'] }
    expect(ligneSatisfait(ligne({ premiereTouche: null }), premier)).toBe(true)
    expect(ligneSatisfait(ligne({ premiereTouche: '2026-08-18T09:00:00Z' }), premier)).toBe(false)
  })
})

describe('le mode ET / OU', () => {
  const appelsEchus: CriteresVue = {
    mode: 'et',
    filtres: [
      { champ: 'canal', operateur: 'est', valeurs: ['call'] },
      { champ: 'echeance', operateur: 'est', valeurs: ['echue'] },
    ],
  }

  it('ET croise les pastilles', () => {
    expect(ligneRetenue(ligne({ canal: 'call' }), appelsEchus, CTX)).toBe(true)
    expect(ligneRetenue(ligne({ canal: 'whatsapp' }), appelsEchus, CTX)).toBe(false)
    expect(
      ligneRetenue(ligne({ canal: 'call', echeance: '2026-08-24T09:00:00Z' }), appelsEchus, CTX),
    ).toBe(false)
  })

  it('OU les réunit', () => {
    const ou: CriteresVue = { ...appelsEchus, mode: 'ou' }
    expect(ligneRetenue(ligne({ canal: 'whatsapp' }), ou, CTX)).toBe(true)
    expect(
      ligneRetenue(ligne({ canal: 'whatsapp', echeance: '2026-08-24T09:00:00Z' }), ou, CTX),
    ).toBe(false)
  })

  it('sans pastille, tout passe — dans les deux modes', () => {
    // Un OU sans terme est vide en logique ; un tableau sans filtre qui
    // n'afficherait rien serait absurde.
    expect(ligneRetenue(ligne(), CRITERES_VIDES)).toBe(true)
    expect(ligneRetenue(ligne(), { mode: 'ou', filtres: [] })).toBe(true)
  })
})

describe('le tri', () => {
  it('met la plus ancienne échéance en tête', () => {
    const l = [
      ligne({ id: 'b', echeance: '2026-08-19T09:00:00Z' }),
      ligne({ id: 'a', echeance: '2026-08-14T09:00:00Z' }),
    ]
    expect(trierLignes(l).map((x) => x.id)).toEqual(['a', 'b'])
    expect(trierLignes(l, { colonne: 'echeance', sens: 'desc' }).map((x) => x.id)).toEqual(['b', 'a'])
  })

  it('renvoie les échéances absentes en fin de liste dans les DEUX sens', () => {
    // Remonter du vide en tête d'un tri décroissant ferait passer « on ne sait
    // pas quand » pour « c'est le plus urgent ».
    const l = [
      ligne({ id: 'sans', echeance: null }),
      ligne({ id: 'vieux', echeance: '2026-08-14T09:00:00Z' }),
      ligne({ id: 'recent', echeance: '2026-08-19T09:00:00Z' }),
    ]
    expect(trierLignes(l, { colonne: 'echeance', sens: 'asc' }).map((x) => x.id)).toEqual([
      'vieux', 'recent', 'sans',
    ])
    expect(trierLignes(l, { colonne: 'echeance', sens: 'desc' }).map((x) => x.id)).toEqual([
      'recent', 'vieux', 'sans',
    ])
  })

  it('trie le texte à la française, accents compris', () => {
    const l = [
      ligne({ id: 'z', entreprise: 'Zinguerie' }),
      ligne({ id: 'e', entreprise: 'Étanchéité' }),
      ligne({ id: 'a', entreprise: 'Alu Concept' }),
    ]
    expect(trierLignes(l, { colonne: 'entreprise', sens: 'asc' }).map((x) => x.id)).toEqual([
      'a', 'e', 'z',
    ])
  })
})

describe('les valeurs proposées par les pastilles', () => {
  const file = [
    ligne({ id: '1', canal: 'call' }),
    ligne({ id: '2', canal: 'call' }),
    ligne({ id: '3', canal: 'whatsapp' }),
  ]

  it('compte sur la file entière et nomme les valeurs en français', () => {
    const v = valeursProposees(file, 'canal', CTX)
    expect(v).toEqual([
      { valeur: 'call', libelle: 'Appel', n: 2 },
      { valeur: 'whatsapp', libelle: 'WhatsApp', n: 1 },
    ])
  })

  it('garde les seaux d’échéance vides, dans l’ordre du calendrier', () => {
    // « Demain » doit rester proposable les jours où rien n'est prévu :
    // c'est précisément ce qu'on veut pouvoir vérifier.
    const v = valeursProposees(file, 'echeance', CTX)
    expect(v.map((x) => x.valeur)).toEqual([
      'echue', 'aujourdhui', 'demain', 'semaine', 'plus_tard', 'sans',
    ])
    expect(v.find((x) => x.valeur === 'echue')?.n).toBe(3)
    expect(v.find((x) => x.valeur === 'demain')?.n).toBe(0)
  })

  it('prend le nom lisible de l’agent, pas son identifiant', () => {
    const v = valeursProposees(file, 'agent', CTX)
    expect(v).toEqual([{ valeur: 'a1', libelle: 'Bilal', n: 3 }])
  })
})

describe('des critères venus de la base', () => {
  it('écarte la pastille illisible sans perdre la vue', () => {
    const c = normaliserCriteres({
      mode: 'ou',
      filtres: [
        { champ: 'canal', operateur: 'est', valeurs: ['call'] },
        { champ: 'inventé', operateur: 'est', valeurs: ['x'] },
        { champ: 'statut', operateur: 'jamais_vu', valeurs: ['done'] },
      ],
    })
    expect(c?.mode).toBe('ou')
    expect(c?.filtres).toEqual([{ champ: 'canal', operateur: 'est', valeurs: ['call'] }])
  })

  it('retombe sur les colonnes par défaut plutôt que sur un écran blanc', () => {
    expect(colonnesDeLaVue(normaliserCriteres({ mode: 'et', filtres: [], colonnes: [] }))).toEqual(
      COLONNES_PAR_DEFAUT,
    )
    expect(colonnesDeLaVue(normaliserCriteres({ mode: 'et', filtres: [], colonnes: ['zzz'] }))).toEqual(
      COLONNES_PAR_DEFAUT,
    )
    expect(colonnesDeLaVue(null)).toEqual(COLONNES_PAR_DEFAUT)
  })

  it('refuse ce qui n’est pas un objet de critères', () => {
    expect(normaliserCriteres(null)).toBeNull()
    expect(normaliserCriteres([])).toBeNull()
    expect(normaliserCriteres('et')).toBeNull()
  })

  it('garde un tri connu, jette un tri inventé', () => {
    expect(normaliserCriteres({ tri: { colonne: 'echeance', sens: 'desc' } })?.tri).toEqual({
      colonne: 'echeance',
      sens: 'desc',
    })
    expect(normaliserCriteres({ tri: { colonne: 'lune', sens: 'asc' } })?.tri).toBeUndefined()
  })
})

describe('le résumé en français', () => {
  it('dit ce que le filtre retient', () => {
    expect(resumerCriteres(CRITERES_VIDES)).toBe('Toute la file')
    expect(
      resumerCriteres({
        mode: 'et',
        filtres: [
          { champ: 'canal', operateur: 'est', valeurs: ['call', 'whatsapp'] },
          { champ: 'echeance', operateur: 'est', valeurs: ['echue'] },
        ],
      }),
    ).toBe('Canal : Appel ou WhatsApp ET Échéance : Échue')
    expect(
      resumerCriteres({
        mode: 'ou',
        filtres: [{ champ: 'campagne', operateur: 'vide', valeurs: [] }],
      }),
    ).toBe('Campagne : rien')
  })
})

describe('filtrer puis trier, en un appel', () => {
  it('rend exactement ce que l’écran doit montrer', () => {
    const file = [
      ligne({ id: 'wa', canal: 'whatsapp', echeance: '2026-08-14T09:00:00Z' }),
      ligne({ id: 'vieux', canal: 'call', echeance: '2026-08-14T09:00:00Z' }),
      ligne({ id: 'demain', canal: 'call', echeance: '2026-08-20T09:00:00Z' }),
      ligne({ id: 'recent', canal: 'call', echeance: '2026-08-18T09:00:00Z' }),
    ]
    const vu = filtrerTaches(
      file,
      {
        mode: 'et',
        filtres: [
          { champ: 'canal', operateur: 'est', valeurs: ['call'] },
          { champ: 'echeance', operateur: 'est', valeurs: ['echue'] },
        ],
      },
      CTX,
    )
    expect(vu.map((l) => l.id)).toEqual(['vieux', 'recent'])
  })
})
