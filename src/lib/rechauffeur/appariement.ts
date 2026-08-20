// appariement.ts — à qui écrit-on aujourd'hui.
//
// PORTÉ DE `/Users/matt/Code/email-warmup/src/lib/warmup/pairing.ts`.
//
// CHEZ NOUS IL N'Y A QUE DES TÉMOINS, et ce n'est pas une simplification : le
// réchauffeur d'origine faisait s'écrire ses propres boîtes entre elles, parce
// que chacune était à la fois expéditrice et réceptrice. Notre expéditeur est
// une adresse `@samadigitalstudio.fr` qui part par Resend — et ce domaine n'a
// AUCUN MX. Il ne peut rien recevoir. Un envoi de nous vers nous n'existe donc
// pas, et n'apprendrait rien à personne : la réputation se construit chez le
// fournisseur du DESTINATAIRE, pas chez soi.
//
// TROIS RÈGLES, PAR ORDRE D'IMPORTANCE
//   1. la diversité de fournisseur — c'est le seul signal qui vaut quelque
//      chose : cent messages tous chez Gmail ne disent rien d'Orange ;
//   2. pas deux fois le même destinataire en moins de quatre jours ;
//   3. jamais au-delà du plafond de réception d'un témoin.
//
// CE QUI CHANGE DANS LE TIRAGE. L'original pénalisait un témoin déjà choisi de
// −3 sans jamais l'exclure : avec trois témoins et douze envois à faire, il
// écrivait quatre fois à chacun le même jour. Ici le plafond est une EXCLUSION,
// et la fonction rend MOINS que demandé plutôt que de marteler trois adresses.
// Un maillage trop petit doit se voir à l'écran, pas se compenser en silence.

import type { Alea } from './courbe'
import type { Famille } from './sante'

export interface Temoin {
  id: string
  email: string
  nom: string
  famille: Famille
  /** Combien de messages de chauffe ce témoin accepte par jour. */
  plafondJour: number
  /** Probabilité qu'il réponde, 0 à 1. */
  tauxReponse: number
  actif: boolean
}

export interface HistoriqueAppariement {
  /** Adresses déjà servies par cet expéditeur depuis quatre jours, en minuscules. */
  recents: readonly string[]
  /** Nombre de messages déjà reçus aujourd'hui, par identifiant de témoin. */
  chargeDuJour: Readonly<Record<string, number>>
}

// Les poids du tirage. Ils sont nommés parce qu'un nombre nu dans une somme de
// scores devient, six mois plus tard, un nombre que personne n'ose changer.
const POIDS = {
  /** Bruit : deux journées consécutives ne doivent pas se ressembler. */
  bruit: 0.5,
  /** Chaque message déjà envoyé à cette famille aujourd'hui coûte cher. */
  familleDejaServie: 0.9,
  /** Servi dans les quatre derniers jours : fortement dépriorisé. */
  recent: 2,
  /** Déjà servi aujourd'hui : ne passe qu'une fois les autres épuisés. */
  dejaAujourdHui: 3,
}

/**
 * Choisit les destinataires du jour.
 *
 * Rend au plus `combien` témoins, dans l'ordre où les messages doivent partir —
 * l'appelant y superpose les créneaux de `creneauxDuJour`.
 */
export function choisirTemoins(
  temoins: readonly Temoin[],
  combien: number,
  historique: HistoriqueAppariement,
  alea: Alea = Math.random,
): Temoin[] {
  if (combien <= 0) return []

  const recents = new Set(historique.recents.map((e) => e.toLowerCase()))
  const charge = new Map<string, number>(
    temoins.map((t) => [t.id, historique.chargeDuJour[t.id] ?? 0]),
  )

  const eligibles = temoins.filter((t) => t.actif && t.plafondJour > 0)
  const choisis: Temoin[] = []
  const parFamille = new Map<Famille, number>()

  for (let i = 0; i < combien; i++) {
    let meilleur: Temoin | null = null
    let meilleurScore = -Infinity

    for (const t of eligibles) {
      const dejaRecu = charge.get(t.id) ?? 0
      if (dejaRecu >= t.plafondJour) continue // plafond : exclusion, pas pénalité

      let score = alea() * POIDS.bruit
      score -= (parFamille.get(t.famille) ?? 0) * POIDS.familleDejaServie
      if (recents.has(t.email.toLowerCase())) score -= POIDS.recent
      score -= dejaRecu * POIDS.dejaAujourdHui

      if (score > meilleurScore) {
        meilleurScore = score
        meilleur = t
      }
    }

    if (!meilleur) break // plus personne d'éligible : on rend moins, et ça se dit
    choisis.push(meilleur)
    charge.set(meilleur.id, (charge.get(meilleur.id) ?? 0) + 1)
    parFamille.set(meilleur.famille, (parFamille.get(meilleur.famille) ?? 0) + 1)
  }

  return choisis
}

/**
 * La capacité de chauffe qu'un maillage autorise réellement aujourd'hui.
 *
 * Sert à dire à l'écran « la courbe demande 24, le maillage n'en porte que 9 »
 * plutôt que de laisser croire que la chauffe suit son palier.
 */
export function capaciteDuMaillage(
  temoins: readonly Temoin[],
  chargeDuJour: Readonly<Record<string, number>>,
): number {
  return temoins
    .filter((t) => t.actif)
    .reduce((n, t) => n + Math.max(0, t.plafondJour - (chargeDuJour[t.id] ?? 0)), 0)
}

/** Décide si ce témoin répond à ce message. */
export function doitRepondre(temoin: Temoin, alea: Alea = Math.random): boolean {
  return alea() < temoin.tauxReponse
}

/**
 * Ce qui manque au maillage pour être crédible.
 *
 * Un maillage sans Orange ni Free ne dit rien du parc de nos prospects : ce
 * sont les deux fournisseurs les plus répandus chez les artisans français, et
 * les deux que les réseaux de chauffe américains ignorent.
 */
export function famillesManquantes(temoins: readonly Temoin[]): Famille[] {
  const presentes = new Set(temoins.filter((t) => t.actif).map((t) => t.famille))
  const attendues: Famille[] = ['google', 'microsoft', 'yahoo', 'orange', 'free']
  return attendues.filter((f) => !presentes.has(f))
}

/**
 * La famille d'une adresse, déduite de son domaine.
 *
 * Sert à ce que l'humain n'ait pas à la choisir dans une liste : il tape
 * l'adresse, la famille se met toute seule. Les alias français comptent —
 * `wanadoo.fr` est Orange, et c'est encore l'adresse d'une part des artisans.
 */
export function familleDuDomaine(email: string): Famille {
  const domaine = (email.split('@')[1] ?? '').toLowerCase()
  if (/(^|\.)gmail\.com$|(^|\.)googlemail\.com$/.test(domaine)) return 'google'
  if (/(^|\.)(outlook|hotmail|live|msn)\./.test(domaine)) return 'microsoft'
  if (/(^|\.)yahoo\./.test(domaine)) return 'yahoo'
  if (/(^|\.)(orange|wanadoo)\.fr$/.test(domaine)) return 'orange'
  if (/(^|\.)(free|aliceadsl)\.fr$/.test(domaine)) return 'free'
  return 'autre'
}
