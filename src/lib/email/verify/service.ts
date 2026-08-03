// service.ts — la couche base du vérificateur.
//
// Le jugement vit dans `score.ts` (pur, testé) ; ici on ne fait que le nourrir
// avec l'état réel du CRM et ranger le résultat. Trois usages, trois coûts très
// différents — c'est la distinction importante de ce fichier :
//
//   · `loadVerdicts`  — LECTURE SEULE, aucun réseau. C'est ce qu'appelle le
//     régulateur à chaque tick : il ne doit jamais attendre une résolution DNS
//     pour décider si un email part.
//   · `verifyEmail`   — la chaîne complète, avec DNS. Quelques centaines de
//     millisecondes. Appelée à la saisie d'une adresse, pour un retour immédiat.
//   · `verifyDue`     — le travail de fond, par lots, groupé par domaine.
//     Appelé par le tick de vérification toutes les cinq minutes.
//
// Tout dégrade proprement si la migration n'a pas encore été appliquée : les
// tables manquantes sont traitées comme vides, et le CRM continue de tourner.

import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveMailDomain, type DnsAnswer } from './dns'
import { guessCatchAll, isDisposable, isFreeProvider, providerFromMx } from './domains'
import { domainPart, normalizeEmail } from './normalize'
import {
  EMPTY_DOMAIN_HISTORY,
  EMPTY_HISTORY,
  judge,
  ttlDaysFor,
  type AddressHistory,
  type DomainHistory,
  type SubStatus,
  type Verdict,
  type VerificationStatus,
} from './score'
import { checkSyntax } from './syntax'
import { suggestEmail } from './typo'

const DAY_MS = 86_400_000

/** Fraîcheur d'une résolution DNS. Un domaine ne change pas de MX chaque jour. */
const DOMAIN_TTL_DAYS = 7
/** Résolveurs muets : on retente au prochain tick plutôt que dans une semaine. */
const DOMAIN_RETRY_MS = 15 * 60_000

/** La table n'existe pas encore (migration non appliquée) → on fait comme si elle était vide. */
const isMissingTable = (error: { code?: string; message?: string } | null | undefined): boolean => {
  if (!error) return false
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    error.code === '42703' ||
    /does not exist|could not find the (table|column)/i.test(error.message ?? '')
  )
}

/* ── Ce que le régulateur lit ────────────────────────────────────────────── */

export interface StoredVerdict {
  email: string
  status: VerificationStatus
  subStatus: SubStatus | null
  score: number
  suggestion: string | null
  reason: string
  checkedAt: number
  expiresAt: number
  /** Le verdict est-il encore valable ? Périmé = à revérifier avant d'envoyer. */
  fresh: boolean
  /** Cette adresse est-elle sur la liste de suppression ? */
  suppressed: boolean
}

/**
 * État d'une adresse du point de vue de l'envoi. C'est le seul vocabulaire que
 * le régulateur et le garde ont besoin de connaître.
 */
export type SendEligibility =
  /** Rien à signaler : envoi normal. */
  | 'ok'
  /** Signal négatif concret : envoi possible, mais sous quota. */
  | 'risky'
  /** Preuve de mort ou suppression : aucun envoi. */
  | 'blocked'
  /** Pas de verdict frais : il faut vérifier avant d'envoyer. */
  | 'pending'

export function eligibilityOf(verdict: StoredVerdict | undefined): SendEligibility {
  if (!verdict) return 'pending'
  if (verdict.suppressed) return 'blocked'
  // Un verdict de mort reste vrai même périmé : une syntaxe cassée ne se répare
  // pas toute seule, et revérifier ne servirait qu'à retarder le constat.
  if (verdict.status === 'invalid') return 'blocked'
  if (!verdict.fresh) return 'pending'
  if (verdict.status === 'risky') return 'risky'
  if (verdict.status === 'valid') return 'ok'
  return 'pending'
}

type VerificationRow = {
  email: string
  status: VerificationStatus | null
  sub_status: string | null
  score: number | null
  suggestion: string | null
  checked_at: string | null
  expires_at: string | null
  details: Record<string, unknown> | null
}

