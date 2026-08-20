// canal.ts — par quel canal ce prospect est-il joignable ?
//
// C'est la question qui décide de la séquence. Sur le parc actuel, les trois
// réponses possibles se répartissent nettement :
//
//   sans e-mail + mobile  →  WhatsApp seul  (accroche, puis le site)
//   e-mail + fixe         →  e-mail, puis appel
//   e-mail + mobile       →  e-mail + WhatsApp, puis appel
//
// Rien en base ne distingue un mobile d'un fixe : `entreprises.telephone` et
// `contacts.tel` sont du texte libre, saisi ou enrichi. La distinction se lit
// donc dans le numéro lui-même, ce qui suppose de le normaliser d'abord —
// `toE164` fait déjà ce travail pour la téléphonie, on ne le refait pas ici.
//
// Module PUR : ni base, ni React. Le tableau, les filtres et le moteur en
// dépendent tous, et c'est le seul endroit où la règle est écrite.

import { toE164 } from '@/lib/telephony/phone'

export type Canal = 'email' | 'mobile' | 'fixe'

/**
 * Les préfixes mobiles français, en E.164.
 *
 * L'ARCEP réserve 06 et 07 aux mobiles ; 09 est du VoIP fixe et 01–05 du fixe
 * géographique. On ne teste que la France : un numéro étranger n'est classé ni
 * mobile ni fixe, parce qu'on serait en train de deviner.
 */
const PREFIXES_MOBILES_FR = ['+336', '+337'] as const
const PREFIXE_FR = '+33'

/**
 * Ce numéro est-il un mobile français ?
 *
 * Accepte tout ce qu'on trouve en base : `06 46 04 28 76`, `+33646042876`,
 * `0033 6 46 04 28 76`, `06.46.04.28.76`.
 */
export function estMobileFr(raw: string | null | undefined): boolean {
  const e164 = toE164(raw)
  return PREFIXES_MOBILES_FR.some((p) => e164.startsWith(p))
}

/**
 * Ce numéro est-il une ligne fixe française ?
 *
 * Un numéro français qui n'est pas mobile — donc 01 à 05 (géographique) et 09
 * (VoIP). Volontairement pas défini comme « non-mobile » : une saisie tronquée
 * comme `06 46` ne doit pas basculer en fixe par défaut.
 */
export function estFixeFr(raw: string | null | undefined): boolean {
  const e164 = toE164(raw)
  if (!e164.startsWith(PREFIXE_FR)) return false
  if (estMobileFr(raw)) return false
  // `+33` + 9 chiffres : un numéro français complet, pas un fragment.
  return /^\+33[1-59]\d{8}$/.test(e164)
}

export interface SourceCanaux {
  /** `entreprises.email`, ou celui du contact — l'appelant a déjà tranché. */
  email?: string | null
  /** Tous les numéros connus : `contacts.tel`, `entreprises.telephone`, `telephones[]`. */
  telephones?: (string | null | undefined)[] | null
}

/**
 * Les canaux par lesquels ce prospect est joignable.
 *
 * Un prospect peut en cumuler plusieurs — c'est justement le cas « e-mail +
 * mobile », qui est le plus gros segment et qui a sa propre séquence.
 */
export function canauxDisponibles(source: SourceCanaux): Set<Canal> {
  const out = new Set<Canal>()
  if ((source.email ?? '').trim()) out.add('email')
  for (const tel of source.telephones ?? []) {
    if (estMobileFr(tel)) out.add('mobile')
    else if (estFixeFr(tel)) out.add('fixe')
  }
  return out
}

/**
 * Le premier mobile de la liste, en E.164 — le numéro qu'on ouvrira sur
 * WhatsApp. `null` si aucun.
 */
export function premierMobile(telephones: (string | null | undefined)[] | null | undefined): string | null {
  for (const tel of telephones ?? []) {
    if (estMobileFr(tel)) return toE164(tel)
  }
  return null
}

/* ── Le prospect entier, pas seulement la fiche entreprise ────────────────── */

/** Un contact rattaché à l'entreprise, tel qu'il sort de `contacts`. */
export interface ContactJoignable {
  email?: string | null
  tel?: string | null
  /** `contacts.is_decision_maker` — le gérant passe devant le standard. */
  isDecisionMaker?: boolean | null
}

