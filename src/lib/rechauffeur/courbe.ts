// courbe.ts — la montée en volume, et la façon de l'étaler dans une journée.
//
// PORTÉ DE `/Users/matt/Code/email-warmup/src/lib/warmup/schedule.ts`, module
// pur, sans base ni réseau. Deux règles gouvernent tout le fichier :
//
//   1. la progression doit être RÉGULIÈRE — jamais d'escalier ;
//   2. la cadence doit être IRRÉGULIÈRE — jamais d'horaire rond.
//
// Un automate se trahit par sa ponctualité bien plus que par son volume.
//
// CE QUI CHANGE PAR RAPPORT À L'ORIGINAL : le hasard est INJECTÉ. La version
// d'origine appelait `Math.random()` en dur, ce qui rend une courbe
// invérifiable — on ne peut pas écrire de test sur « à peu près bien réparti ».
// Ici la source d'aléa est un paramètre, la valeur par défaut reste
// `Math.random`, et les tests passent une suite déterministe.

/** Ce qu'on s'autorise un jour donné. */
export interface PalierDuJour {
  /** Messages de chauffe visés. */
  chauffe: number
  /** Prospection à froid autorisée en parallèle. */
  froid: number
}

/**
 * Le palier théorique au jour `jour` (1 = premier jour), pour une cible donnée.
 *
 * LA PROSPECTION NE S'OUVRE QU'À J+8, et elle progresse plus lentement que la
 * chauffe : on ne remplace pas du volume connu — dont on mesure le placement —
 * par du volume inconnu.
 */
export function palierDuJour(jour: number, cible: number): PalierDuJour {
  if (jour <= 0) return { chauffe: 0, froid: 0 }

  let chauffe: number
  if (jour <= 3) chauffe = 4
  else if (jour <= 7) chauffe = 4 + (jour - 3) * 2 // 6 → 12
  else if (jour <= 28) chauffe = 12 + (jour - 7) * 2 // 14 → 54, borné par la cible
  else chauffe = cible

  chauffe = Math.min(chauffe, cible)

  let froid = 0
  if (jour >= 8) froid = Math.round((jour - 7) * 1.6)
  if (jour >= 29) froid = Math.round(cible * 1.2)

  return { chauffe, froid }
}

/**
 * Le coefficient du jour de la semaine.
 *
 * Le samedi on lève le pied, le dimanche on s'arrête presque — personne
 * n'écrit un dimanche, et un expéditeur qui garde le même débit sept jours sur
 * sept ne ressemble à aucune entreprise. Jamais zéro pour autant : une boîte
 * totalement muette le week-end est un motif, elle aussi.
 */
export function coefficientDuJour(date: Date): number {
  const jour = date.getUTCDay()
  if (jour === 0) return 0.15
  if (jour === 6) return 0.4
  return 1
}

/** Le quantième jour de chauffe, à partir de la date de démarrage. */
export function jourDeChauffe(demarreLe: string | null, aujourdHui: Date): number {
  if (!demarreLe) return 0
  const debut = new Date(`${demarreLe}T00:00:00Z`)
  if (Number.isNaN(debut.getTime())) return 0
  return Math.floor((aujourdHui.getTime() - debut.getTime()) / 86_400_000) + 1
}

/** Le décalage UTC d'un fuseau à une date donnée, en minutes. */
export function decalageFuseauMinutes(fuseau: string, quand: Date): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: fuseau,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const p = Object.fromEntries(fmt.formatToParts(quand).map((x) => [x.type, x.value]))
  const commeUtc = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour === '24' ? '00' : p.hour), Number(p.minute), Number(p.second),
  )
  return Math.round((commeUtc - quand.getTime()) / 60_000)
}

/** Une source d'aléa, injectable pour que la répartition soit vérifiable. */
export type Alea = () => number

/**
 * Répartit `combien` envois dans la fenêtre horaire locale, avec du bruit.
 *
 * Ni intervalle constant (un automate), ni grappe (une rafale) : la fenêtre est
 * découpée en autant de tranches que d'envois, et on tire un instant au hasard
 * dans chacune. Les 10 % de marge de part et d'autre évitent les instants pile
 * en bord de tranche, qui reformeraient une régularité.
 */
export function creneauxDuJour(
  combien: number,
  jour: Date,
  fuseau: string,
  fenetre: { de: number; a: number } = { de: 8, a: 19 },
  alea: Alea = Math.random,
): Date[] {
  if (combien <= 0) return []

  const decalage = decalageFuseauMinutes(fuseau, jour)
  const debutUtc =
    Date.UTC(jour.getUTCFullYear(), jour.getUTCMonth(), jour.getUTCDate(), fenetre.de, 0, 0) -
    decalage * 60_000
  const amplitude = (fenetre.a - fenetre.de) * 3_600_000
  const tranche = amplitude / combien

  const creneaux: Date[] = []
  for (let i = 0; i < combien; i++) {
    const bruit = tranche * (0.1 + alea() * 0.8)
    creneaux.push(new Date(debutUtc + i * tranche + bruit))
  }
  return creneaux
}

/**
 * Le délai avant de répondre à un message de chauffe.
 *
 * Loi log-uniforme entre 12 minutes et 7 heures : beaucoup de réponses rapides,
 * une longue traîne. C'est la forme observée chez de vrais gens — une réponse
 * en trente secondes, ou toujours au bout d'une heure pile, se repère.
 */
export function delaiDeReponseMs(alea: Alea = Math.random): number {
  const min = 12 * 60_000
  const max = 7 * 3_600_000
  return Math.exp(Math.log(min) + alea() * (Math.log(max) - Math.log(min)))
}
