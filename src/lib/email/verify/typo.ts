// typo.ts — récupérer une adresse plutôt que la jeter.
//
// `jean@gmial.com` n'est pas une mauvaise adresse : c'est une bonne adresse mal
// tapée. La jeter fait perdre un prospect ; proposer `gmail.com` en un clic le
// récupère. La suggestion n'est JAMAIS appliquée toute seule — on ne devine pas
// à la place d'un humain sur quelque chose d'aussi sensible qu'un destinataire.
//
// Deux sources de candidats :
//
//   · les providers grand public (`COMMON_DOMAINS`) — la moitié des fautes ;
//   · les domaines les plus fréquents DE LA BASE elle-même, passés en
//     paramètre par l'appelant. C'est ce qui permet de rattraper
//     `@samadigtalstudio.fr` sans qu'aucune liste figée ne l'ait prévu.
//
// Module pur : aucune base, aucun réseau.

import { COMMON_DOMAINS } from './domains'
import { domainPart, localPart } from './normalize'

/**
 * Distance de Damerau-Levenshtein, bornée.
 *
 * On ajoute la TRANSPOSITION aux insertions/suppressions/substitutions parce
 * que la faute de frappe la plus courante est exactement celle-là : `gmial`
 * pour `gmail`, deux lettres interverties. Une Levenshtein simple la compte
 * pour 2 et manquerait la correction.
 *
 * `limit` coupe le calcul dès qu'aucune suite ne peut redescendre sous la
 * borne : on compare un domaine à quelques dizaines de candidats, autant ne pas
 * remplir la matrice pour rien.
 */
export function editDistance(a: string, b: string, limit = 3): number {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > limit) return limit + 1

  let prev2: number[] = []
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, j) => j)
  let current: number[] = []

  for (let i = 1; i <= a.length; i++) {
    current = new Array<number>(b.length + 1)
    current[0] = i
    let best = current[0]

    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let value = Math.min(
        current[j - 1] + 1, // insertion
        prev[j] + 1, // suppression
        prev[j - 1] + cost, // substitution
      )
      // Transposition : « ab » ↔ « ba » coûte 1, pas 2.
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, prev2[j - 2] + 1)
      }
      current[j] = value
      if (value < best) best = value
    }

    if (best > limit) return limit + 1
    prev2 = prev
    prev = current
  }

  return prev[b.length]
}

/**
 * Distance tolérée selon la longueur : sur un domaine court comme `free.fr`,
 * deux modifications ne sont plus une faute de frappe mais un autre domaine.
 */
const toleranceFor = (domain: string): number => (domain.length >= 9 ? 2 : 1)

/**
 * Domaine probablement visé, ou `null` si rien ne ressemble d'assez près.
 *
 * `extraCandidates` : les domaines fréquents de la base, pour rattraper les
 * fautes sur des domaines qu'aucune liste ne connaît.
 */
export function suggestDomain(domain: string, extraCandidates: readonly string[] = []): string | null {
  const target = domain.toLowerCase()
  if (!target) return null

  const candidates = new Set<string>([...COMMON_DOMAINS, ...extraCandidates.map((d) => d.toLowerCase())])
  // Le domaine existe tel quel dans la liste : il n'y a pas de faute à corriger.
  if (candidates.has(target)) return null

  const tolerance = toleranceFor(target)
  let best: string | null = null
  let bestDistance = tolerance + 1

  for (const candidate of candidates) {
    if (candidate === target) continue
    const distance = editDistance(target, candidate, tolerance)
    if (distance < bestDistance) {
      bestDistance = distance
      best = candidate
    } else if (distance === bestDistance && best && candidate.length < best.length) {
      // À égalité, le candidat le plus court : `gmail.com` plutôt que
      // `googlemail.com` pour `gmial.com`.
      best = candidate
    }
  }

  return bestDistance <= tolerance ? best : null
}

/**
 * Adresse corrigée, prête à être proposée dans l'interface.
 * `null` quand le domaine ne ressemble à rien de connu.
 */
export function suggestEmail(email: string, extraCandidates: readonly string[] = []): string | null {
  const suggestion = suggestDomain(domainPart(email), extraCandidates)
  return suggestion ? `${localPart(email)}@${suggestion}` : null
}
