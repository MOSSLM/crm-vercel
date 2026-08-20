import {
  apercu,
  assemblerFils,
  compterFils,
  estARepondre,
  filtrerFils,
  libelleAuteur,
  type Message,
} from '../conversation'

type Brute = Message & {
  entrepriseId: number | null
  entreprise: string
  ville: string | null
  cohorte: string | null
  contact: string | null
}

function msg(p: Partial<Brute> & { id: string }): Brute {
  return {
    canal: 'whatsapp',
    sens: 'sortant',
    quand: '2026-08-18T09:00:00.000Z',
    objet: 'Message WhatsApp',
    texte: 'Bonjour, votre site…',
    issue: null,
    etapeId: null,
    auteurId: 'a1',
    auteur: 'Bilal Cacan',
    remise: null,
    bloquePar: null,
    entrepriseId: 1,
    entreprise: 'SARL Martin',
    ville: 'Écully',
    cohorte: 'B_sans_site',
    contact: null,
    ...p,
  }
}

describe('assembler les fils', () => {
  it('groupe par entreprise et range dans l’ordre du temps', () => {
    const fils = assemblerFils([
      msg({ id: 'm2', quand: '2026-08-19T09:00:00Z' }),
      msg({ id: 'm1', quand: '2026-08-18T09:00:00Z' }),
      msg({ id: 'm3', entrepriseId: 2, entreprise: 'Toiture Dupont', quand: '2026-08-17T09:00:00Z' }),
    ])
    expect(fils).toHaveLength(2)
    // Le fil qui a bougé en dernier passe en tête : c'est l'ordre d'une messagerie.
    expect(fils[0].entreprise).toBe('SARL Martin')
    expect(fils[0].messages.map((m) => m.id)).toEqual(['m1', 'm2'])
    expect(fils[0].dernier?.id).toBe('m2')
  })

  it('écarte ce qui n’appartient à aucun prospect', () => {
    // Les 4 e-mails de `scheduling` de juillet n'ont pas d'entreprise : les
    // garder fabriquerait un fil que personne ne saurait ouvrir.
    const fils = assemblerFils([
      msg({ id: 'm1' }),
      msg({ id: 'orphelin', entrepriseId: null }),
    ])
    expect(fils).toHaveLength(1)
    expect(fils[0].messages).toHaveLength(1)
  })

  it('récupère le contact sur n’importe quelle ligne du fil', () => {
    const fils = assemblerFils([
      msg({ id: 'm1', contact: null }),
      msg({ id: 'm2', contact: 'Cédric Martin', quand: '2026-08-19T09:00:00Z' }),
    ])
    expect(fils[0].contact).toBe('Cédric Martin')
  })

  it('compte par sens sans jamais les additionner', () => {
    const fils = assemblerFils([
      msg({ id: 'm1', sens: 'sortant' }),
      msg({ id: 'm2', sens: 'entrant', quand: '2026-08-19T09:00:00Z' }),
      msg({ id: 'm3', sens: 'interne', quand: '2026-08-19T10:00:00Z' }),
    ])
    expect(fils[0].compte).toEqual({ sortant: 1, entrant: 1, interne: 1 })
    expect(fils[0].dernierEntrant?.id).toBe('m2')
  })
})

describe('« à répondre »', () => {
  const fil = (...m: Brute[]) => ({ messages: m })

  it('s’allume quand le prospect a parlé en dernier', () => {
    expect(
      estARepondre(
        fil(
          msg({ id: 'a', sens: 'sortant', quand: '2026-08-18T09:00:00Z' }),
          msg({ id: 'b', sens: 'entrant', quand: '2026-08-19T09:00:00Z' }),
        ),
      ),
    ).toBe(true)
  })

  it('s’éteint dès qu’on a répondu', () => {
    expect(
      estARepondre(
        fil(
          msg({ id: 'b', sens: 'entrant', quand: '2026-08-19T09:00:00Z' }),
          msg({ id: 'c', sens: 'sortant', quand: '2026-08-19T10:00:00Z' }),
        ),
      ),
    ).toBe(false)
  })

  it('NE s’éteint PAS sur une note interne', () => {
    // Écrire « rappeler en septembre » dans le fil ne répond à personne. C'est
    // même le fil qu'on risque le plus d'oublier : il a l'air d'avoir bougé.
    expect(
      estARepondre(
        fil(
          msg({ id: 'b', sens: 'entrant', quand: '2026-08-19T09:00:00Z' }),
          msg({ id: 'n', sens: 'interne', quand: '2026-08-19T11:00:00Z' }),
        ),
      ),
    ).toBe(true)
  })

  it('reste éteint quand le prospect n’a jamais parlé', () => {
    expect(estARepondre(fil(msg({ id: 'a', sens: 'sortant' })))).toBe(false)
    expect(estARepondre(fil())).toBe(false)
  })
})