const toStored = (row: VerificationRow, suppressed: boolean, now: number): StoredVerdict => {
  const expiresAt = row.expires_at ? Date.parse(row.expires_at) : 0
  return {
    email: row.email,
    status: row.status ?? 'pending',
    subStatus: (row.sub_status as SubStatus | null) ?? null,
    score: row.score ?? 0,
    suggestion: row.suggestion ?? null,
    reason: typeof row.details?.reason === 'string' ? (row.details.reason as string) : '',
    checkedAt: row.checked_at ? Date.parse(row.checked_at) : 0,
    expiresAt,
    fresh: Number.isFinite(expiresAt) && expiresAt > now,
    suppressed,
  }
}

/** Découpe une liste en tranches — `in (…)` sur 5 000 valeurs fait tomber PostgREST. */
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * Verdicts connus pour ces adresses. **Aucun réseau, aucune écriture** — c'est
 * ce que le ticker appelle, et il tourne toutes les minutes.
 *
 * Les adresses inconnues sont simplement absentes de la Map : l'appelant les
 * traitera comme `pending`, ce qui est exact.
 */
export async function loadVerdicts(
  sb: SupabaseClient,
  emails: readonly string[],
): Promise<Map<string, StoredVerdict>> {
  const out = new Map<string, StoredVerdict>()
  const normalized = [...new Set(emails.map((e) => normalizeEmail(e)).filter((e): e is string => !!e))]
  if (normalized.length === 0) return out

  const now = Date.now()
  const suppressed = await loadSuppressions(sb, normalized)

  for (const slice of chunk(normalized, 500)) {
    try {
      const { data, error } = await sb
        .from('email_verifications')
        .select('email,status,sub_status,score,suggestion,checked_at,expires_at,details')
        .in('email', slice)
      if (error) {
        if (isMissingTable(error)) return out
        continue
      }
      for (const row of (data ?? []) as VerificationRow[]) {
        out.set(row.email, toStored(row, suppressed.has(row.email), now))
      }
    } catch {
      return out
    }
  }

  // Une adresse supprimée mais jamais vérifiée doit quand même ressortir
  // bloquée : la suppression prime sur tout, y compris sur l'absence de verdict.
  for (const email of suppressed) {
    if (!out.has(email)) {
      out.set(email, {
        email,
        status: 'invalid',
        subStatus: null,
        score: 0,
        suggestion: null,
        reason: 'retirée de la prospection',
        checkedAt: 0,
        expiresAt: 0,
        fresh: true,
        suppressed: true,
      })
    }
  }

  return out
}

/** Adresses présentes dans `email_suppressions`, parmi celles demandées. */
export async function loadSuppressions(
  sb: SupabaseClient,
  emails: readonly string[],
): Promise<Set<string>> {
  const out = new Set<string>()
  if (emails.length === 0) return out
  for (const slice of chunk([...emails], 500)) {
    try {
      const { data, error } = await sb.from('email_suppressions').select('email').in('email', slice)
      if (error) return out
      for (const row of (data ?? []) as { email: string }[]) out.add(row.email)
    } catch {
      return out
    }
  }
  return out
}

/* ── Inscription en file ─────────────────────────────────────────────────── */

/**
 * Fait entrer une adresse dans la file de vérification. Sans effet si elle y est
 * déjà — ce qui rend l'appel gratuit à répétition, et donc appelable depuis
 * n'importe quel chemin de saisie sans se demander si c'est la première fois.
 */
export async function enqueueVerification(sb: SupabaseClient, raw: string | null | undefined): Promise<void> {
  const email = normalizeEmail(raw)
  if (!email) return
  try {
    await sb
      .from('email_verifications')
      .insert({ email, domain: domainPart(email), status: 'pending', expires_at: new Date(0).toISOString() })
  } catch {
    /* déjà en file, ou table absente : rien à faire */
  }
}

/* ── Faits sur un domaine ────────────────────────────────────────────────── */

export interface DomainFacts {
  domain: string
  dns: DnsAnswer
  history: DomainHistory
  freeProvider: boolean
  /** Un envoi est-il déjà parti vers ce domaine ? Sert à la première touche. */
  everSent: boolean
}

type DomainRow = {
  domain: string
  has_mx: boolean | null
  mx_hosts: string[] | null
  provider: string | null
  free_provider: boolean | null
  hard_bounce_count: number | null
  delivered_count: number | null
  first_send_at: string | null
  expires_at: string | null
}

