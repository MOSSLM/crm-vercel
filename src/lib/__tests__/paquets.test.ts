/**
 * DÉCOUPER SANS RIEN PERDRE, ET SANS TOUT LANCER D'UN COUP.
 *
 * Ces deux garanties se répondent. Lever le plafond d'une route sans borner la
 * concurrence remplacerait un « invalid_body » — visible, et sans conséquence —
 * par 877 appels simultanés à une fonction qui interroge un LLM. Le premier
 * défaut fait perdre du temps ; le second fait tomber le service.
 */
import { decouper, filePlafonnee, parPaquets } from '../paquets'

describe('decouper', () => {
  it('rend des tranches pleines puis le reste', () => {
    expect(decouper([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('ne perd rien quand la liste tient dans une tranche', () => {
    expect(decouper([1, 2], 50)).toEqual([[1, 2]])
  })

  it('rend une liste vide plutôt qu’une tranche vide', () => {
    expect(decouper([], 10)).toEqual([])
  })

  // Une taille nulle ferait une boucle infinie — le genre de défaut qui gèle
  // l'onglet plutôt que de lever une erreur.
  it('ne boucle pas indéfiniment sur une taille absurde', () => {
    expect(decouper([1, 2], 0)).toEqual([[1], [2]])
  })
})

describe('filePlafonnee', () => {
  // ⚠️ CE TEST VÉRIFIE LES DEUX BORNES, ET LA SECONDE EST LA PLUS IMPORTANTE.
  // La première version n'affirmait que `pic <= 3` : elle passait aussi pour une
  // exécution strictement séquentielle, c'est-à-dire pour le code qui aurait
  // fait perdre à Matteo le temps qu'on essaie de lui rendre. Une borne haute
  // seule ne prouve rien d'une file.
  it('lance jusqu’à la largeur, et jamais au-delà', async () => {
    const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms))
    let encours = 0
    let pic = 0
    const taches = Array.from({ length: 20 }, () => async () => {
      encours += 1
      pic = Math.max(pic, encours)
      await attendre(5)
      encours -= 1
      return 1
    })
    await filePlafonnee(taches, 3)
    expect(pic).toBe(3)
  })

  it('ne dépasse pas le nombre de tâches quand la largeur est plus grande', async () => {
    const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms))
    let encours = 0
    let pic = 0
    const taches = Array.from({ length: 2 }, () => async () => {
      encours += 1
      pic = Math.max(pic, encours)
      await attendre(5)
      encours -= 1
      return 1
    })
    await filePlafonnee(taches, 50)
    expect(pic).toBe(2)
  })

  // L'ORDRE EST UNE GARANTIE, PAS UN HASARD : l'écran d'enrichissement apparie
  // ses lignes de journal au résultat par l'index. Un ordre d'arrivée collerait
  // le message d'une entreprise sur le nom d'une autre.
  it('rend les résultats dans l’ordre des tâches, pas des arrivées', async () => {
    const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms))
    const taches = [
      async () => { await attendre(20); return 'lente' },
      async () => 'rapide',
    ]
    const r = await filePlafonnee(taches, 2)
    expect(r.map((x) => (x.status === 'fulfilled' ? x.value : x.reason))).toEqual(['lente', 'rapide'])
  })

  it('une tâche qui échoue ne fait pas tomber les autres', async () => {
    const taches = [
      async () => 'a',
      async () => { throw new Error('boum') },
      async () => 'c',
    ]
    const r = await filePlafonnee(taches, 2)
    expect(r.map((x) => x.status)).toEqual(['fulfilled', 'rejected', 'fulfilled'])
  })

  it('ne fait rien sur une liste vide', async () => {
    expect(await filePlafonnee([], 4)).toEqual([])
  })
})

describe('parPaquets', () => {
  it('envoie tout, par paquets, l’un après l’autre', async () => {
    const vus: number[][] = []
    let simultanes = 0
    const r = await parPaquets([1, 2, 3, 4, 5], 2, async (p) => {
      simultanes += 1
      expect(simultanes).toBe(1)
      vus.push(p)
      await Promise.resolve()
      simultanes -= 1
      return p.length
    })
    expect(vus).toEqual([[1, 2], [3, 4], [5]])
    expect(r.reponses).toEqual([2, 2, 1])
    expect(r.echecs).toEqual([])
  })

  // UN PAQUET PERDU NE DOIT PAS EN PERDRE TROIS CENTS. Mais il doit se dire :
  // c'est l'appelant qui traduit `echecs` en avertissement à l'écran.
  it('continue après un paquet en échec, et le rend', async () => {
    const r = await parPaquets([1, 2, 3, 4], 2, async (p) => {
      if (p[0] === 1) throw new Error('refusé')
      return p.length
    })
    expect(r.reponses).toEqual([2])
    expect(r.echecs).toEqual([{ paquet: [1, 2], erreur: 'refusé' }])
  })
})
