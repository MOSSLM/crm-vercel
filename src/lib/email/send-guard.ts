// send-guard.ts — le seul endroit où l'on décide qu'un email a le droit de partir.
//
// Le garde de la phase de test (`test-guard.ts`) posait déjà le principe :
// « il n'y a qu'un seul endroit où décider si un envoi est autorisé ». Ce
// fichier étend ce principe à la délivrabilité, sans réécrire l'existant :
// `test-guard.ts` garde sa responsabilité, on ajoute deux couches par-dessus.
//
// Ordre des motifs, du plus impératif au plus provisoire :
//
//   1. `email_suppressed`  — rebond dur, plainte ou désabonnement. C'est une
//      DÉCISION, pas une mesure : elle ne se rediscute pas et ne s'annule pas
//      par une revérification. Passe avant tout, y compris avant la phase de
//      test — envoyer à quelqu'un qui s'est désabonné n'est pas un détail.
//   2. `mode_test`         — le destinataire n'est pas dans la liste blanche.
//   3. `email_invalid`     — preuve de mort : syntaxe, domaine inexistant,
//      aucun serveur mail, adresse jetable.
//   4. `email_unverified`  — pas de verdict frais. Provisoire : le tick de
//      vérification lève le blocage tout seul, en général en quelques minutes.
//
// Ce que le garde NE couvre PAS, volontairement : les emails transactionnels de
// prise de rendez-vous (`src/lib/scheduling/emails.ts`). Ils sont déclenchés par
// quelqu'un qui vient de réserver, avec l'adresse qu'il vient lui-même de
// saisir ; les bloquer casserait la réservation. Même raisonnement que pour la
// phase de test, cf. docs/regulateur-et-pipeline-commercial.md §4.

import type { SupabaseClient } from '@supabase/supabase-js'
import { loadTestPhase, recipientAllowed } from './test-guard'
import { normalizeEmail } from './verify/normalize'
import { eligibilityOf, loadSuppressions, loadVerdicts, type SendEligibility } from './verify/service'

export type BlockReason = 'mode_test' | 'email_suppressed' | 'email_invalid' | 'email_unverified'

export interface GuardVerdict {
  allowed: boolean
  reason?: BlockReason
  /** Adresses qui recevraient réellement — pour un message d'erreur utile. */
  allowlist?: string[]
  /** Explication en français du verdict de vérification, quand il y en a une. */
  detail?: string
}

const ALLOWED: GuardVerdict = { allowed: true }

export const BLOCK_LABEL: Record<BlockReason, string> = {
  mode_test: 'Phase de test — destinataire hors liste blanche',
  email_suppressed: 'Adresse retirée de la prospection (rebond, plainte ou désabonnement)',
  email_invalid: 'Adresse invalide — elle ne recevra pas',
  email_unverified: 'Adresse pas encore vérifiée — envoi retenu le temps du contrôle',
}

/* ── Réglage : le garde est-il actif ? ───────────────────────────────────── */

type SettingsCache = { at: number; verifyBeforeSend: boolean }

/**
 * Le garde est consulté à chaque envoi ; le ticker peut en enchaîner plusieurs
 * par minute. Un cache court évite une requête par email sans jamais retarder
 * la prise en compte d'un changement de plus de quelques secondes. Même durée
 * et même intention que `test-guard.ts`.
 */
const CACHE_TTL_MS = 15_000
let cache: SettingsCache | null = null

/** Vide le cache — appelé quand les réglages viennent d'être modifiés. */
export function resetSendGuardCache(): void {
  cache = null
}

/** La colonne n'existe pas encore : migration non appliquée, pas une panne. */
const isMissingColumn = (error: { code?: string; message?: string } | null | undefined): boolean =>
  !!error &&
  (error.code === '42703' ||
    error.code === 'PGRST204' ||
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    /does not exist|could not find the (table|column)/i.test(error.message ?? ''))

async function verifyEnabled(sb: SupabaseClient): Promise<boolean> {
  const now = Date.now()
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.verifyBeforeSend

  try {
    const { data, error } = await sb
      .from('regulator_settings')
      .select('verify_before_send')
      .eq('id', 'global')
      .maybeSingle()

    if (error) {
      // Colonne absente = migration non appliquée : le garde n'existe pas
      // encore, on retrouve le comportement d'avant. C'est légitime.
      if (isMissingColumn(error)) {
        cache = { at: now, verifyBeforeSend: false }
        return false
      }
      // Panne passagère : surtout NE PAS conclure « garde désactivé ». On
      // conserve la dernière valeur connue, et à défaut on garde le garde
      // ACTIF — le sens sûr est de retenir, pas d'ouvrir les vannes.
      return cache?.verifyBeforeSend ?? true
    }

    const verifyBeforeSend = (data as { verify_before_send?: boolean } | null)?.verify_before_send === true
    cache = { at: now, verifyBeforeSend }
    return verifyBeforeSend
  } catch {
    return cache?.verifyBeforeSend ?? true
  }
}

/* ── Le garde ────────────────────────────────────────────────────────────── */

