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
import { eligibilityOf, loadVerdicts, type SendEligibility } from './verify/service'

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

async function verifyEnabled(sb: SupabaseClient): Promise<boolean> {
  const now = Date.now()
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.verifyBeforeSend

  let verifyBeforeSend = false
  try {
    const { data } = await sb
      .from('regulator_settings')
      .select('verify_before_send')
      .eq('id', 'global')
      .maybeSingle()
    verifyBeforeSend = (data as { verify_before_send?: boolean } | null)?.verify_before_send === true
  } catch {
    // Migration pas encore appliquée : on n'invente pas un garde qui bloquerait
    // des envois légitimes. Même parti pris que le garde de phase de test.
    verifyBeforeSend = false
  }

  cache = { at: now, verifyBeforeSend }
  return verifyBeforeSend
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

  // 1. Suppression et vérification (seulement si le garde est actif).
  if (email && (await verifyEnabled(sb))) {
    const verdicts = await loadVerdicts(sb, [email])
    const verdict = verdicts.get(email)

    if (verdict?.suppressed) {
      return { allowed: false, reason: 'email_suppressed', detail: verdict.reason || undefined }
    }

    const eligibility = eligibilityOf(verdict)
    if (eligibility === 'blocked') {
      return { allowed: false, reason: 'email_invalid', detail: verdict?.reason || undefined }
    }
    if (eligibility === 'pending') {
      return { allowed: false, reason: 'email_unverified', detail: verdict?.reason || undefined }
    }
  }

  // 2. Phase de test.
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
  const [enabled, testPhase] = await Promise.all([verifyEnabled(sb), loadTestPhase(sb)])
  const eligibility = new Map<string, SendEligibility>()

  if (enabled && emails.length > 0) {
    const verdicts = await loadVerdicts(sb, emails)
    for (const raw of emails) {
      const email = normalizeEmail(raw)
      if (email) eligibility.set(email, eligibilityOf(verdicts.get(email)))
    }
  }

  return { verifyEnabled: enabled, testPhase, eligibility }
}

/** Éligibilité d'une adresse dans l'état courant du garde. */
export function eligibilityFor(policy: SendPolicy, to: string | null | undefined): SendEligibility {
  if (!policy.verifyEnabled) return 'ok'
  const email = normalizeEmail(to)
  if (!email) return 'blocked'
  return policy.eligibility.get(email) ?? 'pending'
}
