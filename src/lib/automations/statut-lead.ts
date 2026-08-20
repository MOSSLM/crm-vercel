// statut-lead.ts — où en est un lead, sur deux axes plutôt qu'un.
//
// Module PUR : aucune base, aucun réseau. La lecture des faits est ailleurs
// (`buildSalesBoard` charge déjà tout le nécessaire — dériver ici n'ajoute pas
// une requête).
//
// POURQUOI DEUX AXES ET PAS SEIZE STATUTS
// lemlist affiche seize statuts de lead sur une seule ligne, et c'est ce qui
// les rend ambigus : un prospect peut être *Sent* ET *Paused*, *Interested* ET
// *Finished*. Ce ne sont pas deux valeurs du même champ, ce sont deux
// questions différentes :
//
//   PROGRESSION  où en est L'ENVOI — ce que le CRM fait.
//   ENGAGEMENT   ce que le PROSPECT a fait — ce qu'on a appris de lui.
//
// On les affiche ensemble, et on ne les résout en un seul badge que dans les
// listes serrées, avec un rang explicite écrit UNE SEULE FOIS (le précédent
// maison est `DELIVERY_RANK`, du webhook Resend).
//
// AUCUNE COLONNE DE STATUT N'EST STOCKÉE. Elle divergerait au premier UPDATE
// manqué, et le CRM a déjà payé cette leçon : `pipeline_events`, abandonnée
// après 18 écritures.
//
// LA RÈGLE QUI GOUVERNE TOUT LE FICHIER, héritée d'`etages.ts` mot pour mot :
// **un lead sans mesure n'est pas « pas ouvert », il est NON MESURÉ.** Un zéro
// et une absence de mesure ne sont pas la même chose — et depuis qu'on n'active
// ni pixel d'ouverture ni réécriture de liens (ils abîment la réputation de la
// boîte), l'absence de mesure est la règle, pas l'exception.

import type { MotifEcart, StatutListe } from '@/lib/automations/campagne'
import { ecartRattrapable } from '@/lib/automations/campagne'

// ── Axe 1 : la progression de l'envoi ───────────────────────────────────────

export type Progression =
  /** Dans la liste, mais il lui manque quelque chose de réparable (un canal, une affaire). */
  | 'a_preparer'
  /** Prêt, pas encore inscrit. */
  | 'a_lancer'
  /** Ne partira pas, et ça ne se répare pas. */
  | 'ecarte'
  /** Inscrit, la séquence avance. */
  | 'en_cours'
  /** Inscrit, mais quelque chose bloque — le motif se dit en français. */
  | 'gele'
  /** Inscription en pause : quelqu'un l'a arrêtée, elle repartira. */
  | 'en_pause'
  /** La séquence est allée au bout, ou le prospect en est sorti. */
  | 'termine'

export const PROGRESSION_LABEL: Readonly<Record<Progression, string>> = {
  a_preparer: 'À préparer',
  a_lancer: 'À lancer',
  ecarte: 'Écarté',
  en_cours: 'En cours',
  gele: 'Gelé',
  en_pause: 'En pause',
  termine: 'Terminé',
}

/** Ce qu'on sait de l'avancement de l'envoi pour ce lead. */
export interface FaitsProgression {
  /** Sa ligne de liste de campagne, quand il en a une. */
  statutListe?: StatutListe | null
  motifEcart?: MotifEcart | null
  /** Son inscription vivante, quand il en a une. */
  inscription?: {
    status: string
    holdReason?: string | null
    nextRunAt?: string | null
  } | null
  /** Tâches manuelles encore ouvertes : une inscription qui les attend n'est pas gelée. */
  tachesEnAttente?: number
}

/**
 * Où en est l'envoi pour ce lead.
 *
 * L'INSCRIPTION PRIME SUR LA LISTE. Un prospect inscrit est parti : ce que sa
 * ligne de liste raconte n'a plus cours. L'inverse — laisser la liste décider —
 * ferait afficher « à lancer » à quelqu'un qui reçoit un message ce matin.
 */
