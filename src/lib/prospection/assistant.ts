// assistant.ts — décrire un objectif, obtenir une campagne à valider. Pur.
//
// ─────────────────────────────────────────────────────────────────────────────
// POURQUOI CE MODULE NE FAIT PAS APPEL À UN LLM
// ─────────────────────────────────────────────────────────────────────────────
// lemAgent, chez lemlist, rédige. Ici, rédiger serait le mauvais problème :
//
//   · LES MESSAGES EXISTENT DÉJÀ — 8 modèles WhatsApp, 7 e-mails, 6 scripts
//     d'appel, écrits et relus. « On ne part jamais d'une page blanche » se
//     répond par la bibliothèque, pas par la génération.
//   · CE QUI MANQUE N'EST PAS LA PROSE, C'EST L'ARBITRAGE. La faute qu'on
//     commet vraiment en montant une campagne est de choisir une séquence que
//     le fichier ne peut pas porter : « 30 jours équilibré » compte quatre
//     e-mails nominatifs, et 75 entreprises sur 908 ont un contact nominatif.
//     Un LLM ne connaît pas ce chiffre ; ce module, si.
//   · ET UN TEXTE GÉNÉRÉ SERAIT RELU DE TOUTE FAÇON. Il partirait chez de vrais
//     artisans : personne ne l'enverra sans le lire, donc la génération ne fait
//     économiser aucune relecture — seulement de la frappe.
//
// D'où le choix : l'assistant ASSEMBLE, il ne rédige pas. Il est déterministe,
// donc éprouvable sans base et sans réseau, et il rend des RÉSERVES chiffrées
// plutôt qu'une confiance.
//
// ─────────────────────────────────────────────────────────────────────────────
// LA LECTURE DE LA PHRASE DIT CE QU'ELLE N'A PAS COMPRIS
// ─────────────────────────────────────────────────────────────────────────────
// C'est la seule chose qui rend un analyseur par mots-clés acceptable. Il ne
// devine pas : il rend `comprises` et `ignorees`, et l'écran montre les deux.
// Un analyseur qui avale silencieusement « en Gironde » construirait une
// campagne nationale en ayant l'air d'avoir obéi.

/* ── Ce qu'on sait lire dans une phrase ──────────────────────────────────── */

export type Canal = 'whatsapp' | 'email' | 'call' | 'sms'

export interface Intention {
  /** A · site faible (refonte) · B · sans site (création). */
  cohorte: 'A_site_faible' | 'B_sans_site' | null
  /** Le canal demandé explicitement. Nul = on le déduit des canaux disponibles. */
  canal: Canal | null
  /** Ne viser que ceux qu'on n'a jamais touchés. */
  jamaisTouches: boolean
  /** Ne viser que ceux qui sont restés silencieux. */
  sansReponse: boolean
  /** Le RGE qui expire — la seule veille qui fasse aussi une audience. */
  rgeQuiExpire: boolean
  /** Les mots reconnus, dans l'ordre de la phrase. */
  comprises: string[]
  /** Les mots signifiants que rien n'a captés — montrés à l'écran, jamais avalés. */
  ignorees: string[]
}

/** Les mots vides : les ignorer n'est pas un aveu d'échec, c'est du français. */
const VIDES = new Set([
  'les', 'le', 'la', 'des', 'de', 'du', 'un', 'une', 'et', 'ou', 'à', 'au', 'aux', 'en', 'pour',
  'qui', 'que', 'quoi', 'dans', 'sur', 'avec', 'sans', 'par', 'je', 'veux', 'voudrais', 'faire',
  'monter', 'créer', 'lancer', 'campagne', 'sequence', 'séquence', 'leur', 'ceux', 'celles', 'on',
  'est', 'sont', 'ont', 'pas', 'ne', 'plus', 'tous', 'toutes', 'nos', 'mes', 'ils', 'elles',
])

const sansAccents = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

const contient = (t: string, ...motifs: string[]) => motifs.some((m) => t.includes(m))

/**
 * Lire l'objectif. Rend TOUJOURS une intention — même vide, ce qui veut dire
 * « je n'ai rien compris », et l'écran doit le dire plutôt que de proposer une
 * campagne sur tout le parc.
 */