const rowToFacts = (row: DomainRow): DomainFacts => ({
  domain: row.domain,
  dns: {
    exists: true,
    mxHosts: row.mx_hosts ?? [],
    hasAddress: (row.mx_hosts ?? []).length > 0 || row.has_mx === true,
    unresolved: false,
  },
  history: {
    hardBounceCount: row.hard_bounce_count ?? 0,
    deliveredCount: row.delivered_count ?? 0,
  },
  freeProvider: row.free_provider ?? isFreeProvider(row.domain),
  everSent: !!row.first_send_at,
})

/**
 * Faits sur un lot de domaines : cache d'abord, résolution DNS ensuite pour
 * ceux qui sont périmés. Deux cents garages partagent une douzaine de domaines —
 * c'est ce groupement qui rend la vérification de masse tenable.
 */
export async function loadDomainFacts(
  sb: SupabaseClient,
  domains: readonly string[],
): Promise<Map<string, DomainFacts>> {
  const out = new Map<string, DomainFacts>()
  const wanted = [...new Set(domains.filter(Boolean))]
  if (wanted.length === 0) return out

  const now = Date.now()
  const stale: string[] = []
  const rows = new Map<string, DomainRow>()

  for (const slice of chunk(wanted, 500)) {
    try {
      const { data, error } = await sb
        .from('email_domain_cache')
        .select('domain,has_mx,mx_hosts,provider,free_provider,hard_bounce_count,delivered_count,first_send_at,expires_at')
        .in('domain', slice)
      if (error) break
      for (const row of (data ?? []) as DomainRow[]) rows.set(row.domain, row)
    } catch {
      break
    }
  }

  for (const domain of wanted) {
    const row = rows.get(domain)
    const expiresAt = row?.expires_at ? Date.parse(row.expires_at) : 0
    if (row && Number.isFinite(expiresAt) && expiresAt > now) out.set(domain, rowToFacts(row))
    else stale.push(domain)
  }

  // Les résolutions se font en parallèle, mais par petits paquets : un lot de
  // 300 domaines lancé d'un coup ferait tomber le résolveur avant nous.
  for (const slice of chunk(stale, 10)) {
    const resolved = await Promise.all(
      slice.map(async (domain) => ({ domain, dns: await resolveMailDomain(domain) })),
    )
    for (const { domain, dns } of resolved) {
      const row = rows.get(domain)
      const history: DomainHistory = row
        ? { hardBounceCount: row.hard_bounce_count ?? 0, deliveredCount: row.delivered_count ?? 0 }
        : { ...EMPTY_DOMAIN_HISTORY }
      out.set(domain, {
        domain,
        dns,
        history,
        freeProvider: isFreeProvider(domain),
        everSent: !!row?.first_send_at,
      })
      await saveDomainFacts(sb, domain, dns)
    }
  }

  return out
}

async function saveDomainFacts(sb: SupabaseClient, domain: string, dns: DnsAnswer): Promise<void> {
  const provider = dns.mxHosts.length > 0 ? providerFromMx(dns.mxHosts) : null
  // Un résolveur muet ne mérite pas une semaine de cache : on retente vite.
  const expiresAt = dns.unresolved ? Date.now() + DOMAIN_RETRY_MS : Date.now() + DOMAIN_TTL_DAYS * DAY_MS
  try {
    await sb.from('email_domain_cache').upsert(
      {
        domain,
        has_mx: dns.mxHosts.length > 0,
        mx_hosts: dns.mxHosts,
        provider,
        disposable: isDisposable(domain),
        free_provider: isFreeProvider(domain),
        catch_all_guess: provider ? guessCatchAll(provider) : false,
        checked_at: new Date().toISOString(),
        expires_at: new Date(expiresAt).toISOString(),
        last_error: dns.error ?? null,
      },
      { onConflict: 'domain' },
    )
  } catch {
    /* le cache est une optimisation, pas une dépendance */
  }
}

/* ── Première touche par domaine ─────────────────────────────────────────── */

export interface DomainSendState {
  /** Un email est-il déjà parti vers ce domaine, quel qu'en soit le destinataire ? */
  everSent: boolean
  /** Provider grand public : la première touche n'a pas de sens (cf. plus bas). */
  freeProvider: boolean
}

