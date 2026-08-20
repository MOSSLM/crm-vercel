// redaction.ts — la langue des messages, et ce que chaque canal en supporte. Pur.
//
// TROIS CHOSES VIVENT ICI, ET ELLES ONT LA MÊME RAISON D'ÊTRE : un message
// écrit une fois doit pouvoir partir à tout le fichier sans qu'on relise chaque
// prospect. Le repli (dans `variables.ts`) comble un mot manquant ; le texte
// conditionnel (ici) change une phrase ; les capacités par canal (ici) disent
// ce que le canal choisi accepte réellement.
//
// ── POURQUOI LE CONDITIONNEL NE TESTE QUE LE SAC DE VARIABLES ──────────────
//
// La tentation était de lui donner accès aux FAITS du prospect — la cohorte,
// la présence web, l'effectif — comme le fait une étape `condition`. C'est
// refusé, et la frontière est nette :
//
//   · une étape `condition` branche LA SÉQUENCE. Elle interroge la base au
//     moment de l'évaluation (`conditions-db.ts`), elle sait répondre « je ne
//     sais pas », et elle laisse une trace dans `vars.conditions`.
//   · le texte conditionnel branche LA PHRASE. Il ne connaît que ce que le
//     message connaît déjà : son sac de variables.
//
// Sans cette frontière, l'aperçu de l'éditeur devrait aller chercher en base
// des faits que le sac n'a pas, et il ne montrerait plus ce qui part. Un aperçu
// qui ment est pire que pas d'aperçu — c'est la leçon de `versionsPreparees`,
// qui affiche le message DÉJÀ PRÉPARÉ plutôt que de le recalculer à l'écran.
//
// Ce n'est pas une limite gênante : le cas qui motive tout — « cohorte A, site
// faible → refonte ; cohorte B, sans site → création » — se dit exactement avec
// `{% si company.website %}`, puisque c'est la présence du site qui sépare les
// deux cohortes.

import {
  VARIABLES,
  canonicalKey,
  interpolateVars,
  missingVariables,
  type VarBag,
} from './variables'

/* ── Le texte conditionnel ────────────────────────────────────────────────── */

/**
 * Les mots-clés reconnus. Les formes anglaises sont acceptées pour la même
 * raison que les alias de variables : un modèle copié d'ailleurs ne doit pas
 * partir amputé parce qu'il écrit `if` au lieu de `si`.
 */
const MOTS: Readonly<Record<string, 'si' | 'sinon' | 'fin'>> = {
  si: 'si',
  if: 'si',
  sinon: 'sinon',
  else: 'sinon',
  fin: 'fin',
  endif: 'fin',
}

const TAG_PATTERN = /\{%\s*([\p{L}]+)\b[ \t]*([^%]*?)\s*%\}/gu

export type CodeFaute = 'cle_inconnue' | 'mot_inconnu' | 'si_sans_cle' | 'sinon_orphelin' | 'fin_orpheline' | 'si_non_ferme'

export interface Faute {
  code: CodeFaute
  /** La phrase montrée à l'opérateur, telle quelle. */
  message: string
  /** Ce sur quoi elle porte, quand ça a un sens. */
  sujet?: string
}

/** Les clés du catalogue, pour repérer une condition portant sur une clé inventée. */
const CLES_CONNUES = new Set(VARIABLES.map((v) => v.key))

/**
 * Déplie les blocs conditionnels d'un texte.
 *
 * LA CONDITION EST UNE PRÉSENCE, PAS UNE COMPARAISON. `{% si company.website %}`
 * se lit « si on a un site pour ce prospect ». Il n'y a ni `=`, ni `>`, ni
 * `et` — même règle que les vues de tâches et les conditions d'étape : un
 * interrupteur, pas un arbre. La négation s'écrit `{% sinon %}`, ce qui évite
 * d'avoir deux façons d'écrire la même chose.
 *
 * L'IMBRICATION MARCHE, parce qu'une pile coûte trois lignes de plus qu'un
 * drapeau et qu'un bloc imbriqué mal rendu partirait au prospect sans que
 * personne ne le voie. L'éditeur, lui, n'en propose pas.
 *
 * CE QUI SE PASSE QUAND C'EST MAL ÉCRIT — jamais de balise laissée brute dans
 * un message envoyé, c'est la règle héritée de `interpolateVars`. Un `{% si %}`
 * jamais fermé est lu comme s'il se fermait à la fin du texte, ce qui est sa
 * lecture naturelle ; un `{% sinon %}` ou un `{% fin %}` orphelin disparaît
 * sans emporter de texte. Dans les deux cas la faute est REMONTÉE, et l'éditeur
 * refuse d'enregistrer : ce rattrapage est un filet, pas un comportement.
 */