export interface SourceProspect {
  /** `entreprises.email`. */
  entrepriseEmail?: string | null
  /** `entreprises.telephone` et `entreprises.telephones[]`. */
  entrepriseTelephones?: (string | null | undefined)[] | null
  /** Les fiches `contacts` de l'entreprise. */
  contacts?: ContactJoignable[] | null
}

export interface CanauxProspect {
  canaux: Set<Canal>
  /** Le mobile qu'on ouvrira sur WhatsApp, en E.164. */
  mobile: string | null
  /** La ligne fixe qu'on appellera, en E.164. */
  fixe: string | null
  /** L'adresse à laquelle on écrira. */
  email: string | null
}

/**
 * Ce par quoi ce prospect est joignable, **entreprise et contacts confondus**.
 *
 * POURQUOI ON NE REGARDE PAS QUE LA FICHE ENTREPRISE
 * Une entreprise peut n'avoir qu'un standard en 02, et son gérant un 06 sur sa
 * fiche contact. Ne lire que `entreprises.telephone` la classerait « fixe seul »
 * et la priverait de la séquence WhatsApp — alors qu'on a exactement ce qu'il
 * faut pour la joindre, et mieux : un portable personnel est lu, un standard
 * est filtré.
 *
 * L'ORDRE DE PRÉFÉRENCE, ET SES RAISONS
 * - mobile : décideur, puis n'importe quel contact, puis l'entreprise. C'est le
 *   téléphone d'une personne qu'on cherche, pas celui d'un lieu.
 * - fixe : l'entreprise d'abord — la ligne pro EST celle de l'établissement.
 * - e-mail : le contact d'abord, l'entreprise en repli. Même règle que le
 *   moteur (`resolveEntities`), pour que le tableau et l'envoi ne se
 *   contredisent jamais.
 */
export function collecterCanaux(source: SourceProspect): CanauxProspect {
  const contacts = (source.contacts ?? []).filter(Boolean)
  // Les décideurs d'abord : `sort` stable en JS moderne, l'ordre d'origine
  // départage à égalité.
  const parPriorite = [...contacts].sort(
    (a, b) => Number(!!b.isDecisionMaker) - Number(!!a.isDecisionMaker),
  )

  const telsContacts = parPriorite.map((c) => c.tel)
  const telsEntreprise = source.entrepriseTelephones ?? []

  const mobile = premierMobile([...telsContacts, ...telsEntreprise])
  const fixe = [...telsEntreprise, ...telsContacts].find((t) => estFixeFr(t))
  const email =
    parPriorite.map((c) => c.email).find((e) => (e ?? '').trim()) ??
    ((source.entrepriseEmail ?? '').trim() || null)

  const canaux = new Set<Canal>()
  if (email) canaux.add('email')
  if (mobile) canaux.add('mobile')
  if (fixe) canaux.add('fixe')

  return { canaux, mobile, fixe: fixe ? toE164(fixe) : null, email: email ?? null }
}

/**
 * Le lien `wa.me` d'un numéro, message pré-rempli.
 *
 * `wa.me` exige l'international SANS `+` : un `06…` recopié tel quel produit
 * `wa.me/0646042876`, que WhatsApp ne résout pas — la tâche s'ouvrait sur une
 * page d'erreur et l'agent croyait à une panne. Renvoie `null` quand le numéro
 * est inexploitable, pour que l'appelant le dise au lieu d'ouvrir dans le vide.
 */
export function lienWhatsApp(raw: string | null | undefined, message?: string): string | null {
  const digits = toE164(raw).replace(/^\+/, '')
  // Un numéro court est une extension de standard interne, pas un mobile.
  if (digits.length < 8) return null
  const suffixe = message ? `?text=${encodeURIComponent(message)}` : ''
  return `https://wa.me/${digits}${suffixe}`
}

/**
 * Le lien `sms:` d'un numéro, message pré-rempli.
 *
 * MÊME MODÈLE QUE WHATSAPP, ET POUR LA MÊME RAISON PRATIQUE : le CRM prépare,
 * le téléphone envoie. Ici ce n'est pourtant pas une contrainte de plateforme —
 * l'adaptateur Zadarma porte bien un `sendSms`. Mais il n'a jamais envoyé un
 * seul message (`sms_messages` compte zéro ligne) et son code porte encore un
 * « CONFIRM: param names against live spec ». Un envoi payant et non éprouvé
 * dans une boucle automatique se découvre deux cents SMS trop tard.
 *
 * LE `?&body=` N'EST PAS UNE FAUTE DE FRAPPE. iOS attend `&body=` dès qu'un
 * paramètre précède, Android `?body=`. `?&body=` est la seule écriture que les
 * deux acceptent — l'esperluette sert de séparateur à l'un et est ignorée par
 * l'autre.
 *
 * Le `+` est CONSERVÉ, contrairement à `wa.me` qui le refuse : l'application de
 * messagerie compose le numéro tel quel, et un `33612…` sans `+` partirait vers
 * un numéro national qui n'existe pas.
 */
