// dns.ts — le domaine peut-il seulement recevoir du courrier ?
//
// C'est le seul contrôle de la chaîne qui touche au réseau, et il est décisif :
// un domaine qui n'existe pas (NXDOMAIN) ou qui n'a aucun serveur mail ne
// recevra JAMAIS. Sur des prospects scrapés — garages fermés, sites à l'abandon,
// domaines non renouvelés — c'est ce qui sort le plus gros paquet de futurs
// rebonds, avant d'avoir envoyé quoi que ce soit.
//
// Pourquoi DNS-over-HTTPS et pas le module `dns` de Node :
//
//   · une simple requête HTTPS, donc ça marche depuis une fonction Vercel comme
//     depuis une Edge Function Deno — pas de socket, pas de port exotique ;
//   · les deux résolveurs publics utilisés sont gratuits et sans quota utile ;
//   · `dns.resolveMx` de Node dépend du résolveur de la machine, dont le
//     comportement varie d'un hébergeur à l'autre ; ici la réponse est la même
//     partout, ce qui rend le verdict reproductible.
//
// Deux résolveurs, interrogés en repli l'un de l'autre : si Cloudflare ne
// répond pas, Google prend la suite. Un domaine n'est jamais déclaré mort sur
// la foi d'un seul résolveur muet — dans le doute on renvoie `unknown`, et
// l'appelant réessaiera. C'est le sens sûr : mieux vaut retarder un envoi que
// condamner à tort une bonne adresse.

/** Codes de réponse DNS utiles ici (RFC 1035 §4.1.1). */
const NOERROR = 0
const NXDOMAIN = 3

export interface DnsAnswer {
  /** Le domaine existe-t-il ? `false` uniquement sur un NXDOMAIN franc. */
  exists: boolean
  /** Hôtes MX, triés par préférence croissante (le premier est le principal). */
  mxHosts: string[]
  /** Le domaine a-t-il au moins un enregistrement A/AAAA ? */
  hasAddress: boolean
  /** Aucun résolveur n'a répondu : verdict impossible, à réessayer. */
  unresolved: boolean
  error?: string
}

interface DohAnswerRecord {
  name?: string
  type?: number
  TTL?: number
  data?: string
}

interface DohResponse {
  Status?: number
  Answer?: DohAnswerRecord[]
}

const RESOLVERS = [
  'https://cloudflare-dns.com/dns-query',
  'https://dns.google/resolve',
] as const

/** Au-delà, on considère le résolveur muet et on passe au suivant. */
const TIMEOUT_MS = 4000

async function query(domain: string, type: 'MX' | 'A'): Promise<DohResponse | null> {
  for (const resolver of RESOLVERS) {
    const url = `${resolver}?name=${encodeURIComponent(domain)}&type=${type}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const res = await fetch(url, {
        headers: { accept: 'application/dns-json' },
        signal: controller.signal,
      })
      if (!res.ok) continue
      return (await res.json()) as DohResponse
    } catch {
      // Résolveur injoignable ou trop lent : on tente le suivant.
    } finally {
      clearTimeout(timer)
    }
  }
  return null
}

/**
 * Un enregistrement MX se lit « <préférence> <hôte> ». On garde l'hôte, sans le
 * point final de la forme absolue, trié par préférence : c'est le premier qui
 * reçoit réellement.
 */
function parseMx(answers: DohAnswerRecord[]): string[] {
  return answers
    .filter((a) => a.type === 15 && typeof a.data === 'string')
    .map((a) => {
      const [pref, ...rest] = (a.data as string).trim().split(/\s+/)
      return { pref: Number(pref) || 0, host: rest.join(' ').replace(/\.$/, '').toLowerCase() }
    })
    .filter((entry) => entry.host.length > 0)
    .sort((a, b) => a.pref - b.pref)
    .map((entry) => entry.host)
}

/**
 * Ce domaine peut-il recevoir du courrier ?
 *
 * Le cas « pas de MX mais un A » n'est pas une curiosité : la RFC 5321 autorise
 * la remise sur l'adresse du domaine lui-même. En pratique ça marche une fois
 * sur deux — d'où un signal négatif, pas une condamnation.
 */
export async function resolveMailDomain(domain: string): Promise<DnsAnswer> {
  const empty: DnsAnswer = { exists: true, mxHosts: [], hasAddress: false, unresolved: false }

  const mx = await query(domain, 'MX')
  if (!mx) {
    return { ...empty, unresolved: true, error: 'aucun résolveur DNS joignable' }
  }
  if (mx.Status === NXDOMAIN) {
    return { exists: false, mxHosts: [], hasAddress: false, unresolved: false }
  }
  if (mx.Status !== NOERROR && mx.Status !== undefined) {
    return { ...empty, unresolved: true, error: `réponse DNS inattendue (status ${mx.Status})` }
  }

  const mxHosts = parseMx(mx.Answer ?? [])
  if (mxHosts.length > 0) {
    return { exists: true, mxHosts, hasAddress: true, unresolved: false }
  }

  // Pas de MX : le domaine existe-t-il quand même ?
  const a = await query(domain, 'A')
  if (!a) return { ...empty, unresolved: true, error: 'aucun résolveur DNS joignable' }
  if (a.Status === NXDOMAIN) {
    return { exists: false, mxHosts: [], hasAddress: false, unresolved: false }
  }

  const hasAddress = (a.Answer ?? []).some((rec) => rec.type === 1 || rec.type === 28)
  return { exists: true, mxHosts: [], hasAddress, unresolved: false }
}