export function rendreConditionnels(
  texte: string | null | undefined,
  vars: VarBag,
): { rendu: string; fautes: Faute[] } {
  const src = texte ?? ''
  const fautes: Faute[] = []
  const pile: { garde: boolean; branche: 'si' | 'sinon' }[] = []
  const morceaux: string[] = []
  let curseur = 0
  let vuUneBalise = false

  // Un cadre laisse passer le texte quand on est du bon côté de sa garde.
  const actif = () => pile.every((c) => (c.branche === 'si' ? c.garde : !c.garde))
  const emettre = (t: string) => {
    if (t && actif()) morceaux.push(t)
  }

  for (const m of src.matchAll(TAG_PATTERN)) {
    const mot = MOTS[m[1].toLowerCase()]
    if (!mot) {
      // Une balise qu'on ne comprend pas n'est pas une balise : on la laisse au
      // texte plutôt que de la manger. Elle se verra dans l'aperçu.
      continue
    }
    vuUneBalise = true
    emettre(src.slice(curseur, m.index ?? 0))
    curseur = (m.index ?? 0) + m[0].length

    if (mot === 'si') {
      const brut = (m[2] ?? '').trim()
      if (!brut) {
        fautes.push({ code: 'si_sans_cle', message: 'Un « si » sans variable à tester — le bloc ne peut pas trancher.' })
        pile.push({ garde: false, branche: 'si' })
        continue
      }
      const cle = canonicalKey(brut)
      if (!CLES_CONNUES.has(cle)) {
        // Sans ce contrôle, une clé mal orthographiée serait toujours vide,
        // donc enverrait TOUT LE MONDE dans la branche « sinon » — en silence.
        // C'est exactement l'accident que `missingVariables` a été écrit pour
        // empêcher sur les variables.
        fautes.push({
          code: 'cle_inconnue',
          message: `« ${brut} » n’est pas une variable connue : la condition serait toujours fausse.`,
          sujet: brut,
        })
      }
      pile.push({ garde: Boolean(vars[cle]), branche: 'si' })
      continue
    }

    if (mot === 'sinon') {
      const haut = pile[pile.length - 1]
      if (!haut) {
        fautes.push({ code: 'sinon_orphelin', message: 'Un « sinon » sans « si » ouvert — la balise est ignorée.' })
        continue
      }
      haut.branche = 'sinon'
      continue
    }

    // fin
    if (pile.length === 0) {
      fautes.push({ code: 'fin_orpheline', message: 'Un « fin » sans « si » ouvert — la balise est ignorée.' })
      continue
    }
    pile.pop()
  }

  emettre(src.slice(curseur))

  if (pile.length > 0) {
    fautes.push({
      code: 'si_non_ferme',
      message:
        pile.length === 1
          ? 'Un « si » n’est jamais refermé — il est lu comme s’il se fermait à la fin du message.'
          : `${pile.length} « si » ne sont jamais refermés — ils sont lus comme s’ils se fermaient à la fin du message.`,
    })
  }

  let rendu = morceaux.join('')
  if (vuUneBalise) {
    // Une balise seule sur sa ligne laisse une ligne vide derrière elle. On ne
    // nettoie QUE les textes qui en portent : appliquer ça partout changerait
    // le rendu de messages qui n'ont rien demandé.
    rendu = rendu.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  }
  return { rendu, fautes }
}

