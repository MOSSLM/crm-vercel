// numeros.ts — tous les numéros d'un prospect, dédoublonnés, avec leur origine.
//
// POURQUOI CE MODULE EXISTE
// Un prospect n'a pas « un » numéro. Il en a jusqu'à quatre, répartis sur trois
// colonnes qui ne se parlent pas : `entreprises.telephone`,
// `entreprises.telephones[]` et le `contacts.tel` de chaque personne rattachée.
// Sur le parc qualifié, 47 entreprises sur 295 portent plusieurs numéros
// réellement distincts. Jusqu'ici l'interface en montrait un seul, choisi par le
// premier `?.` qui répondait, et l'agent n'avait aucun moyen de savoir qu'il en
// existait d'autres.
//
// LE PIÈGE DU DÉDOUBLONNAGE
// La même ligne est souvent stockée deux fois dans deux formats. `Acticlimat`
// porte `06 42 82 69 63` sur la fiche entreprise et `+33642826963` sur celle du
// gérant : un seul numéro, deux écritures. Comparer les chiffres bruts
// (`0642826963` vs `33642826963`) les croit différents et affiche un faux choix.
// La clé de dédoublonnage est donc l'E.164 produit par `toE164`, jamais la
// chaîne d'origine. Même chose pour `telephones[]`, qui n'est le plus souvent
// qu'un doublon dé-formaté de `telephone`.
//
// Module PUR : ni base, ni React. L'écran de démarchage, le sélecteur d'envoi et
// l'export vCard s'en servent tous — c'est le seul endroit où « quels numéros a
// ce prospect » est défini.

import { estFixeFr, estMobileFr } from '@/lib/prospects/canal'
import { toE164 } from '@/lib/telephony/phone'

/** Mobile, fixe, ou rien de reconnaissable (étranger, numéro tronqué). */
export type TypeNumero = 'mobile' | 'fixe' | 'autre'

/** D'où vient ce numéro — ce qu'on affiche sous lui pour lever le doute. */
export type OrigineNumero =
  | { kind: 'entreprise' }
  | { kind: 'contact'; contactId: string | null; nom: string; role: string | null }

export interface NumeroProspect {
  /** Forme canonique `+33…` — la clé de dédoublonnage ET ce qu'on compose. */
  e164: string
  /** Lisible à l'écran : `06 42 82 69 63`. */
  affichage: string
  type: TypeNumero
  origine: OrigineNumero
  /** Ce qu'on écrit sous le numéro : « fiche entreprise », « Julien Martin · Gérant ». */
  libelleOrigine: string
}

export interface ContactSource {
  id?: string | number | null
  first_name?: string | null
  last_name?: string | null
  tel?: string | null
  role_title?: string | null
  is_decision_maker?: boolean | null
}

export interface EntrepriseSource {
  name?: string | null
  telephone?: string | null
  telephones?: (string | null | undefined)[] | null
}

export interface SourceNumeros {
  entreprise?: EntrepriseSource | null
  contacts?: (ContactSource | null | undefined)[] | null
}

/** À quoi servent ces numéros — ce qui décide de l'ordre, pas du contenu. */
export type UsageNumero = 'whatsapp' | 'appel'

/**
 * Le nom affichable d'un contact, ou `null` s'il n'en a aucun d'exploitable.
 *
 * `last_name` est nul pour une partie des fiches enrichies (« Paméla », sans
 * patronyme) — on garde le prénom seul plutôt que d'afficher « Paméla null ».
 */
export function nomDuContact(c: ContactSource): string | null {
  const nom = [c.first_name, c.last_name].map((p) => (p ?? '').trim()).filter(Boolean).join(' ')
  return nom || null
}

/**
 * Met un numéro français en forme française : `+33642826963` → `06 42 82 69 63`.
 *
 * Tout ce qui n'est pas un `+33` complet est rendu tel quel — un numéro belge ou
 * une extension de standard n'a pas à être découpé par paires selon une règle
 * qui ne le concerne pas.
 */