/**
 * État d'envoi des domaines, **sans aucune résolution DNS** — c'est ce que lit
 * le régulateur à chaque tick.
 *
 * Sert à la « première touche » : sur un domaine d'entreprise vers lequel rien
 * n'est jamais parti et qui porte plusieurs adresses, une seule s'en va, les
 * autres attendent son verdict. Si elle rebond, les suivantes sont gelées AVANT
 * d'être envoyées.
 *
 * Sans objet sur `gmail.com` ou `orange.fr` : des milliers de boîtes
 * indépendantes y cohabitent, la première ne dit rien des suivantes.
 */
export async function loadDomainSendState(
  sb: SupabaseClient,
  domains: readonly string[],
): Promise<Map<string, DomainSendState>> {
  const out = new Map<string, DomainSendState>()
  const wanted = [...new Set(domains.filter(Boolean))]
  if (wanted.length === 0) return out
  for (const slice of chunk(wanted, 500)) {
    try {
      const { data, error } = await sb
        .from('email_domain_cache')
        .select('domain,first_send_at,free_provider')
        .in('domain', slice)
      if (error) return out
      for (const row of (data ?? []) as { domain: string; first_send_at: string | null; free_provider: boolean | null }[]) {
        out.set(row.domain, {
          everSent: !!row.first_send_at,
          freeProvider: row.free_provider ?? isFreeProvider(row.domain),
        })
      }
    } catch {
      return out
    }
  }
  return out
}

/**
 * Note qu'un email est réellement parti. Appelé APRÈS l'acceptation par Resend,
 * jamais avant : c'est ce qui ouvre la voie aux autres adresses du domaine et ce
 * qui donne son dénominateur au taux de rebond.
 */
export async function recordSend(sb: SupabaseClient, raw: string | null | undefined): Promise<void> {
  const email = normalizeEmail(raw)
  if (!email) return
  const domain = domainPart(email)
  const nowIso = new Date().toISOString()
  try {
    const { error } = await sb.rpc('bump_email_send_counters', {
      p_email: email,
      p_domain: domain,
      p_at: nowIso,
    })
    if (!error) return
  } catch {
    /* la fonction SQL n'est pas là : on retombe sur les deux écritures */
  }
  // Repli : le compteur peut perdre une unité en cas de concurrence, ce qui est
  // sans effet — il ne sert qu'à des ratios, jamais à une décision unitaire.
  await fallbackBumpCounters(sb, email, domain, nowIso)
}

async function fallbackBumpCounters(
  sb: SupabaseClient,
  email: string,
  domain: string,
  nowIso: string,
): Promise<void> {
  try {
    const { data } = await sb.from('email_verifications').select('sent_count').eq('email', email).maybeSingle()
    await sb
      .from('email_verifications')
      .update({ sent_count: Number((data as { sent_count?: number } | null)?.sent_count ?? 0) + 1 })
      .eq('email', email)
  } catch {
    /* le compteur d'adresse est indicatif */
  }
  try {
    const { data } = await sb
      .from('email_domain_cache')
      .select('sent_count,first_send_at')
      .eq('domain', domain)
      .maybeSingle()
    const row = data as { sent_count?: number; first_send_at?: string | null } | null
    await sb.from('email_domain_cache').upsert(
      {
        domain,
        sent_count: Number(row?.sent_count ?? 0) + 1,
        first_send_at: row?.first_send_at ?? nowIso,
        last_send_at: nowIso,
      },
      { onConflict: 'domain' },
    )
  } catch {
    /* idem côté domaine */
  }
}

/* ── Domaines fréquents, pour la détection de faute de frappe ────────────── */

let frequentCache: { at: number; domains: string[] } | null = null
const FREQUENT_TTL_MS = 10 * 60_000

/**
 * Les domaines les plus présents dans la base. Ils servent de cibles
 * supplémentaires à la correction de frappe : c'est ce qui permet de rattraper
 * une faute sur un domaine qu'aucune liste figée ne connaît.
 */