/**
 * Le message tel qu'il partira : conditionnels d'abord, variables ensuite.
 *
 * L'ORDRE N'EST PAS INTERCHANGEABLE. Interpoler d'abord poserait le contenu
 * des variables dans le texte, où un `{%` ou un `%}` venu d'un nom
 * d'entreprise deviendrait une balise. Déplier d'abord, c'est garantir que la
 * structure du message est celle qu'on a écrite, jamais celle qu'un prospect
 * a dans sa raison sociale.
 */
export function rendreMessage(texte: string | null | undefined, vars: VarBag): string {
  return interpolateVars(rendreConditionnels(texte, vars).rendu, vars)
}

/**
 * Insère un bloc conditionnel autour de la sélection.
 *
 * Même contrat qu'`insertVariable` : le texte ET la position, parce que
 * l'appelant doit replacer le curseur. Ici il le place au début de la branche
 * « si », qui est celle qu'on écrit en premier.
 */
export function insertConditionnel(
  text: string,
  cle: string,
  selectionStart: number,
  selectionEnd: number = selectionStart,
): { text: string; cursor: number } {
  const start = Math.max(0, Math.min(selectionStart, text.length))
  const end = Math.max(start, Math.min(selectionEnd, text.length))
  const selection = text.slice(start, end)
  const ouvre = `{% si ${cle} %}\n`
  const bloc = `${ouvre}${selection}\n{% sinon %}\n\n{% fin %}`
  return { text: text.slice(0, start) + bloc + text.slice(end), cursor: start + ouvre.length + selection.length }
}

/* ── Ce que chaque canal supporte ─────────────────────────────────────────── */

export type CanalMessage =
  | 'email'
  | 'whatsapp'
  | 'sms'
  | 'linkedin_message'
  | 'linkedin_invitation'
  | 'call'
  | 'task'

export interface CapaciteCanal {
  canal: CanalMessage
  label: string
  /** Le canal porte-t-il un objet séparé ? L'e-mail, et lui seul. */
  objet: boolean
  /** Longueur de confort de l'objet — au-delà, un téléphone tronque. */
  objetConfort: number | null
  /** Texte riche et pièces jointes : l'e-mail seul, là aussi. */
  texteRiche: boolean
  piecesJointes: boolean
  /** Une limite DURE, imposée par la plateforme. Dépassée, le message ne part pas. */
  limite: number | null
  /** Une longueur de confort, qui est un avis de notre part et le dit. */
  confort: number | null
  /** Le canal se facture-t-il par segments (SMS) ? */
  segmente: boolean
  /** Ce qu'on dit à l'opérateur de la limite — jamais un nombre nu. */
  motif: string
}

/**
 * Les capacités, canal par canal.
 *
 * UNE LIMITE DURE ET UNE LONGUEUR DE CONFORT NE SONT PAS LA MÊME CHOSE, et les
 * confondre serait mentir dans les deux sens : inventer une limite technique
 * là où il n'y en a pas fait passer un avis éditorial pour une contrainte, et
 * l'inverse laisse partir un message que la plateforme refusera.
 *
 * Ce qui est DUR ici : les 200 caractères de la note d'invitation LinkedIn.
 * Tout le reste est un avis, et l'éditeur l'affiche comme tel.
 */