describe('les filtres du volet de gauche', () => {
  const fils = assemblerFils([
    msg({ id: 'a1', entrepriseId: 1, entreprise: 'SARL Martin', ville: 'Villeurbanne', sens: 'sortant' }),
    msg({ id: 'a2', entrepriseId: 1, sens: 'entrant', quand: '2026-08-19T09:00:00Z' }),
    msg({ id: 'b1', entrepriseId: 2, entreprise: 'Toiture Dupont', ville: 'Lyon', sens: 'sortant' }),
    msg({ id: 'c1', entrepriseId: 3, entreprise: 'Plomberie Écully', sens: 'entrant' }),
    msg({ id: 'c2', entrepriseId: 3, sens: 'sortant', quand: '2026-08-19T12:00:00Z' }),
  ])

  it('sépare « à répondre » d’« ont parlé »', () => {
    expect(filtrerFils(fils, 'a_repondre').map((f) => f.entrepriseId)).toEqual([1])
    expect(filtrerFils(fils, 'ont_parle').map((f) => f.entrepriseId).sort()).toEqual([1, 3])
    expect(filtrerFils(fils, 'jamais_parle').map((f) => f.entrepriseId)).toEqual([2])
    expect(filtrerFils(fils, 'tous')).toHaveLength(3)
  })

  it('compte des VUES, pas des signaux qu’on additionne', () => {
    const n = compterFils(fils)
    expect(n).toEqual({ tous: 3, a_repondre: 1, ont_parle: 2, jamais_parle: 1 })
    // « À répondre » est un sous-ensemble d'« ont parlé » : la somme dépasse le
    // nombre de fils, et c'est exact. Ce qui serait faux, c'est de l'afficher
    // comme un nombre de prospects.
    expect(n.a_repondre + n.ont_parle + n.jamais_parle).toBeGreaterThan(n.tous)
    // La partition, elle, tient : ont parlé + n'ont jamais parlé = tous.
    expect(n.ont_parle + n.jamais_parle).toBe(n.tous)
  })

  it('cherche sans casse ni accent, sur le nom comme sur la ville', () => {
    // « ecully » sans accent trouve « Plomberie Écully » par son NOM ; les trois
    // fils ont des villes distinctes pour que chaque recherche ne vise qu'un
    // seul d'entre eux, et que l'assertion dise donc quelque chose.
    expect(filtrerFils(fils, 'tous', 'ecully').map((f) => f.entrepriseId)).toEqual([3])
    expect(filtrerFils(fils, 'tous', 'LYON').map((f) => f.entrepriseId)).toEqual([2])
    expect(filtrerFils(fils, 'tous', 'martin')).toHaveLength(1)
  })
})

describe('qui a écrit', () => {
  it('nomme l’auteur quand il est enregistré', () => {
    expect(libelleAuteur(msg({ id: 'm', auteur: 'Bilal Cacan' }))).toBe('Bilal Cacan')
  })

  it('distingue « non enregistré » de « le CRM »', () => {
    // Avant le 20/08 la colonne n'existait pas : dire « le CRM » serait faux,
    // un humain a bien écrit ces 29 notes. Dire « personne » le serait aussi.
    expect(libelleAuteur(msg({ id: 'm', auteur: null, quand: '2026-08-18T09:00:00Z' })))
      .toBe('auteur non enregistré')
    // Après, un auteur nul veut dire que c'est le moteur qui a écrit.
    expect(libelleAuteur(msg({ id: 'm', auteur: null, quand: '2026-08-21T09:00:00Z' })))
      .toBe('le CRM')
  })
})

describe('l’aperçu', () => {
  it('rend la dernière chose dite, sur une ligne', () => {
    const fils = assemblerFils([msg({ id: 'm', texte: 'Bonjour,\n\n  votre   site est\nvieux' })])
    expect(apercu(fils[0])).toBe('Bonjour, votre site est vieux')
  })

  it('retombe sur l’objet quand il n’y a pas de texte', () => {
    const fils = assemblerFils([msg({ id: 'm', texte: '', objet: 'Message WhatsApp' })])
    expect(apercu(fils[0])).toBe('Message WhatsApp')
  })

  it('tronque sans couper au milieu d’un mot invisible', () => {
    const fils = assemblerFils([msg({ id: 'm', texte: 'a'.repeat(200) })])
    expect(apercu(fils[0], 20)).toHaveLength(20)
    expect(apercu(fils[0], 20).endsWith('…')).toBe(true)
  })
})