export function lienSms(raw: string | null | undefined, message?: string): string | null {
  const e164 = toE164(raw)
  // Un numéro court est une extension de standard interne, pas un mobile.
  if (!e164.startsWith('+') || e164.length < 9) return null
  const suffixe = message ? `?&body=${encodeURIComponent(message)}` : ''
  return `sms:${e164}${suffixe}`
}

/** Libellés d'interface — une seule orthographe pour toute l'application. */
export const CANAL_LABEL: Readonly<Record<Canal, string>> = {
  email: 'E-mail',
  mobile: 'Mobile',
  fixe: 'Fixe',
}

export const CANAUX: readonly Canal[] = ['email', 'mobile', 'fixe'] as const

/**
 * Le public visé d'une séquence, tel qu'il est déclaré dans ses réglages.
 *
 * Volontairement exprimé en canaux et pas en préfixes : « il me faut un
 * mobile », jamais « 06 ou 07 ». La règle de numérotation vit dans ce fichier
 * et nulle part ailleurs, donc une séquence n'a pas à être retouchée si l'ARCEP
 * ouvre une nouvelle tranche.
 */
export interface PublicVise {
  /** Canaux que le prospect doit TOUS avoir. */
  requireCanaux?: Canal[] | null
  /** Canaux qui le disqualifient — un seul suffit. */
  excludeCanaux?: Canal[] | null
}

/** Ce prospect entre-t-il dans le public visé par cette séquence ? */
export function correspondAuPublic(canaux: Set<Canal>, cible: PublicVise): boolean {
  for (const c of cible.excludeCanaux ?? []) if (canaux.has(c)) return false
  for (const c of cible.requireCanaux ?? []) if (!canaux.has(c)) return false
  return true
}

/**
 * Combien de conditions cette cible pose — sert à départager deux séquences qui
 * conviennent toutes les deux.
 *
 * La plus exigeante gagne : entre « il me faut une adresse » et « il me faut une
 * adresse ET un mobile », c'est la seconde qui décrit vraiment le prospect. Une
 * séquence sans aucune règle ne suggère jamais rien — elle reste choisissable à
 * la main, mais ne s'impose pas par défaut à tout le parc.
 */
export function precisionDuPublic(cible: PublicVise): number {
  return (cible.requireCanaux?.length ?? 0) + (cible.excludeCanaux?.length ?? 0)
}

/**
 * La séquence à proposer pour ce prospect, parmi celles qui déclarent un public.
 *
 * Rien n'est codé en dur ici : une séquence créée demain avec ses propres cases
 * entre dans la suggestion sans qu'on retouche cette fonction. `null` quand
 * aucune ne correspond — le déroulant reste ouvert, simplement sans favori.
 *
 * DEUX SÉQUENCES SUR LE MÊME PUBLIC, C'EST NORMAL
 * C'est même la forme d'un test : deux façons d'ouvrir, la même cible, deux
 * colonnes de chiffres à comparer. Il faut alors départager, et la précision du
 * public n'y suffit plus puisqu'elle est identique de part et d'autre. Celle qui
 * TOURNE gagne : proposer un brouillon quand une séquence est en service
 * enverrait l'inscription contre un 409 `sequence_inactive`, et un brouillon
 * n'est le bon choix par défaut de personne. À égalité complète, la première
 * déclarée l'emporte — donc l'ordre d'affichage, pas le hasard du tri SQL.
 */
export function sequenceSuggeree<T extends PublicVise & { id: string; status?: string }>(
  canaux: Set<Canal>,
  sequences: T[],
): T | null {
  let best: T | null = null
  let bestScore = 0
  let bestActive = false
  for (const seq of sequences) {
    const score = precisionDuPublic(seq)
    if (score === 0) continue
    if (!correspondAuPublic(canaux, seq)) continue
    const active = seq.status === 'on'
    const gagne = score > bestScore || (score === bestScore && active && !bestActive)
    if (!gagne) continue
    best = seq
    bestScore = score
    bestActive = active
  }
  return best
}
