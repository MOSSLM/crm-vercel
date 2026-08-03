// score.ts — le jugement, et la seule pièce qui décide.
//
// Tout ce qui précède (syntaxe, DNS, listes, historique) ne fait que RÉCOLTER
// des faits. Ici on les assemble en un verdict, sans base ni réseau : c'est une
// fonction pure, donc entièrement testable au cas par cas.
//
// ── La distinction qui fait tout ─────────────────────────────────────────────
//
// On pourrait croire qu'il faut séparer « adresse prouvée » de « adresse non
// prouvée ». Ce serait inutile : le premier jour, AUCUNE adresse n'a jamais reçu
// d'email de notre part, donc tout serait « non prouvé » et il n'y aurait rien à
// arbitrer. La seule preuve d'existence d'une boîte, c'est la livraison — elle
// arrive après l'envoi, pas avant.
//
// La bonne séparation est donc :
//
//   invalid  — PREUVE de mort. Syntaxe cassée, domaine inexistant, aucun
//              serveur mail, domaine jetable, rebond dur déjà encaissé.
//              Zéro envoi, jamais.
//
//   risky    — pas de preuve de mort, mais un SIGNAL NÉGATIF CONCRET : un
//              rebond dur sur le même domaine d'entreprise, un domaine sans MX,
//              trois rebonds doux, des serveurs mail qui pointent vers un
//              parking de noms de domaine. Ces adresses partent quand même,
//              mais au compte-gouttes (`risky_daily_share`) : c'est le seul
//              moyen de les trancher sans exposer la réputation du domaine.
//
//   valid    — rien à signaler. C'est la majorité, et c'est elle qui remplit le
//              plafond quotidien. « Valid » ne veut pas dire « boîte prouvée » :
//              ça veut dire « aucune raison de s'en méfier ».
//
//   unknown  — impossible de trancher (aucun résolveur DNS n'a répondu). On
//              n'envoie pas, mais on réessaie vite : condamner une bonne adresse
//              parce qu'un résolveur a hoqueté serait pire que d'attendre.
//
// Le `catch-all` n'entre PAS dans « risky ». Chez les mutualisés français (OVH,
// Ionos, o2switch), le serveur accepte toutes les adresses : rien ne peut jamais
// prouver qu'une boîte existe. C'est l'état normal d'une grande partie de nos
// prospects, pas une anomalie — le pénaliser reviendrait à mettre la moitié de
// la base au compte-gouttes sans le moindre fait à lui reprocher.

import {
  guessCatchAll,
  isDisposable,
  isFreeProvider,
  isRoleAddress,
  isUnattendedAddress,
  providerFromMx,
  type MailProvider,
} from './domains'
import { domainPart, localPart } from './normalize'
import type { DnsAnswer } from './dns'
import type { SyntaxResult } from './syntax'

export type VerificationStatus = 'valid' | 'risky' | 'invalid' | 'unknown' | 'pending'

export type SubStatus =
  | 'syntaxe'
  | 'jetable'
  | 'boite_automatique'
  | 'domaine_mort'
  | 'sans_mx'
  | 'parking'
  | 'domaine_suspect'
  | 'bounce_dur'
  | 'bounce_doux'
  | 'plainte'
  | 'desabonne'
  | 'dns_muet'
  | 'prouvee'
  | 'mx_ok'

/** Ce que l'historique d'envoi sait de CETTE adresse. */
export interface AddressHistory {
  deliveredCount: number
  hardBounceCount: number
  softBounceCount: number
  complaintCount: number
}

/**
 * Ce que l'historique d'envoi sait de son DOMAINE.
 *
 * Volontairement ignoré sur un provider grand public : qu'une adresse
 * `@gmail.com` ait rebondi ne dit rien de la suivante. Sur `@garage-dupont.fr`,
 * au contraire, un rebond dur trahit un domaine mort et rend suspectes toutes
 * les autres adresses du même garage — avant même de les avoir essayées.
 */
export interface DomainHistory {
  hardBounceCount: number
  deliveredCount: number
}