export async function frequentDomains(sb: SupabaseClient): Promise<string[]> {
  const now = Date.now()
  if (frequentCache && now - frequentCache.at < FREQUENT_TTL_MS) return frequentCache.domains
  const domains: string[] = []
  try {
    const { data } = await sb
      .from('email_domain_cache')
      .select('domain,delivered_count')
      .gt('delivered_count', 0)
      .order('delivered_count', { ascending: false })
      .limit(60)
    for (const row of (data ?? []) as { domain: string }[]) domains.push(row.domain)
  } catch {
    /* pas de candidats supplémentaires : la liste figée suffit */
  }
  frequentCache = { at: now, domains }
  return domains
}

/** Vide le cache des domaines fréquents — utile en test. */
export function resetVerifyCaches(): void {
  frequentCache = null
}

/* ── Vérification ────────────────────────────────────────────────────────── */

export interface VerifyOptions {
  /** Fraîcheur exigée d'un verdict valide, en jours (`verify_ttl_days`). */
  validTtlDays?: number
  /** Revérifier même si le verdict en base est encore frais. */
  force?: boolean
}

export interface VerifyResult extends Verdict {
  email: string
  expiresAt: number
}

/**
 * Vérifie une adresse de bout en bout et range le verdict.
 *
 * Le verdict frais déjà en base est rendu tel quel : c'est ce qui fait qu'une
 * adresse valide n'est retestée qu'une fois tous les cent vingt jours, et
 * jamais du tout tant qu'elle continue de recevoir.
 */
export async function verifyEmail(
  sb: SupabaseClient,
  raw: string | null | undefined,
  options: VerifyOptions = {},
): Promise<VerifyResult | null> {
  const email = normalizeEmail(raw)
  if (!email) return null
  const [result] = await verifyMany(sb, [email], options)
  return result ?? null
}

/**
 * Vérifie un lot. Les domaines sont résolus UNE fois pour toutes les adresses
 * qui les partagent — c'est là que se gagne le temps sur un lot de plusieurs
 * centaines d'adresses.
 */
export async function verifyMany(
  sb: SupabaseClient,
  raws: readonly string[],
  options: VerifyOptions = {},
): Promise<VerifyResult[]> {
  const validTtlDays = options.validTtlDays ?? 120
  const emails = [...new Set(raws.map((r) => normalizeEmail(r)).filter((e): e is string => !!e))]
  if (emails.length === 0) return []

  const now = Date.now()
  const stored = options.force ? new Map<string, StoredVerdict>() : await loadVerdicts(sb, emails)

  // Ce qui a déjà un verdict frais n'a pas besoin qu'on y retouche.
  const todo = emails.filter((email) => {
    if (options.force) return true
    const known = stored.get(email)
    return !known || !known.fresh
  })
  if (todo.length === 0) return []

  // La syntaxe se juge sans réseau : autant écarter tout de suite ce qui n'a
  // même pas besoin d'une résolution DNS.
  const syntaxOf = new Map(todo.map((email) => [email, checkSyntax(email)]))
  const needDns = todo.filter((email) => syntaxOf.get(email)?.ok && !isDisposable(domainPart(email)))

  // Tout ce qui se lit en base se lit EN UNE FOIS. Un lot de trois cents
  // adresses ne doit pas produire trois cents requêtes.
  const [domainFacts, candidates, histories, suppressions] = await Promise.all([
    loadDomainFacts(sb, needDns.map(domainPart)),
    frequentDomains(sb),
    loadAddressHistories(sb, todo),
    loadSuppressionReasons(sb, todo),
  ])

  const results: VerifyResult[] = []
  const rows: Record<string, unknown>[] = []

  for (const email of todo) {
    const domain = domainPart(email)
    const facts = domainFacts.get(domain)
    const reason = suppressions.get(email) ?? null

    const verdict = judge({
      email,
      syntax: syntaxOf.get(email) ?? checkSyntax(email),
      dns: facts?.dns ?? null,
      history: histories.get(email) ?? { ...EMPTY_HISTORY },
      domainHistory: facts?.history ?? EMPTY_DOMAIN_HISTORY,
      suppressed: reason ? { reason } : null,
      suggestion: suggestEmail(email, candidates),
    })

    const expiresAt = now + ttlDaysFor(verdict, validTtlDays) * DAY_MS
    results.push({ ...verdict, email, expiresAt })
    rows.push({
      email,
      domain,
      status: verdict.status,
      sub_status: verdict.subStatus,
      score: verdict.score,
      source: 'auto',
      suggestion: verdict.details.suggestion,
      checked_at: new Date(now).toISOString(),
      expires_at: new Date(expiresAt).toISOString(),
      details: { ...verdict.details, reason: verdict.reason },
      last_error: null,
    })
  }

  for (const slice of chunk(rows, 200)) {
    try {
      await sb.from('email_verifications').upsert(slice, { onConflict: 'email' })
    } catch {
      /* la vérification a eu lieu, seul le rangement a échoué */
    }
  }

  return results
}

