/**
 * Envoyer un gros lot à une route qui n'en accepte qu'un petit.
 *
 * CE QUE ÇA RÉPARE, DIT PAR MATTEO : « appuyer sur enrichir quand on a trop
 * d'entreprises sélectionnées ça donne "invalid_body" et ça lance pas. Moi
 * j'aimerais que ça lance quand même, sinon on perd du temps de fou. »
 *
 * Il a raison, et le plafond n'a pas tort non plus. `enrich-prepare` refuse
 * au-delà de **50 opportunités**, `validate-enrichment` au-delà de 100 : ces
 * bornes protègent une requête, pas un geste. Cocher trois cents lignes est un
 * GESTE, et il ne devrait jamais buter sur la taille d'une requête — c'est au
 * client de découper, pas à l'utilisateur de cocher par cinquante.
 *
 * ⚠️ ET SURTOUT : LEVER LE PLAFOND SANS BORNER LA CONCURRENCE SERAIT PIRE QUE
 * L'ERREUR. L'enrichissement tirait ses appels avec un `Promise.allSettled` sur
 * toute la liste ; c'est le plafond de 50 qui limitait accidentellement la
 * casse. Sur 877 lignes, ça ferait 877 appels simultanés à une fonction qui
 * interroge un LLM. D'où `filePlafonnee` : on lance tout, mais quelques-uns à la
 * fois.
 */

/** Découper une liste en tranches d'au plus `taille` éléments. */
export function decouper<T>(liste: readonly T[], taille: number): T[][] {
  const large = Math.max(1, Math.floor(taille))
  const out: T[][] = []
  for (let i = 0; i < liste.length; i += large) out.push(liste.slice(i, i + large))
  return out
}

/**
 * Exécuter des tâches en limitant le nombre qui tournent EN MÊME TEMPS.
 *
 * Rend les résultats **dans l'ordre des tâches** — pas dans l'ordre où elles
 * finissent. C'est indispensable ici : l'écran d'enrichissement apparie ses
 * lignes de journal au résultat par l'index, et un ordre d'arrivée y collerait
 * le message d'une entreprise sur le nom d'une autre.
 *
 * Comme `Promise.allSettled`, il ne rejette jamais : une tâche qui échoue rend
 * `{ status: 'rejected' }` et les suivantes partent quand même.
 */
export async function filePlafonnee<T>(
  taches: readonly (() => Promise<T>)[],
  largeur: number,
): Promise<PromiseSettledResult<T>[]> {
  const resultats = new Array<PromiseSettledResult<T>>(taches.length)
  let prochaine = 0

  const ouvrier = async (): Promise<void> => {
    for (;;) {
      const i = prochaine++
      if (i >= taches.length) return
      try {
        resultats[i] = { status: 'fulfilled', value: await taches[i]() }
      } catch (reason) {
        resultats[i] = { status: 'rejected', reason }
      }
    }
  }

  const ouvriers = Math.max(1, Math.min(Math.floor(largeur), taches.length))
  await Promise.all(Array.from({ length: ouvriers }, () => ouvrier()))
  return resultats
}

/**
 * Envoyer une liste d'identifiants par paquets, et réunir les réponses.
 *
 * Les paquets partent **l'un après l'autre**, jamais en parallèle : ils
 * préparent des lignes en base, et vingt préparations simultanées sur le même
 * parc se marcheraient dessus. C'est plus lent qu'une rafale, et c'est le but.
 *
 * Un paquet qui échoue N'ARRÊTE PAS les suivants : son erreur est collectée et
 * rendue avec le reste. Sur un lot de trois cents, perdre cinquante lignes vaut
 * mieux que les perdre toutes — à condition de dire lesquelles, ce que
 * l'appelant fait avec `echecs`.
 */
export async function parPaquets<T, R>(
  ids: readonly T[],
  taille: number,
  envoyer: (paquet: T[]) => Promise<R>,
): Promise<{ reponses: R[]; echecs: { paquet: T[]; erreur: string }[] }> {
  const reponses: R[] = []
  const echecs: { paquet: T[]; erreur: string }[] = []
  for (const paquet of decouper(ids, taille)) {
    try {
      reponses.push(await envoyer(paquet))
    } catch (e) {
      echecs.push({ paquet, erreur: e instanceof Error ? e.message : String(e) })
    }
  }
  return { reponses, echecs }
}