export interface VerifyFacts {
  /** Adresse déjà passée par `normalizeEmail`. */
  email: string
  syntax: SyntaxResult
  /** Résolution DNS. `null` quand elle n'a pas encore eu lieu. */
  dns: DnsAnswer | null
  history: AddressHistory
  domainHistory: DomainHistory
  /** Présente dans `email_suppressions` — prioritaire sur tout le reste. */
  suppressed?: { reason: 'hard_bounce' | 'complaint' | 'unsubscribe' | 'manual' } | null
  suggestion?: string | null
}

export interface Verdict {
  status: VerificationStatus
  subStatus: SubStatus
  /** 0-100, indicatif : sert au tri et à l'affichage, jamais à décider seul. */
  score: number
  /** Phrase française affichable telle quelle dans l'interface. */
  reason: string
  details: {
    domain: string
    provider: MailProvider | null
    mxHosts: string[]
    catchAll: boolean
    freeProvider: boolean
    roleAddress: boolean
    disposable: boolean
    suggestion: string | null
  }
}

export const EMPTY_HISTORY: AddressHistory = {
  deliveredCount: 0,
  hardBounceCount: 0,
  softBounceCount: 0,
  complaintCount: 0,
}

export const EMPTY_DOMAIN_HISTORY: DomainHistory = { hardBounceCount: 0, deliveredCount: 0 }

/** Au-delà, on cesse de mettre un rebond passager sur le compte du hasard. */
const SOFT_BOUNCE_LIMIT = 3

/**
 * Le verdict. Ordre des règles délibéré : les preuves de mort d'abord, les
 * signaux négatifs ensuite, le « rien à signaler » en dernier.
 */
export function judge(facts: VerifyFacts): Verdict {
  const domain = domainPart(facts.email)
  const local = localPart(facts.email)
  const dns = facts.dns
  const provider = dns && dns.mxHosts.length > 0 ? providerFromMx(dns.mxHosts) : null
  const freeProvider = isFreeProvider(domain)
  const disposable = isDisposable(domain)

  const details: Verdict['details'] = {
    domain,
    provider,
    mxHosts: dns?.mxHosts ?? [],
    catchAll: provider ? guessCatchAll(provider) : false,
    freeProvider,
    roleAddress: isRoleAddress(local),
    disposable,
    suggestion: facts.suggestion ?? null,
  }

  const verdict = (status: VerificationStatus, subStatus: SubStatus, score: number, reason: string): Verdict => ({
    status,
    subStatus,
    score,
    reason,
    details,
  })

  // ── Preuves de mort ──────────────────────────────────────────────────────

  if (facts.suppressed) {
    switch (facts.suppressed.reason) {
      case 'complaint':
        return verdict('invalid', 'plainte', 0, 'a signalé nos emails comme indésirables')
      case 'unsubscribe':
        return verdict('invalid', 'desabonne', 0, 's’est désabonné')
      case 'hard_bounce':
        return verdict('invalid', 'bounce_dur', 0, 'a déjà rebondi — la boîte n’existe pas')
      default:
        return verdict('invalid', 'desabonne', 0, 'retirée à la main de la prospection')
    }
  }

  if (!facts.syntax.ok) {
    return verdict('invalid', 'syntaxe', 0, facts.syntax.message ?? 'adresse mal formée')
  }

  if (disposable) {
    return verdict('invalid', 'jetable', 0, 'adresse jetable — créée pour être abandonnée')
  }

  if (isUnattendedAddress(local)) {
    return verdict('invalid', 'boite_automatique', 0, 'boîte automatique — personne ne la lit')
  }

  if (facts.history.hardBounceCount > 0) {
    return verdict('invalid', 'bounce_dur', 0, 'a déjà rebondi — la boîte n’existe pas')
  }
  if (facts.history.complaintCount > 0) {
    return verdict('invalid', 'plainte', 0, 'a signalé nos emails comme indésirables')
  }

  // ── Le DNS n'a pas parlé : on ne tranche pas ─────────────────────────────

  if (!dns) {
    return verdict('unknown', 'dns_muet', 0, 'pas encore vérifiée')
  }
  if (dns.unresolved) {
    return verdict('unknown', 'dns_muet', 0, dns.error ?? 'le DNS n’a pas répondu — nouvel essai bientôt')
  }

  // ── Le DNS a parlé : preuves de mort restantes ───────────────────────────

  if (!dns.exists) {
    return verdict('invalid', 'domaine_mort', 0, 'le domaine n’existe pas')
  }
  if (dns.mxHosts.length === 0 && !dns.hasAddress) {
    return verdict('invalid', 'sans_mx', 0, 'le domaine n’a aucun serveur mail')
  }

  // ── Signaux négatifs concrets ────────────────────────────────────────────

  if (dns.mxHosts.length === 0) {
    // Le domaine répond mais ne déclare aucun serveur mail. La RFC autorise la
    // remise directe sur son adresse ; en pratique ça passe une fois sur deux.
    return verdict('risky', 'sans_mx', 35, 'domaine sans serveur mail déclaré — remise incertaine')
  }
  if (provider === 'parking') {
    return verdict('risky', 'parking', 25, 'domaine en parking — le courrier n’arrive nulle part')
  }
  if (!freeProvider && facts.domainHistory.hardBounceCount > 0) {
    return verdict(
      'risky',
      'domaine_suspect',
      30,
      'une autre adresse de ce domaine a déjà rebondi',
    )
  }
  if (facts.history.softBounceCount >= SOFT_BOUNCE_LIMIT) {
    return verdict('risky', 'bounce_doux', 40, `${facts.history.softBounceCount} rebonds temporaires accumulés`)
  }

  // ── Rien à signaler ──────────────────────────────────────────────────────

  if (facts.history.deliveredCount > 0) {
    return verdict('valid', 'prouvee', 100, 'a déjà reçu nos emails')
  }

  // Le score module l'affichage, pas la décision : une adresse générique sur un
  // mutualisé catch-all est parfaitement envoyable, on sait juste qu'on ne
  // pourra jamais la prouver autrement qu'en lui écrivant.
  let score = 70
  if (freeProvider) score += 10
  if (details.catchAll) score -= 10
  if (details.roleAddress) score += 5

  return verdict('valid', 'mx_ok', Math.max(0, Math.min(100, score)), 'domaine joignable, rien à signaler')
}