export const CAPACITES: Readonly<Record<CanalMessage, CapaciteCanal>> = {
  email: {
    canal: 'email',
    label: 'E-mail',
    objet: true,
    objetConfort: 60,
    texteRiche: true,
    piecesJointes: true,
    limite: null,
    confort: null,
    segmente: false,
    motif: 'Un objet au-delà de 60 caractères est tronqué sur un téléphone — la fin ne se lit jamais.',
  },
  whatsapp: {
    canal: 'whatsapp',
    label: 'WhatsApp',
    objet: false,
    objetConfort: null,
    texteRiche: false,
    piecesJointes: false,
    limite: null,
    confort: 900,
    segmente: false,
    // Ce n'est pas une limite de WhatsApp : c'est la nôtre, et elle est assumée.
    motif: 'Un message qu’il faut dérouler sur un téléphone ne se lit pas. Au-delà, c’est un appel qu’il faut passer.',
  },
  sms: {
    canal: 'sms',
    label: 'SMS',
    objet: false,
    objetConfort: null,
    texteRiche: false,
    piecesJointes: false,
    limite: null,
    confort: null,
    segmente: true,
    motif: 'Le SMS se facture par segment, et un seul caractère hors alphabet GSM fait tomber le segment de 160 à 70.',
  },
  linkedin_message: {
    canal: 'linkedin_message',
    label: 'Message LinkedIn',
    objet: false,
    objetConfort: null,
    texteRiche: false,
    piecesJointes: false,
    limite: null,
    confort: 1200,
    segmente: false,
    motif: 'Au-delà, LinkedIn replie le message derrière un « voir plus » que personne ne déplie.',
  },
  linkedin_invitation: {
    canal: 'linkedin_invitation',
    label: 'Note d’invitation LinkedIn',
    objet: false,
    objetConfort: null,
    texteRiche: false,
    piecesJointes: false,
    limite: 200,
    confort: null,
    segmente: false,
    motif: 'LinkedIn plafonne la note d’invitation à 200 caractères. Au-delà, l’invitation part sans la note.',
  },
  call: {
    canal: 'call',
    label: 'Script d’appel',
    objet: false,
    objetConfort: null,
    texteRiche: false,
    piecesJointes: false,
    limite: null,
    confort: null,
    segmente: false,
    // Rien ne part : ce texte est lu par l'agent, pas envoyé au prospect.
    motif: 'Ce texte ne part pas : il est lu à l’écran pendant l’appel.',
  },
  task: {
    canal: 'task',
    label: 'Consigne',
    objet: false,
    objetConfort: null,
    texteRiche: false,
    piecesJointes: false,
    limite: null,
    confort: null,
    segmente: false,
    motif: 'Ce texte ne part pas : c’est la consigne affichée à l’agent.',
  },
}

/**
 * La capacité d'une nature d'étape.
 *
 * Une nature inconnue retombe sur la consigne — le canal le plus prudent, qui
 * n'envoie rien. Une étape neuve n'a jamais à hériter des permissions de
 * l'e-mail par accident.
 */
export function capaciteDuCanal(kind: string | null | undefined): CapaciteCanal {
  const k = (kind ?? '').trim()
  if (k in CAPACITES) return CAPACITES[k as CanalMessage]
  if (k === 'linkedin') return CAPACITES.linkedin_message
  return CAPACITES.task
}

/* ── Le SMS et son alphabet ───────────────────────────────────────────────── */

/**
 * L'alphabet GSM 03.38, celui qui tient en 7 bits.
 *
 * CE QUI N'Y EST PAS, ET QUI NOUS CONCERNE DIRECTEMENT :
 *
 *   · `ê â î ô û ë ï` — aucun accent circonflexe ni tréma sur a/e/i/o/u ;
 *   · **`ç` minuscule** : la table porte `Ç` (0x09) et lui seul. « français »,
 *     « reçu », « ça » basculent donc, ce que personne ne devine ;
 *   · **l'apostrophe typographique `’`** — que tout le CRM écrit, jusque dans
 *     ces commentaires.
 *
 * Un seul de ces caractères fait basculer le message ENTIER en UCS-2 : le
 * segment tombe de 160 à 70 caractères, et un SMS devient trois. C'est le
 * genre de facture qu'on ne comprend qu'après.
 */
const GSM7 = new Set(
  ('@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡' +
    'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà').split(''),
)

/** Ceux qui passent, mais comptent double : ils sont encodés sur deux septets. */
const GSM7_ETENDU = new Set('^{}\\[~]|€'.split(''))

export interface CoutSms {
  /** Le nombre de caractères facturés — l'étendu compte double. */
  unites: number
  /** `gsm` = 160 par segment, `ucs2` = 70. */
  alphabet: 'gsm' | 'ucs2'
  segments: number
  /** Le caractère qui a fait basculer en UCS-2, s'il y en a un. */
  coupable: string | null
}

