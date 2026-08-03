// normalize.ts — remettre une adresse d'aplomb avant de la juger.
//
// Nos adresses ne sont pas saisies par leur propriétaire : elles sont extraites
// par un LLM depuis des pages web scrapées (`edge function enrich/llm.ts`), ou
// recopiées à la main depuis une fiche Google Maps. Elles arrivent donc avec des
// scories très reconnaissables : un `mailto:` collé devant, un `%20` au milieu,
// une espace insécable, un point final de phrase, des chevrons `<>`.
//
// Deux notions distinctes, à ne pas confondre :
//
//   · `normalizeEmail`  — l'adresse À LAQUELLE ON ÉCRIT. Minuscules, propre.
//     C'est la clé de `email_verifications`.
//   · `canonicalEmail`  — l'adresse SERVANT À DÉDUPLIQUER. Chez Gmail,
//     `jean.dupont+devis@gmail.com` et `jeandupont@gmail.com` sont la même
//     boîte. On ne s'en sert JAMAIS pour envoyer — écrire à une forme que le
//     prospect n'a jamais donnée est un signal de spam.
//
// Module pur : aucune base, aucun réseau, aucune horloge.

/**
 * Espaces et caractères invisibles laissés par le HTML : insécable, cadratins,
 * largeurs nulles, BOM. Écrit en points de code plutôt qu'en classe de
 * caractères : ces caractères sont par définition illisibles dans le source, et
 * une classe qui en contient est intriturable à la relecture.
 */
function stripInvisible(value: string): string {
  let out = ''
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    const invisible =
      code === 0x00a0 || // espace insécable
      code === 0x202f || // insécable étroite
      code === 0x205f || // espace mathématique
      code === 0x3000 || // idéographique
      code === 0xfeff || // BOM
      (code >= 0x2000 && code <= 0x200d) // cadratins + largeurs nulles
    out += invisible ? ' ' : value[i]
  }
  return out
}

/** Le domaine tient-il en ASCII ? Sinon il faut passer par IDNA (punycode). */
function isAscii(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) > 127) return false
  }
  return true
}

/** Ponctuation de fin de phrase collée à l'adresse : « …@garage.fr. » */
const TRAILING_JUNK = /[.,;:!?)\]}>'"]+$/
const LEADING_JUNK = /^[([{<'"]+/

/**
 * Adresse normalisée, prête à recevoir. `null` quand il ne reste rien
 * d'exploitable — c'est déjà un verdict, `syntax.ts` le formulera.
 */
export function normalizeEmail(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null

  let value = stripInvisible(raw).trim()
  if (!value) return null

  // Un `mailto:` (éventuellement suivi de paramètres) traverse souvent le
  // scraping tel quel.
  value = value.replace(/^\s*mailto\s*:\s*/i, '')
  const query = value.indexOf('?')
  if (query > 0) value = value.slice(0, query)

  // Séquences échappées laissées par le HTML ou par le JSON du LLM.
  value = value
    .replace(/%20/gi, ' ')
    .replace(/%40/gi, '@')
    .replace(/&#64;|&commat;/gi, '@')
    .replace(/\\u003[ce]/gi, '')

  // Forme « Jean Dupont <jean@garage.fr> » : on garde ce qui est entre chevrons.
  const angled = /<([^<>]+)>/.exec(value)
  if (angled) value = angled[1]

  value = value.replace(LEADING_JUNK, '').replace(TRAILING_JUNK, '')
  value = value.trim().toLowerCase()
  if (!value || /\s/.test(value)) return null

  const at = value.lastIndexOf('@')
  if (at <= 0 || at === value.length - 1) return null

  const local = value.slice(0, at)
  const domain = toAscii(value.slice(at + 1).replace(/\.+$/, ''))
  if (!local || !domain) return null

  return `${local}@${domain}`
}

/**
 * Domaine en ASCII (punycode). `garage-dupré.fr` et `xn--garage-dupr-ekb.fr`
 * sont le même domaine ; le DNS ne connaît que le second.
 *
 * `URL` fait la conversion IDNA sans dépendance — le module `punycode` de Node
 * est déprécié et n'existe pas côté navigateur.
 */
export function toAscii(domain: string): string {
  const clean = domain.trim().toLowerCase().replace(/^\.+|\.+$/g, '')
  if (!clean) return ''
  // Rien à convertir : on évite le coût et les surprises d'un parse d'URL.
  if (isAscii(clean)) return clean
  try {
    const host = new URL(`http://${clean}`).hostname
    return host || clean
  } catch {
    return clean
  }
}

/** Partie locale d'une adresse déjà normalisée. */
export const localPart = (email: string): string => email.slice(0, email.lastIndexOf('@'))

/** Domaine d'une adresse déjà normalisée. */
export const domainPart = (email: string): string => email.slice(email.lastIndexOf('@') + 1)

/** Providers qui ignorent les points dans la partie locale. */
const DOT_INSENSITIVE = new Set(['gmail.com', 'googlemail.com'])

/** Providers qui traitent `+quelquechose` comme un simple libellé. */
const PLUS_ALIASING = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'outlook.fr',
  'hotmail.com',
  'hotmail.fr',
  'live.fr',
  'live.com',
  'protonmail.com',
  'proton.me',
  'fastmail.com',
  'icloud.com',
  'yahoo.com',
  'yahoo.fr',
])

/**
 * Forme canonique, POUR COMPARER SEULEMENT.
 *
 * Sert à repérer qu'un même prospect apparaît deux fois dans la base sous deux
 * écritures, et à ne pas lui envoyer deux fois la même séquence. Ne jamais
 * l'utiliser comme destinataire.
 */
export function canonicalEmail(email: string): string {
  const domain = domainPart(email)
  let local = localPart(email)
  if (PLUS_ALIASING.has(domain)) {
    const plus = local.indexOf('+')
    if (plus > 0) local = local.slice(0, plus)
  }
  if (DOT_INSENSITIVE.has(domain)) local = local.replace(/\./g, '')
  const canonicalDomain = domain === 'googlemail.com' ? 'gmail.com' : domain
  return `${local}@${canonicalDomain}`
}