export function lireLObjectif(phrase: string): Intention {
  const t = sansAccents(phrase.toLowerCase())
  const comprises: string[] = []
  const marquer = (mot: string) => comprises.push(mot)

  let cohorte: Intention['cohorte'] = null
  if (contient(t, 'sans site', 'pas de site', 'aucun site', 'cohorte b')) {
    cohorte = 'B_sans_site'
    marquer('sans site')
  } else if (contient(t, 'site faible', 'mauvais site', 'vieux site', 'refonte', 'cohorte a')) {
    cohorte = 'A_site_faible'
    marquer('site faible')
  }

  let canal: Canal | null = null
  if (contient(t, 'whatsapp', 'wa ')) { canal = 'whatsapp'; marquer('whatsapp') }
  else if (contient(t, 'appel', 'telephone', 'appeler')) { canal = 'call'; marquer('appel') }
  else if (contient(t, 'sms')) { canal = 'sms'; marquer('sms') }
  else if (contient(t, 'mail', 'email', 'e-mail')) { canal = 'email'; marquer('e-mail') }

  const jamaisTouches = contient(t, 'jamais touche', 'jamais contacte', 'premier contact', 'nouveaux', 'neufs')
  if (jamaisTouches) marquer('jamais touchés')

  const sansReponse = contient(t, 'sans reponse', 'pas repondu', 'silencieux', 'relance', 'relancer')
  if (sansReponse) marquer('sans réponse')

  const rgeQuiExpire = contient(t, 'rge')
  if (rgeQuiExpire) marquer('RGE qui expire')

  // Ce qui reste. On ne garde que les mots qui PORTENT quelque chose — un
  // analyseur qui listerait « les » et « pour » en « non compris » ferait du
  // bruit et on cesserait de lire la liste.
  const reconnus = sansAccents(comprises.join(' ').toLowerCase())
  const ignorees = t
    .split(/[^a-z0-9']+/)
    .filter((m) => m.length > 3 && !VIDES.has(m) && !reconnus.includes(m))

  return { cohorte, canal, jamaisTouches, sansReponse, rgeQuiExpire, comprises, ignorees: [...new Set(ignorees)] }
}

/* ── Ce que le fichier peut porter ───────────────────────────────────────── */

/**
 * Les effectifs mesurés qui décident du choix. Ce ne sont pas des réglages :
 * ce sont des CHIFFRES DE LA BASE, relevés par la route avant d'appeler ce
 * module. Les coder en dur ici les figerait au 20/08/2026.
 */
export interface Densites {
  total: number
  avecEmail: number
  avecMobile: number
  avecFixe: number
  contactNominatif: number
  cohorteA: number
  cohorteB: number
  jamaisTouches: number
}

export interface EtapeProposee {
  jour: number
  canal: Canal
  quoi: string
  /** Le modèle de la bibliothèque, s'il en existe un qui convient. */
  modele: string | null
}

export interface Proposition {
  /** Le nom proposé, dérivé de ce qui a été compris. */
  nom: string
  /** Combien de fiches la campagne viserait, après tous les filtres. */
  cible: number
  /** Ce qui a servi à filtrer, en clair. */
  filtres: string[]
  canal: Canal
  etapes: EtapeProposee[]
  /**
   * Ce que la proposition NE garantit pas, chiffré. C'est la partie utile :
   * une campagne qu'on lance sans ses réserves est une campagne dont on
   * découvre les trous après le premier envoi.
   */
  reserves: string[]
}

/** La part du fichier joignable sur un canal donné. */
const joignables = (d: Densites, canal: Canal): number => {
  if (canal === 'email') return d.avecEmail
  if (canal === 'whatsapp' || canal === 'sms') return d.avecMobile
  return d.avecFixe + d.avecMobile
}

const LIBELLE_CANAL: Record<Canal, string> = {
  whatsapp: 'WhatsApp',
  email: 'e-mail',
  call: 'appel',
  sms: 'SMS',
}

/**
 * Le canal par défaut, décidé par la DENSITÉ et non par une préférence.
 *
 * L'ordre n'est pas arbitraire : au 20/08/2026 le mobile touche 394 fiches,
 * l'e-mail 478 et le fixe 466 — mais l'e-mail générique (`contact@`) se lit
 * moins bien qu'un WhatsApp, et c'est la seule séquence dont l'usage a validé
 * quelque chose (153 inscrits). À égalité, on garde ce qui a déjà tourné.
 */
function canalParDefaut(d: Densites): Canal {
  if (d.avecMobile >= d.avecEmail * 0.8) return 'whatsapp'
  if (d.avecEmail > 0) return 'email'
  return 'call'
}

/**
 * Assembler la proposition.
 *
 * Ce que ce module NE fait pas : écrire les messages, et créer la campagne.
 * Il rend une proposition que quelqu'un valide — c'est l'écran de lancement,
 * déjà en place, qui fait foi.
 */
export function proposer(intention: Intention, d: Densites): Proposition {
  const filtres: string[] = []
  const reserves: string[] = []
  let cible = d.total

  if (intention.cohorte === 'A_site_faible') {
    cible = Math.min(cible, d.cohorteA)
    filtres.push('cohorte A — site faible')
  } else if (intention.cohorte === 'B_sans_site') {
    cible = Math.min(cible, d.cohorteB)
    filtres.push('cohorte B — sans site')
  }

  if (intention.jamaisTouches) {
    cible = Math.min(cible, d.jamaisTouches)
    filtres.push('jamais touchés')
  }

  const canal = intention.canal ?? canalParDefaut(d)
  const portee = joignables(d, canal)
  cible = Math.min(cible, portee)
  filtres.push(`joignables en ${LIBELLE_CANAL[canal]}`)

  // ── Les réserves, et elles sont le cœur du module ───────────────────────
  //
  // Un canal demandé explicitement peut ne toucher qu'une partie du fichier :
  // le dire AVANT le lancement évite de découvrir le trou au premier envoi.
  if (intention.canal && portee < d.total) {
    const perdus = d.total - portee
    reserves.push(
      `${perdus} fiche${perdus > 1 ? 's' : ''} sur ${d.total} n’${perdus > 1 ? 'ont' : 'a'} pas de ${LIBELLE_CANAL[canal]} : elles resteront hors de cette campagne.`,
    )
  }

  // LA RÉSERVE QUI COMPTE LE PLUS. C'est elle qui interdit de proposer « 30
  // jours équilibré » en tête du catalogue : une séquence nominative sur un
  // fichier générique écrit « Bonjour Cédric » à `contact@`.
  if (canal === 'email' && d.contactNominatif < d.avecEmail) {
    const part = d.avecEmail > 0 ? Math.round((d.contactNominatif / d.avecEmail) * 100) : 0
    reserves.push(
      `${d.contactNominatif} adresse${d.contactNominatif > 1 ? 's' : ''} sur ${d.avecEmail} sont nominatives (${part} %) : le ton doit rester d’entreprise à entreprise, pas de prénom en accroche.`,
    )
  }

  if (intention.sansReponse) {
    reserves.push(
      'Cibler les silencieux suppose une voie « sans réponse » écrite : sans elle, la relance envoie le message prévu pour quelqu’un qui vient de parler.',
    )
  }

  if (intention.rgeQuiExpire) {
    reserves.push(
      'Le RGE qui expire est une VEILLE, pas une audience figée : la population change chaque jour. Passer par Signaux plutôt que par une liste.',
    )
  }

  if (intention.comprises.length === 0) {
    reserves.push(
      'Rien n’a été compris dans l’objectif : la proposition porte sur tout le portefeuille. Précisez la cohorte, le canal, ou l’état du contact.',
    )
  }

  if (intention.ignorees.length > 0) {
    reserves.push(
      `Non pris en compte : ${intention.ignorees.join(', ')}. Ces critères n’existent pas dans l’explorateur — ils ne filtrent rien.`,
    )
  }

  return {
    nom: nommer(intention, canal),
    cible,
    filtres,
    canal,
    etapes: assembler(canal, intention),
    reserves,
  }
}

function nommer(intention: Intention, canal: Canal): string {
  const bouts: string[] = []
  if (intention.cohorte === 'A_site_faible') bouts.push('Site faible')
  else if (intention.cohorte === 'B_sans_site') bouts.push('Sans site')
  if (intention.jamaisTouches) bouts.push('premiers contacts')
  if (intention.sansReponse) bouts.push('relance')
  bouts.push(LIBELLE_CANAL[canal])
  return bouts.join(' — ')
}

/**
 * Les étapes, tirées de ce qui a déjà tourné.
 *
 * La forme est celle de la séquence en service depuis le 20/08 : accroche →
 * attente AVEC DÉLAI → deux voies (répondu / silence) → appel. Le délai n'est
 * jamais nul : c'est l'attente sans limite qui a gelé 59 inscriptions, et une
 * proposition qui la reproduirait recréerait le problème dans chaque nouvelle
 * campagne.
 */
function assembler(canal: Canal, intention: Intention): EtapeProposee[] {
  const accroche =
    intention.cohorte === 'B_sans_site'
      ? 'Accroche — création de site'
      : intention.cohorte === 'A_site_faible'
        ? 'Accroche — refonte'
        : 'Accroche'

  const etapes: EtapeProposee[] = [
    { jour: 0, canal, quoi: accroche, modele: null },
    { jour: 0, canal, quoi: 'Attente de réponse — 3 jours, jamais sans limite', modele: null },
    { jour: 0, canal, quoi: 'Voie « a répondu » — envoi de la démo', modele: null },
    { jour: 0, canal, quoi: 'Voie « sans réponse » — relance', modele: null },
  ]

  // L'appel ferme la séquence : c'est la forme des six séquences existantes, et
  // elle a une FIN explicite — ce que le plan reproche justement aux nôtres de
  // ne pas toujours avoir.
  if (canal !== 'call') {
    etapes.push({ jour: 3, canal: 'call', quoi: 'Appel', modele: null })
  }
  etapes.push({ jour: 8, canal, quoi: 'Clôture — sortie datée', modele: null })

  return etapes
}