export function progressionDuLead(faits: FaitsProgression): Progression {
  const inscription = faits.inscription
  if (inscription) {
    if (inscription.status === 'paused') return 'en_pause'
    if (inscription.status !== 'active') return 'termine'
    if (inscription.holdReason) return 'gele'
    // Ni réveil, ni motif, ni tâche : l'inscription est enlisée. On ne
    // l'affiche pas « en cours » — c'est exactement le mensonge qui a laissé
    // 59 inscriptions dormir sans que personne le voie.
    if (!inscription.nextRunAt && (faits.tachesEnAttente ?? 0) === 0) return 'gele'
    return 'en_cours'
  }

  if (faits.statutListe === 'termine') return 'termine'
  // La liste dit « inscrit » mais l'inscription n'a pas été chargée : on dit ce
  // qu'on sait — il est parti — plutôt que d'inventer qu'il est arrivé au bout.
  if (faits.statutListe === 'inscrit') return 'en_cours'
  if (faits.statutListe === 'ecarte') {
    // Un écart réparable n'est pas un refus : c'est une tâche d'enrichissement.
    // Les confondre, c'est ranger 44 prospects sans canal au cimetière.
    return ecartRattrapable(faits.motifEcart) ? 'a_preparer' : 'ecarte'
  }
  return 'a_lancer'
}

// ── Axe 2 : l'engagement du prospect ────────────────────────────────────────

export type Engagement =
  /** RIEN N'A ÉTÉ MESURÉ. Ce n'est pas « aucune réaction » — c'est aucune mesure. */
  | 'non_mesure'
  | 'envoye'
  | 'remis'
  | 'echec'
  | 'rebond'
  /** A ouvert un lien à jeton : rapport d'audit, plaquette, démo. Compté côté serveur. */
  | 'vu'
  | 'repondu'
  | 'plus_tard'
  | 'interesse'
  | 'pas_interesse'
  | 'desabonne'

export const ENGAGEMENT_LABEL: Readonly<Record<Engagement, string>> = {
  non_mesure: 'Non mesuré',
  envoye: 'Envoyé',
  remis: 'Remis',
  echec: 'Échec d’envoi',
  rebond: 'Rebond',
  vu: 'A consulté',
  repondu: 'A répondu',
  plus_tard: 'Plus tard',
  interesse: 'Intéressé',
  pas_interesse: 'Pas intéressé',
  desabonne: 'Désabonné',
}

/**
 * Le rang d'un engagement — écrit UNE SEULE FOIS, ici.
 *
 * DEUX FAMILLES, ET LA SECONDE GAGNE TOUJOURS. Sous 50, ce que le TRANSPORT
 * raconte (parti, remis, rebondi) ; au-dessus, ce que le PROSPECT a fait. Un
 * humain qui répond vaut plus qu'un serveur qui accuse réception, et un rebond
 * ne doit jamais masquer une réponse arrivée par ailleurs.
 *
 * Dans chaque famille, le rang va du moins au plus décisif. Le désabonnement
 * est au sommet : il est terminal, et il engage au-delà du commercial.
 */
export const RANG_ENGAGEMENT: Readonly<Record<Engagement, number>> = {
  non_mesure: 0,
  envoye: 10,
  remis: 20,
  echec: 30,
  rebond: 40,
  vu: 50,
  repondu: 60,
  plus_tard: 70,
  interesse: 80,
  pas_interesse: 90,
  desabonne: 100,
}

/** Ce qu'on a appris du prospect. Tout est optionnel : rien su ≠ rien fait. */
export interface FaitsEngagement {
  /** Messages qui lui ont été adressés (`email_logs`, tous canaux). */
  envois?: number
  /** Le transport a accusé réception d'au moins un envoi. */
  remis?: boolean
  /** Rebond dur encaissé. */
  rebond?: boolean
  /** L'envoi a échoué avant d'atteindre le transport. */
  echecEnvoi?: boolean
  /**
   * Vues de liens à jeton — rapport, plaquette, démo — comptées côté serveur.
   *
   * C'EST NOTRE « OUVERTURE », ET ELLE EST MEILLEURE QUE LA LEUR. Le pixel
   * d'ouverture de lemlist est gonflé par la protection d'Apple Mail et abîme
   * la réputation de la boîte ; un lien à jeton consulté dit qu'un humain a
   * cliqué, sans rien coûter à la délivrabilité.
   */
  vuesLiens?: number
  /** Une réponse enregistrée sur l'inscription (`vars.replies`), la seule source honnête. */
  aRepondu?: boolean
  /** Les issues déclarées dans le fil (`email_logs.outcome`). */
  issues?: readonly string[]
  desabonne?: boolean
}

/** Ce qu'une issue déclarée dit de l'engagement. `no_answer` n'en dit rien. */
const ENGAGEMENT_PAR_ISSUE: Readonly<Record<string, Engagement>> = {
  answered: 'interesse',
  later: 'plus_tard',
  not_interested: 'pas_interesse',
  blocked: 'desabonne',
}