/**
 * Ce destinataire peut-il recevoir un email de PROSPECTION ?
 *
 * Consulté par `sendEngineEmail` (séquences, workflows) et par l'envoi manuel.
 * Le régulateur, lui, trie la file en amont : le garde est sa dernière ligne de
 * défense, pas son seul rempart — un envoi qui arrive jusqu'ici alors qu'il
 * aurait dû être écarté serait déjà préparé, donc coûteux.
 */
export async function allowRecipient(sb: SupabaseClient, to: string | null | undefined): Promise<GuardVerdict> {
  const email = normalizeEmail(to)

  // 0. Ce qu'on ne sait pas lire n'est pas une adresse.
  //
  // Auparavant, une chaîne que `normalizeEmail` rendait `null` sautait TOUS les
  // contrôles de suppression et de vérification, et ressortait autorisée — le
  // garde laissait donc passer précisément ce qu'il y a de moins fiable.
  if (!email) {
    return { allowed: false, reason: 'email_invalid', detail: 'adresse illisible' }
  }

  // 1. La liste de suppression, TOUJOURS.
  //
  // Elle ne dépend pas de l'interrupteur `verify_before_send` : un
  // désabonnement ou une plainte est une obligation légale, pas une option de
  // confort. Couper la vérification ne doit pas rouvrir la porte à quelqu'un qui
  // a demandé qu'on cesse de lui écrire.
  const suppression = await loadSuppressions(sb, [email])
  if (!suppression.ok) {
    // Lecture impossible : on retient. « Je ne sais pas » ne vaut pas « personne
    // n'est supprimé ». Le blocage est provisoire.
    return { allowed: false, reason: 'email_unverified', detail: 'liste de suppression illisible' }
  }
  if (suppression.emails.has(email)) {
    return { allowed: false, reason: 'email_suppressed' }
  }

  // 2. Vérification de l'adresse, si le garde est actif.
  if (await verifyEnabled(sb)) {
    const verdict = (await loadVerdicts(sb, [email])).get(email)

    const eligibility = eligibilityOf(verdict)
    if (eligibility === 'blocked') {
      return { allowed: false, reason: 'email_invalid', detail: verdict?.reason || undefined }
    }
    if (eligibility === 'pending') {
      return { allowed: false, reason: 'email_unverified', detail: verdict?.reason || undefined }
    }
  }

  // 3. Phase de test.
  const phase = await loadTestPhase(sb)
  if (!recipientAllowed(phase, to)) {
    return { allowed: false, reason: 'mode_test', allowlist: [...phase.allowlist] }
  }

  return ALLOWED
}

/* ── Tri d'une liste, pour le régulateur ─────────────────────────────────── */

export interface SendPolicy {
  /** Le garde de vérification est-il actif ? */
  verifyEnabled: boolean
  /** Phase de test en cours + sa liste blanche. */
  testPhase: { active: boolean; allowlist: Set<string> }
  /** Verdict d'éligibilité par adresse normalisée. */
  eligibility: Map<string, SendEligibility>
}

/**
 * État complet du garde pour un LOT d'adresses.
 *
 * Le régulateur ne peut pas se contenter de tenter puis d'échouer : un envoi
 * retenu doit être écarté de la file AVANT d'être préparé, sinon l'inscription
 * franchit l'étape et le prospect « passe » un email qui n'est jamais parti.
 * C'est le même raisonnement que `loadTestPhase`, étendu à la vérification.
 */
export async function loadSendPolicy(sb: SupabaseClient, emails: readonly string[]): Promise<SendPolicy> {
  const normalized = [...new Set(emails.map((e) => normalizeEmail(e)).filter((e): e is string => !!e))]
  const [enabled, testPhase, suppression] = await Promise.all([
    verifyEnabled(sb),
    loadTestPhase(sb),
    // Toujours consultée, même garde coupé : voir `allowRecipient`.
    normalized.length > 0 ? loadSuppressions(sb, normalized) : Promise.resolve({ emails: new Set<string>(), ok: true }),
  ])

  const eligibility = new Map<string, SendEligibility>()
  const verdicts = enabled && normalized.length > 0 ? await loadVerdicts(sb, normalized) : null

  for (const email of normalized) {
    if (!suppression.ok) {
      eligibility.set(email, 'pending')
      continue
    }
    if (suppression.emails.has(email)) {
      eligibility.set(email, 'blocked')
      continue
    }
    eligibility.set(email, verdicts ? eligibilityOf(verdicts.get(email)) : 'ok')
  }

  return { verifyEnabled: enabled, testPhase, eligibility }
}

/** Éligibilité d'une adresse dans l'état courant du garde. */
export function eligibilityFor(policy: SendPolicy, to: string | null | undefined): SendEligibility {
  const email = normalizeEmail(to)
  // Illisible : jamais « ok », même garde coupé.
  if (!email) return 'blocked'
  // Absente de la table : le garde est coupé ET l'adresse n'est pas supprimée.
  return policy.eligibility.get(email) ?? (policy.verifyEnabled ? 'pending' : 'ok')
}