/**
 * Ce que coûte un SMS, et pourquoi.
 *
 * Le `coupable` n'est pas un ornement : « votre message coûte 3 SMS » ne dit
 * pas quoi corriger, « l'apostrophe ’ fait tomber le segment à 70 » le dit.
 */
export function coutSms(texte: string | null | undefined): CoutSms {
  const src = texte ?? ''
  // `Array.from` plutôt qu'un index : un emoji est une paire de substituts, et
  // le compter deux fois ferait annoncer une facture fausse.
  const chars = Array.from(src)
  let coupable: string | null = null
  let unites = 0
  for (const c of chars) {
    if (GSM7.has(c)) unites += 1
    else if (GSM7_ETENDU.has(c)) unites += 2
    else {
      if (coupable === null) coupable = c
      unites += 1
    }
  }
  if (coupable !== null) {
    // En UCS-2 tout caractère vaut une unité, y compris ceux de l'alphabet
    // étendu : le décompte à deux septets n'a plus cours.
    return {
      unites: chars.length,
      alphabet: 'ucs2',
      segments: chars.length === 0 ? 0 : chars.length <= 70 ? 1 : Math.ceil(chars.length / 67),
      coupable,
    }
  }
  return {
    unites,
    alphabet: 'gsm',
    segments: unites === 0 ? 0 : unites <= 160 ? 1 : Math.ceil(unites / 153),
    coupable: null,
  }
}

/* ── Ce que l'éditeur affiche ─────────────────────────────────────────────── */

export interface Analyse {
  /** Ce qui partira, conditionnels dépliés et variables posées. */
  rendu: string
  /** Les variables citées sans repli que le sac ne peut pas remplir. */
  manquantes: string[]
  /** Les fautes de structure des blocs conditionnels. */
  fautes: Faute[]
  /** Longueur du rendu, pas de la source : c'est le rendu qui part. */
  longueur: number
  /** Dépassement d'une limite DURE — l'enregistrement doit être refusé. */
  depassement: { limite: number; de: number } | null
  /** Dépassement d'une longueur de confort — un avis, pas un refus. */
  auDelaDuConfort: { confort: number; de: number } | null
  /** Renseigné pour le SMS seulement. */
  sms: CoutSms | null
  /** Vrai quand rien n'empêche d'enregistrer. */
  valide: boolean
}

/**
 * Tout ce que l'éditeur a besoin de dire d'un message, en un appel.
 *
 * LA LONGUEUR SE MESURE SUR LE RENDU, JAMAIS SUR LA SOURCE. Un message de
 * 190 caractères dont 40 sont `{{company.name}}` fait 180 ou 210 selon le
 * prospect : compter la source, c'est afficher un chiffre qui n'est celui de
 * personne. C'est aussi pourquoi la note d'invitation LinkedIn ne peut être
 * validée que prospect par prospect, et pas une fois pour toutes.
 */
export function analyserMessage(
  texte: string | null | undefined,
  vars: VarBag,
  canal: CapaciteCanal,
): Analyse {
  const { rendu: deplie, fautes } = rendreConditionnels(texte, vars)
  const rendu = interpolateVars(deplie, vars)
  // Les variables se jugent sur le texte DÉPLIÉ : signaler un trou dans une
  // branche que ce prospect ne prendra pas est exactement la fausse alerte que
  // le conditionnel existe pour supprimer.
  const manquantes = missingVariables(deplie, vars)
  const longueur = Array.from(rendu).length

  const depassement =
    canal.limite !== null && longueur > canal.limite
      ? { limite: canal.limite, de: longueur - canal.limite }
      : null
  const auDelaDuConfort =
    canal.confort !== null && longueur > canal.confort
      ? { confort: canal.confort, de: longueur - canal.confort }
      : null

  return {
    rendu,
    manquantes,
    fautes,
    longueur,
    depassement,
    auDelaDuConfort,
    sms: canal.segmente ? coutSms(rendu) : null,
    valide: depassement === null && fautes.length === 0,
  }
}