/**
 * Ce que le prospect a fait de plus décisif.
 *
 * Un seul mot, choisi par le rang : on ne perd pas une réponse parce qu'un
 * envoi ultérieur a rebondi.
 */
export function engagementDuLead(faits: FaitsEngagement): Engagement {
  const candidats: Engagement[] = ['non_mesure']

  if ((faits.envois ?? 0) > 0) candidats.push('envoye')
  if (faits.remis) candidats.push('remis')
  if (faits.echecEnvoi) candidats.push('echec')
  if (faits.rebond) candidats.push('rebond')
  if ((faits.vuesLiens ?? 0) > 0) candidats.push('vu')
  if (faits.aRepondu) candidats.push('repondu')
  if (faits.desabonne) candidats.push('desabonne')
  for (const issue of faits.issues ?? []) {
    const e = ENGAGEMENT_PAR_ISSUE[issue]
    if (e) candidats.push(e)
  }

  return candidats.reduce((a, b) => (RANG_ENGAGEMENT[b] > RANG_ENGAGEMENT[a] ? b : a))
}

/**
 * Cet engagement repose-t-il sur une mesure ?
 *
 * `non_mesure` doit s'afficher autrement qu'un zéro — en gris, avec « non
 * mesuré » et non « aucune réaction ». Tout le reste du fichier découle de là.
 */
export const estMesure = (engagement: Engagement): boolean => engagement !== 'non_mesure'

// ── L'entonnoir : une PARTITION, jamais des compteurs qu'on additionne ──────

export type Etage =
  | 'a_preparer'
  | 'a_lancer'
  | 'ecarte'
  | 'contacte'
  | 'consulte'
  | 'repondu'
  | 'interesse'
  | 'refuse'
  | 'injoignable'

export const ETAGES: readonly Etage[] = [
  'a_preparer',
  'a_lancer',
  'ecarte',
  'contacte',
  'consulte',
  'repondu',
  'interesse',
  'refuse',
  'injoignable',
]

export const ETAGE_LABEL: Readonly<Record<Etage, string>> = {
  a_preparer: 'À préparer',
  a_lancer: 'À lancer',
  ecarte: 'Écartés',
  contacte: 'Contactés',
  consulte: 'Ont consulté',
  repondu: 'Ont répondu',
  interesse: 'Intéressés',
  refuse: 'Ont refusé',
  injoignable: 'Injoignables',
}

/**
 * L'étage unique de ce lead.
 *
 * C'EST LA RÉPONSE AU GRIEF N° 2. Les compteurs du haut de la page Démarchage
 * comptent le même prospect dans « en attente » ET dans « à appeler », et
 * personne ne sait plus combien de gens il y a. Ici un lead est à UN SEUL
 * étage — le plus loin qu'il ait atteint — et la somme des étages égale le
 * nombre de leads. Les signaux restent des filtres cumulables ; ils ne
 * redeviennent jamais des compteurs qu'on additionne.
 */
export function etageDuLead(progression: Progression, engagement: Engagement): Etage {
  // Ce que le prospect a dit passe avant où en est l'envoi : un « pas
  // intéressé » reste un refus même si la séquence continue de tourner.
  if (engagement === 'desabonne' || engagement === 'pas_interesse') return 'refuse'
  if (engagement === 'rebond' || engagement === 'echec') return 'injoignable'
  if (engagement === 'interesse' || engagement === 'plus_tard') return 'interesse'
  if (engagement === 'repondu') return 'repondu'
  if (engagement === 'vu') return 'consulte'

  if (progression === 'a_preparer') return 'a_preparer'
  if (progression === 'ecarte') return 'ecarte'
  if (progression === 'a_lancer') return 'a_lancer'
  // Inscrit, gelé, en pause ou terminé sans que le prospect ait rien dit : il a
  // été contacté, et c'est tout ce qu'on sait de lui.
  return 'contacte'
}

/** Le décompte d'un entonnoir. Sa somme égale le nombre de leads, par construction. */
export function entonnoir(
  leads: readonly { progression: Progression; engagement: Engagement }[],
): { etage: Etage; n: number; label: string }[] {
  const compte = new Map<Etage, number>()
  for (const lead of leads) {
    const etage = etageDuLead(lead.progression, lead.engagement)
    compte.set(etage, (compte.get(etage) ?? 0) + 1)
  }
  return ETAGES.filter((e) => (compte.get(e) ?? 0) > 0).map((etage) => ({
    etage,
    n: compte.get(etage) ?? 0,
    label: ETAGE_LABEL[etage],
  }))
}