/**
 * Compteurs d'envoi de ces adresses. Ils viennent des webhooks Resend, donc
 * d'événements réels — pas d'une estimation.
 */
async function loadAddressHistories(
  sb: SupabaseClient,
  emails: readonly string[],
): Promise<Map<string, AddressHistory>> {
  const out = new Map<string, AddressHistory>()
  if (emails.length === 0) return out
  for (const slice of chunk([...emails], 500)) {
    try {
      const { data, error } = await sb
        .from('email_verifications')
        .select('email,delivered_count,hard_bounce_count,soft_bounce_count,complaint_count')
        .in('email', slice)
      if (error) return out
      for (const row of (data ?? []) as Record<string, string | number | null>[]) {
        out.set(String(row.email), {
          deliveredCount: Number(row.delivered_count ?? 0),
          hardBounceCount: Number(row.hard_bounce_count ?? 0),
          softBounceCount: Number(row.soft_bounce_count ?? 0),
          complaintCount: Number(row.complaint_count ?? 0),
        })
      }
    } catch {
      return out
    }
  }
  return out
}

type SuppressionReason = 'hard_bounce' | 'complaint' | 'unsubscribe' | 'manual'

const REASONS: ReadonlySet<string> = new Set(['hard_bounce', 'complaint', 'unsubscribe', 'manual'])

/** Motifs de suppression, en une requête pour tout le lot. */
async function loadSuppressionReasons(
  sb: SupabaseClient,
  emails: readonly string[],
): Promise<Map<string, SuppressionReason>> {
  const out = new Map<string, SuppressionReason>()
  if (emails.length === 0) return out
  for (const slice of chunk([...emails], 500)) {
    try {
      const { data, error } = await sb.from('email_suppressions').select('email,reason').in('email', slice)
      if (error) return out
      for (const row of (data ?? []) as { email: string; reason: string }[]) {
        if (REASONS.has(row.reason)) out.set(row.email, row.reason as SuppressionReason)
      }
    } catch {
      return out
    }
  }
  return out
}

/* ── Travail de fond ─────────────────────────────────────────────────────── */

export interface DueBatch {
  emails: string[]
  /** Combien restaient à faire au-delà de la tranche rendue. */
  remaining: number
}

/**
 * Prochaines adresses à vérifier, dans l'ordre qui sert le CRM :
 *
 *   1. celles qui n'ont jamais été vues (`pending`) — sans elles, une séquence
 *      toute neuve reste gelée ;
 *   2. celles dont le verdict est périmé, les plus anciennes d'abord.
 */
export async function loadDueForVerification(sb: SupabaseClient, limit: number): Promise<DueBatch> {
  const emails: string[] = []
  const nowIso = new Date().toISOString()

  try {
    const { data } = await sb
      .from('email_verifications')
      .select('email')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(limit)
    for (const row of (data ?? []) as { email: string }[]) emails.push(row.email)
  } catch {
    return { emails: [], remaining: 0 }
  }

  if (emails.length < limit) {
    try {
      const { data } = await sb
        .from('email_verifications')
        .select('email')
        .neq('status', 'pending')
        .lte('expires_at', nowIso)
        .order('expires_at', { ascending: true })
        .limit(limit - emails.length)
      for (const row of (data ?? []) as { email: string }[]) emails.push(row.email)
    } catch {
      /* la première salve suffit pour ce tick */
    }
  }

  let remaining = 0
  try {
    const { count } = await sb
      .from('email_verifications')
      .select('email', { count: 'exact', head: true })
      .or(`status.eq.pending,expires_at.lte.${nowIso}`)
    remaining = Math.max(0, (count ?? 0) - emails.length)
  } catch {
    /* le compte est indicatif */
  }

  return { emails, remaining }
}
