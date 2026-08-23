// annulation.ts — ce qu'un geste a écrasé, et si on peut le reposer.
//
// LE BESOIN. « Fait » et « Ignorer » n'avaient pas de retour en arrière. Un
// agent qui coche « message envoyé » alors qu'il ne l'a pas envoyé, ou qui
// saute une étape d'un doigt malheureux, laissait la séquence dans un état
// faux et définitif. Ce module dit ce qu'il faut photographier avant d'agir,
// et si la photo peut encore être reposée.
//
// POURQUOI UNE PHOTO ET PAS UN CALCUL INVERSE. Un « Fait » touche cinq choses
// d'un coup — la tâche, l'inscription, la première touche de l'entreprise,
// l'étape de l'affaire, la tâche fille créée dans la foulée. Et l'avancement
// n'est pas une addition : `avancerApres` incrémente des compteurs de tours,
// réancre les délais, lit des sacs de variables qu'il réécrit. Reconstituer
// l'avant depuis l'après serait deviner. On garde l'avant.
//
// CE QUE L'ANNULATION NE PROMET PAS : elle rembobine notre comptabilité, elle
// ne rappelle aucun message. C'est la raison d'être du verdict ci-dessous —
// mieux vaut refuser en nommant l'envoi que rendre un état propre en faisant
// partir le même message deux fois chez le même artisan.

export const GESTES = ['terminer', 'ignorer', 'reporter'] as const
export type TypeGeste = (typeof GESTES)[number]

/**
 * Les colonnes de la tâche qu'un geste modifie — donc celles à photographier,
 * et exactement celles à reposer.
 *
 * LA LISTE EST ICI ET NULLE PART AILLEURS. Photographier six colonnes et en
 * restaurer cinq rendrait une annulation qui a l'air d'avoir marché : le seul
 * moyen de s'en apercevoir serait de relire les deux listes côte à côte, six
 * mois plus tard, en cherchant autre chose.
 */
export const CHAMPS_TACHE = ['status', 'done_at', 'due_at', 'payload'] as const

/** Les colonnes de l'inscription qu'un avancement déplace. */
export const CHAMPS_INSCRIPTION = [
  'current_step',
  'status',
  'next_run_at',
  'send_at',
  'hold_reason',
  'vars',
  'anchor_at',
  'anchor_step',
  'exit_reason',
  'finished_at',
  'last_email_at',
] as const

type Ligne = Record<string, unknown>

/** La photo d'avant, telle qu'elle part en base et telle qu'elle en revient. */
export interface PhotoAvant {
  tache: Ligne
  inscription: Ligne | null
  /**
   * `premiere_touche_le` valait-il `null` avant le geste ? On ne garde pas la
   * valeur mais le FAIT QU'ELLE ÉTAIT ABSENTE : c'est la seule chose que
   * « Fait » peut avoir changée, puisqu'il ne l'écrit que si elle est nulle.
   * L'annulation la remet à null dans ce cas, et n'y touche pas sinon — sans
   * quoi elle effacerait la date d'un contact antérieur bien réel.
   */
  premiereTouchePosee: boolean
  /** L'étape de l'affaire avant que l'issue ne la déplace. */
  stageId: number | null
}

/** Ce qu'on sait au moment de décider si l'annulation est possible. */
export interface ContexteAnnulation {
  dejaAnnule: boolean
  /** La tâche existe-t-elle encore ? */
  tacheAbsente: boolean
  /** Un geste plus récent porte la même inscription. */
  gestePlusRecent: { geste: TypeGeste; le: string } | null
  /** Messages RÉELLEMENT partis depuis le geste, sur cette inscription. */
  envoisDepuis: number
}

export interface Verdict {
  possible: boolean
  /** La phrase qu'on affiche — jamais un booléen nu. */
  motif: string
}

const LIBELLES: Record<TypeGeste, string> = {
  terminer: 'terminée',
  ignorer: 'ignorée',
  reporter: 'reportée',
}