/* ── Fraîcheur du verdict ────────────────────────────────────────────────── */

/**
 * Certains verdicts ne se rejouent jamais : une syntaxe cassée le restera, un
 * domaine jetable aussi, et une boîte qui a rebondi dur n'est pas près de
 * renaître. Les revérifier serait du travail pur perdu.
 */
export function isPermanent(subStatus: SubStatus): boolean {
  return (
    subStatus === 'syntaxe' ||
    subStatus === 'jetable' ||
    subStatus === 'boite_automatique' ||
    subStatus === 'bounce_dur' ||
    subStatus === 'plainte' ||
    subStatus === 'desabonne'
  )
}

/** Cent ans : une manière lisible de dire « plus jamais » sans colonne en plus. */
export const FOREVER_DAYS = 36_500

/**
 * Combien de temps ce verdict reste-t-il valable ?
 *
 * `validTtlDays` vient des réglages (120 jours par défaut, `verify_ttl_days`).
 * Les autres durées sont fixes et volontairement courtes : un domaine mort peut
 * être racheté, un DNS muet reparle en quelques minutes.
 */
export function ttlDaysFor(verdict: Pick<Verdict, 'status' | 'subStatus'>, validTtlDays: number): number {
  if (isPermanent(verdict.subStatus)) return FOREVER_DAYS
  switch (verdict.status) {
    case 'valid':
      return Math.max(1, validTtlDays)
    case 'risky':
      // Un signal négatif mérite d'être réexaminé plus souvent qu'un feu vert :
      // il tombe souvent tout seul dès que le domaine se remet en ordre.
      return 30
    case 'invalid':
      // Domaine mort ou sans MX : ça peut se rouvrir, mais pas demain.
      return 365
    default:
      // `unknown` : le réseau a flanché, on retente vite.
      return 3
  }
}
