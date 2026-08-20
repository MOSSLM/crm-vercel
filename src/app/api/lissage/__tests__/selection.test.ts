/**
 * UNE POPULATION COCHÉE À L'ÉCRAN N'EST PAS UNE POPULATION SÛRE.
 *
 * `populationDeLaSelection` est la porte par laquelle des identifiants venus
 * d'un NAVIGATEUR entrent dans une table qui les référence en clé étrangère.
 * Deux conséquences, et les tests portent sur elles :
 *
 *  · un identifiant qui ne désigne rien ferait échouer l'insertion du LOT
 *    ENTIER, pas seulement de sa ligne — donc il ne doit jamais y arriver ;
 *  · une fiche archivée ou fusionnée dépenserait des appels d'API sur un
 *    doublon. On l'écarte, et surtout **on compte** ce qu'on écarte : un lot
 *    silencieusement rogné passerait pour un lot complet.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { MAX_POPULATION, populationDeLaSelection } from '../_lissage'

/**
 * Un client qui ne rend que les fiches VIVANTES de la tranche demandée — ce que
 * fait la vraie requête avec ses deux `is(..., null)`.
 */
function client(vivantes: number[], tranches: number[][] = []) {
  const sb = {
    from: () => {
      const noeud: Record<string, unknown> = {}
      let demandes: number[] = []
      noeud.select = () => noeud
      noeud.in = (_col: string, ids: number[]) => {
        demandes = ids
        tranches.push(ids)
        return noeud
      }
      noeud.is = () => noeud
      noeud.then = (r: (v: unknown) => unknown) =>
        Promise.resolve({
          data: demandes.filter((id) => vivantes.includes(id)).map((id) => ({ id })),
          error: null,
        }).then(r)
      return noeud
    },
  } as unknown as SupabaseClient
  return sb
}

describe('populationDeLaSelection', () => {
  it('écarte ce qui n’existe pas, et le compte', async () => {
    const r = await populationDeLaSelection(client([1, 2, 3]), [1, 2, 3, 9999])
    expect(r.ids).toEqual([1, 2, 3])
    expect(r.demandes).toBe(4)
    expect(r.ecartees).toBe(1)
  })

  it('dédoublonne avant de compter — cocher deux fois n’est pas deux fiches', async () => {
    const r = await populationDeLaSelection(client([7]), [7, 7, 7])
    expect(r.ids).toEqual([7])
    expect(r.demandes).toBe(1)
    expect(r.ecartees).toBe(0)
  })

  it('garde l’ordre de l’écran, que `in` ne garantit pas', async () => {
    const r = await populationDeLaSelection(client([5, 3, 1]), [5, 1, 3])
    expect(r.ids).toEqual([5, 1, 3])
  })

  it('refuse les identifiants qui n’en sont pas, sans appeler la base avec', async () => {
    const tranches: number[][] = []
    const r = await populationDeLaSelection(client([4], tranches), [4, NaN, -1, 0])
    expect(r.ids).toEqual([4])
    expect(tranches[0]).toEqual([4])
  })

  // Une clause `in` de deux mille identifiants dépasse la longueur d'URL que
  // PostgREST accepte : la lecture se fait par tranches, et le test le tient.
  it('lit par tranches de 500', async () => {
    const tranches: number[][] = []
    const ids = Array.from({ length: 1200 }, (_, i) => i + 1)
    const r = await populationDeLaSelection(client(ids, tranches), ids)
    expect(tranches.map((t) => t.length)).toEqual([500, 500, 200])
    expect(r.ids).toHaveLength(1200)
  })

  it('plafonne la population — au-delà ce n’est plus une passe', async () => {
    const ids = Array.from({ length: MAX_POPULATION + 50 }, (_, i) => i + 1)
    const r = await populationDeLaSelection(client(ids), ids)
    expect(r.ids).toHaveLength(MAX_POPULATION)
  })

  it('une sélection vide ne lit rien', async () => {
    const tranches: number[][] = []
    const r = await populationDeLaSelection(client([], tranches), [])
    expect(r).toEqual({ ids: [], demandes: 0, ecartees: 0 })
    expect(tranches).toEqual([])
  })
})