/** « terminée », « ignorée », « reportée » — pour écrire des phrases. */
export const libelleGeste = (geste: TypeGeste): string => LIBELLES[geste] ?? geste

const leJour = (iso: string): string => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}

/**
 * Peut-on reposer la photo ?
 *
 * L'ORDRE DES REFUS EST L'ORDRE DE CE QU'ILS APPRENNENT. « Déjà annulé » se dit
 * avant « un geste plus récent », parce qu'un geste annulé n'a plus de suite à
 * discuter. Et l'envoi se dit en dernier parce que c'est le seul refus qui
 * porte une mauvaise nouvelle : le prospect a reçu quelque chose.
 */
export function verdictAnnulation(contexte: ContexteAnnulation): Verdict {
  if (contexte.dejaAnnule) {
    return { possible: false, motif: 'Ce geste a déjà été annulé.' }
  }

  if (contexte.tacheAbsente) {
    return {
      possible: false,
      motif: 'La tâche a été supprimée depuis : il n’y a plus rien à reposer.',
    }
  }

  if (contexte.gestePlusRecent) {
    const { geste, le } = contexte.gestePlusRecent
    return {
      possible: false,
      // ON DÉPILE, COMME TOUTE PILE D'ANNULATION. Restaurer le geste du dessous
      // écraserait ce que celui du dessus a écrit — l'inscription se
      // retrouverait dans un état qui n'a jamais existé.
      motif:
        `Une tâche plus récente de ce prospect a été ${libelleGeste(geste)} le ${leJour(le)}. ` +
        'Il faut annuler celle-là d’abord : reposer celui-ci écraserait ce qu’elle a écrit.',
    }
  }

  if (contexte.envoisDepuis > 0) {
    const pluriel = contexte.envoisDepuis > 1
    return {
      possible: false,
      // LE SEUL REFUS QUI DIT UNE MAUVAISE NOUVELLE, ET IL LA DIT EN ENTIER.
      // Revenir en arrière ferait repartir le même message une seconde fois.
      // Deux messages identiques chez un artisan coûtent plus cher que l'état
      // faux qu'on voulait corriger.
      motif:
        `${contexte.envoisDepuis} message${pluriel ? 's sont partis' : ' est parti'} vers ce prospect ` +
        'depuis ce geste. Revenir en arrière le ferait repartir une seconde fois : ' +
        'l’état est faux, mais le prospect, lui, a bien reçu.',
    }
  }

  return { possible: true, motif: 'Rien n’est parti depuis : le retour en arrière est exact.' }
}

/**
 * Ce que l'annulation va reposer, en une phrase.
 *
 * Sert de libellé au bouton et de texte de confirmation : un bouton
 * « Annuler » sans son objet est un bouton qu'on n'ose pas cliquer.
 */
export function resumeAnnulation(photo: PhotoAvant): string {
  const morceaux: string[] = []

  const statut = photo.tache.status
  if (typeof statut === 'string') morceaux.push(`la tâche redevient « ${statut} »`)

  const etape = photo.inscription?.current_step
  if (typeof etape === 'number') morceaux.push(`la séquence revient à l’étape ${etape + 1}`)

  if (photo.premiereTouchePosee) morceaux.push('la date de premier contact est retirée')
  if (photo.stageId != null) morceaux.push('l’affaire retrouve son étape')

  return morceaux.length > 0 ? morceaux.join(', ') : 'l’état précédent est reposé'
}

/**
 * Ne garder d'une ligne que les colonnes qu'on sait reposer.
 *
 * Photographier la ligne entière serait plus simple et faux : on reposerait
 * `updated_at` et `id`, et le déclencheur d'horodatage se battrait avec nous.
 */
export function photographier(ligne: Ligne | null, champs: readonly string[]): Ligne | null {
  if (!ligne) return null
  const photo: Ligne = {}
  for (const champ of champs) photo[champ] = ligne[champ] ?? null
  return photo
}
