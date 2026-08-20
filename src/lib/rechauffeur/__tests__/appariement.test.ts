import {
  capaciteDuMaillage,
  choisirTemoins,
  doitRepondre,
  familleDuDomaine,
  famillesManquantes,
  type Temoin,
} from '../appariement'
import type { Famille } from '../sante'

let n = 0
function temoin(famille: Famille, extra: Partial<Temoin> = {}): Temoin {
  n += 1
  return {
    id: `t${n}`,
    email: `temoin${n}@${famille}.fr`,
    nom: `Témoin ${n}`,
    famille,
    plafondJour: 4,
    tauxReponse: 0.5,
    actif: true,
    ...extra,
  }
}

const VIDE = { recents: [], chargeDuJour: {} }
/** Sans bruit : le tirage devient lisible, donc testable. */
const sansBruit = () => 0

describe('choisirTemoins', () => {
  it('sert cinq familles distinctes avant de resservir la première', () => {
    const pool = [
      temoin('google'), temoin('microsoft'), temoin('yahoo'),
      temoin('orange'), temoin('free'),
    ]
    const familles = choisirTemoins(pool, 5, VIDE, sansBruit).map((t) => t.famille)
    expect(new Set(familles).size).toBe(5)
  })

  it('ne dépasse JAMAIS le plafond d\'un témoin', () => {
    const pool = [temoin('google', { plafondJour: 2 }), temoin('orange', { plafondJour: 1 })]
    const choisis = choisirTemoins(pool, 10, VIDE, Math.random)
    const parId = new Map<string, number>()
    for (const t of choisis) parId.set(t.id, (parId.get(t.id) ?? 0) + 1)
    expect(parId.get(pool[0].id) ?? 0).toBeLessThanOrEqual(2)
    expect(parId.get(pool[1].id) ?? 0).toBeLessThanOrEqual(1)
    expect(choisis).toHaveLength(3)
  })

  it('rend MOINS que demandé plutôt que de marteler trois adresses', () => {
    // C'est le correctif de fond sur l'original : il pénalisait sans exclure,
    // et écrivait quatre fois par jour au même témoin quand le maillage
    // manquait. Un maillage trop petit doit se voir, pas se compenser.
    const pool = [temoin('google', { plafondJour: 1 })]
    expect(choisirTemoins(pool, 12, VIDE, Math.random)).toHaveLength(1)
  })

  it('tient compte de la charge déjà reçue aujourd\'hui', () => {
    const a = temoin('google', { plafondJour: 3 })
    const b = temoin('orange', { plafondJour: 3 })
    const choisis = choisirTemoins([a, b], 4, {
      recents: [],
      chargeDuJour: { [a.id]: 3 },
    }, sansBruit)
    expect(choisis.every((t) => t.id === b.id)).toBe(true)
    expect(choisis).toHaveLength(3)
  })

  it('déprioritise un témoin servi dans les quatre derniers jours', () => {
    const vu = temoin('google')
    const neuf = temoin('google')
    const choisis = choisirTemoins([vu, neuf], 1, {
      recents: [vu.email.toUpperCase()], // la casse ne doit pas compter
      chargeDuJour: {},
    }, sansBruit)
    expect(choisis[0].id).toBe(neuf.id)
  })

  it('ignore les témoins inactifs et ceux à plafond nul', () => {
    const pool = [
      temoin('google', { actif: false }),
      temoin('orange', { plafondJour: 0 }),
      temoin('free'),
    ]
    const choisis = choisirTemoins(pool, 3, VIDE, Math.random)
    expect(choisis.every((t) => t.famille === 'free')).toBe(true)
  })

  it('rend une liste vide quand on ne demande rien, ou qu\'il n\'y a personne', () => {
    expect(choisirTemoins([temoin('google')], 0, VIDE, sansBruit)).toEqual([])
    expect(choisirTemoins([], 5, VIDE, sansBruit)).toEqual([])
  })

  it('ne se ressemble pas deux jours de suite', () => {
    const pool = [
      temoin('google'), temoin('microsoft'), temoin('yahoo'),
      temoin('orange'), temoin('free'), temoin('autre'),
    ]
    const ordres = new Set<string>()
    for (let i = 0; i < 50; i++) {
      ordres.add(choisirTemoins(pool, 4, VIDE, Math.random).map((t) => t.id).join(','))
    }
    expect(ordres.size).toBeGreaterThan(5)
  })
})

describe('capaciteDuMaillage', () => {
  it('somme ce qui reste, sans compter les inactifs', () => {
    const a = temoin('google', { plafondJour: 4 })
    const b = temoin('orange', { plafondJour: 4 })
    const c = temoin('free', { plafondJour: 4, actif: false })
    expect(capaciteDuMaillage([a, b, c], { [a.id]: 3 })).toBe(1 + 4)
  })

  it('ne descend jamais sous zéro si un plafond a été baissé après coup', () => {
    const a = temoin('google', { plafondJour: 2 })
    expect(capaciteDuMaillage([a], { [a.id]: 9 })).toBe(0)
  })
})

describe('famillesManquantes', () => {
  it('réclame Orange et Free — le parc français, pas celui des réseaux américains', () => {
    const pool = [temoin('google'), temoin('microsoft'), temoin('yahoo')]
    expect(famillesManquantes(pool)).toEqual(['orange', 'free'])
  })

  it('ne compte pas un témoin éteint comme une famille couverte', () => {
    const pool = [
      temoin('google'), temoin('microsoft'), temoin('yahoo'),
      temoin('orange', { actif: false }), temoin('free'),
    ]
    expect(famillesManquantes(pool)).toEqual(['orange'])
  })
})

describe('doitRepondre', () => {
  it('suit le taux du témoin', () => {
    const t = temoin('google', { tauxReponse: 0.5 })
    expect(doitRepondre(t, () => 0.49)).toBe(true)
    expect(doitRepondre(t, () => 0.51)).toBe(false)
    expect(doitRepondre(temoin('google', { tauxReponse: 0 }), () => 0)).toBe(false)
  })
})

describe('familleDuDomaine', () => {
  it('reconnaît les cinq familles qui comptent', () => {
    expect(familleDuDomaine('a@gmail.com')).toBe('google')
    expect(familleDuDomaine('a@googlemail.com')).toBe('google')
    expect(familleDuDomaine('a@outlook.fr')).toBe('microsoft')
    expect(familleDuDomaine('a@hotmail.com')).toBe('microsoft')
    expect(familleDuDomaine('a@live.fr')).toBe('microsoft')
    expect(familleDuDomaine('a@yahoo.fr')).toBe('yahoo')
    expect(familleDuDomaine('a@orange.fr')).toBe('orange')
    expect(familleDuDomaine('a@free.fr')).toBe('free')
  })

  it('compte wanadoo.fr comme Orange — c\'est encore l\'adresse d\'artisans', () => {
    expect(familleDuDomaine('plombier@wanadoo.fr')).toBe('orange')
  })

  it('ne se laisse pas berner par un domaine qui contient le nom', () => {
    expect(familleDuDomaine('a@gmail.com.exemple.fr')).toBe('autre')
    expect(familleDuDomaine('a@notgmail.com')).toBe('autre')
  })

  it('rend « autre » pour tout le reste, y compris une adresse malformée', () => {
    expect(familleDuDomaine('a@samadigitalstudio.fr')).toBe('autre')
    expect(familleDuDomaine('pas-une-adresse')).toBe('autre')
  })
})
