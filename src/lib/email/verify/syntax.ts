// syntax.ts — l'adresse est-elle seulement une adresse ?
//
// Premier filtre de la chaîne, et le seul qui soit certain à 100 % : une adresse
// qui échoue ici ne recevra jamais, quel que soit l'état du domaine. Aucun
// réseau, aucune base — c'est gratuit et instantané.
//
// On ne vise pas la conformité RFC 5322 intégrale (qui accepte des formes que
// plus aucun serveur ne route, comme les commentaires entre parenthèses). On
// vise ce qui compte ici : reconnaître les vraies adresses, et surtout attraper
// les DÉCHETS PROPRES AU SCRAPING. Le LLM d'enrichissement lit des pages web et
// en ressort régulièrement des choses qui ressemblent à une adresse sans en
// être une :
//
//   contact@2x.png            (un nom de fichier d'image responsive)
//   info@garage.com.jpg       (une adresse écrite dans un nom de fichier)
//   u003econtact@garage.fr    (un reste d'échappement JSON)
//   nom@domaine               (le TLD a sauté au copier-coller)
//   jean@garage..fr           (double point)
//
// Un regex générique laisse passer la moitié. Les règles ci-dessous les nomment.

import { domainPart, localPart } from './normalize'

export type SyntaxFailure =
  | 'vide'
  | 'sans_arobase'
  | 'local_vide'
  | 'local_trop_long'
  | 'local_invalide'
  | 'domaine_vide'
  | 'domaine_trop_long'
  | 'domaine_sans_point'
  | 'domaine_invalide'
  | 'tld_invalide'
  | 'extension_fichier'

export interface SyntaxResult {
  ok: boolean
  failure?: SyntaxFailure
  /** Explication en français, affichable telle quelle. */
  message?: string
}

const OK: SyntaxResult = { ok: true }

const MESSAGES: Record<SyntaxFailure, string> = {
  vide: 'adresse vide',
  sans_arobase: 'pas d’arobase',
  local_vide: 'rien avant l’arobase',
  local_trop_long: 'partie avant l’arobase trop longue (64 caractères maximum)',
  local_invalide: 'caractères interdits avant l’arobase',
  domaine_vide: 'rien après l’arobase',
  domaine_trop_long: 'domaine trop long (255 caractères maximum)',
  domaine_sans_point: 'domaine sans extension',
  domaine_invalide: 'domaine mal formé',
  tld_invalide: 'extension de domaine impossible',
  extension_fichier: 'ce n’est pas une adresse mais un nom de fichier',
}

/** Caractères autorisés avant l'arobase, hors forme « entre guillemets ». */
const LOCAL_ALLOWED = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+$/

/** Un label de domaine : lettres, chiffres, tirets, sans tiret au bord. */
const LABEL = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/

/**
 * Extensions de fichiers qui traînent dans le HTML et que le scraping confond
 * avec un TLD. Une adresse ne se termine jamais par `.png`.
 */
const FILE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
  'ico',
  'bmp',
  'avif',
  'css',
  'js',
  'json',
  'xml',
  'pdf',
  'zip',
  'woff',
  'woff2',
  'ttf',
  'eot',
  'mp4',
  'webm',
  'php',
  'html',
  'htm',
])

const fail = (failure: SyntaxFailure): SyntaxResult => ({
  ok: false,
  failure,
  message: MESSAGES[failure],
})

/**
 * L'adresse (déjà passée par `normalizeEmail`) est-elle syntaxiquement viable ?
 */
export function checkSyntax(email: string | null | undefined): SyntaxResult {
  if (!email) return fail('vide')
  if (!email.includes('@')) return fail('sans_arobase')

  const local = localPart(email)
  const domain = domainPart(email)

  if (!local) return fail('local_vide')
  if (local.length > 64) return fail('local_trop_long')
  if (!LOCAL_ALLOWED.test(local)) return fail('local_invalide')
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) {
    return fail('local_invalide')
  }

  if (!domain) return fail('domaine_vide')
  if (domain.length > 255) return fail('domaine_trop_long')
  if (!domain.includes('.')) return fail('domaine_sans_point')

  const labels = domain.split('.')
  if (labels.some((label) => label.length === 0 || label.length > 63)) {
    return fail('domaine_invalide')
  }
  if (labels.some((label) => !LABEL.test(label))) return fail('domaine_invalide')

  const tld = labels[labels.length - 1]
  if (FILE_EXTENSIONS.has(tld)) return fail('extension_fichier')
  // Un TLD fait au moins deux lettres et n'est jamais numérique. `xn--` est
  // l'exception légitime : c'est un TLD internationalisé (punycode).
  if (!/^[a-z]{2,}$/.test(tld) && !tld.startsWith('xn--')) return fail('tld_invalide')

  return OK
}