export function afficherNumero(e164: string): string {
  const m = /^\+33([1-9]\d{8})$/.exec(e164)
  if (!m) return e164
  return `0${m[1]}`.replace(/(\d{2})(?=\d)/g, '$1 ').trim()
}

function typeDuNumero(raw: string): TypeNumero {
  if (estMobileFr(raw)) return 'mobile'
  if (estFixeFr(raw)) return 'fixe'
  return 'autre'
}

function libelle(origine: OrigineNumero): string {
  if (origine.kind === 'entreprise') return 'fiche entreprise'
  return origine.role ? `${origine.nom} · ${origine.role}` : origine.nom
}

/**
 * Tous les numéros du prospect, dédoublonnés sur l'E.164, ordonnés selon l'usage.
 *
 * L'ORDRE, ET SES RAISONS
 * - `whatsapp` : les mobiles d'abord, décideur en tête. On cherche le téléphone
 *   d'une personne, et un fixe sur WhatsApp n'aboutit jamais.
 * - `appel` : la ligne de l'établissement d'abord. C'est elle qu'on décroche aux
 *   heures ouvrées, et appeler le portable du gérant sans l'avoir jamais eu au
 *   téléphone se paie en raccroché sec.
 *
 * En cas de doublon entre l'entreprise et un contact, **le contact gagne** : le
 * numéro est le même, mais savoir qu'il est celui du gérant vaut mieux que de le
 * présenter comme un standard anonyme.
 */
export function numerosDuProspect(
  source: SourceNumeros,
  usage: UsageNumero = 'whatsapp',
): NumeroProspect[] {
  const parE164 = new Map<string, NumeroProspect>()

  const ajouter = (raw: string | null | undefined, origine: OrigineNumero) => {
    const e164 = toE164(raw)
    // `toE164` renvoie les extensions courtes sans `+` : ce n'est pas un numéro
    // qu'on peut composer depuis l'extérieur, donc on ne le propose pas.
    if (!e164.startsWith('+') || e164.length < 8) return
    const existant = parE164.get(e164)
    if (existant && !(existant.origine.kind === 'entreprise' && origine.kind === 'contact')) return
    parE164.set(e164, {
      e164,
      affichage: afficherNumero(e164),
      type: typeDuNumero(raw ?? ''),
      origine,
      libelleOrigine: libelle(origine),
    })
  }

  const ent = source.entreprise
  for (const t of [ent?.telephone, ...(ent?.telephones ?? [])]) {
    ajouter(t, { kind: 'entreprise' })
  }

  const contacts = (source.contacts ?? []).filter(Boolean) as ContactSource[]
  // Décideurs d'abord : `sort` est stable, l'ordre d'origine départage.
  const parPriorite = [...contacts].sort(
    (a, b) => Number(!!b.is_decision_maker) - Number(!!a.is_decision_maker),
  )
  for (const c of parPriorite) {
    const nom = nomDuContact(c)
    if (!nom) continue
    ajouter(c.tel, {
      kind: 'contact',
      contactId: c.id != null ? String(c.id) : null,
      nom,
      role: (c.role_title ?? '').trim() || null,
    })
  }

  const numeros = [...parE164.values()]
  const rang =
    usage === 'whatsapp'
      ? (n: NumeroProspect) =>
          (n.type === 'mobile' ? 0 : n.type === 'autre' ? 2 : 4) +
          (n.origine.kind === 'contact' ? 0 : 1)
      : (n: NumeroProspect) =>
          (n.type === 'fixe' ? 0 : n.type === 'mobile' ? 2 : 4) +
          (n.origine.kind === 'entreprise' ? 0 : 1)

  return numeros
    .map((n, i) => ({ n, i }))
    .sort((a, b) => rang(a.n) - rang(b.n) || a.i - b.i)
    .map(({ n }) => n)
}

/**
 * Le numéro à proposer par défaut pour cet usage, ou `null` si le prospect n'en
 * a aucun de composable.
 */
export function numeroParDefaut(
  source: SourceNumeros,
  usage: UsageNumero = 'whatsapp',
): NumeroProspect | null {
  return numerosDuProspect(source, usage)[0] ?? null
}
