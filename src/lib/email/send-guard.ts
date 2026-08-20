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
//      ⚠️ Ce paragraphe a été FAUX du premier jour au 20/08/2026 : le contrôle
//      était enfermé dans « vérifier les adresses avant d'envoyer », donc
//      éteindre ce réglage éteignait aussi la liste des désabonnés. Corrigé —
//      et `suppression_illisible` distingue désormais « la liste est vide » de
//      « je n'ai pas pu la lire ».
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
import { eligibilityOf, lireSuppressions, loadVerdicts, type SendEligibility } from './verify/service'

export type BlockReason =
  | 'mode_test'
  | 'email_suppressed'
  | 'email_invalid'
  | 'email_unverified'
  /**
   * La liste de suppression n'a pas pu être lue. TROISIÈME ÉTAT, et il compte :
   * une liste illisible n'est pas une liste vide. Retenir coûte un tour de
   * régulateur ; se tromper coûte un email à quelqu'un qui s'est désabonné.
   */
  | 'suppression_illisible'
  /**
   * Le régulateur est en pause. Il trie la file en amont et ne libère rien
   * quand il dort — mais TOUT ne passe pas par la file : une action
   * `send_email` de workflow appelle l'envoi directement. Sans ce motif, la
   * pause générale ne couvrait pas ce chemin-là.
   */
  | 'regulateur_en_pause'
  /**
   * Le canal e-mail est suspendu — les boîtes ne sont pas encore chaudes.
   *
   * DIFFÉRENT DE LA PAUSE : la pause arrête toute la prospection, la suspension
   * n'arrête QUE l'e-mail. WhatsApp et l'appel continuent, et les séquences
   * routent autour. Ce motif est le dernier filet du côté envoi : les
   * aiguillages ont déjà contourné l'étape en amont, mais un workflow appelle
   * l'envoi directement, sans séquence et sans aiguillage.
   */
  | 'canal_email_suspendu'

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
  suppression_illisible: 'Liste des désabonnés illisible — envoi retenu par précaution',
  regulateur_en_pause: 'Régulateur en pause — aucun email de prospection ne part',
  canal_email_suspendu: 'Canal e-mail suspendu — les boîtes d’envoi ne sont pas encore chaudes',
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

/**
 * Le contrôle de vérification est-il demandé ?
 *
 * ⚠️ « LE RÉGLAGE DIT NON » ET « JE N'AI PAS PU LIRE LE RÉGLAGE » NE SONT PAS
 * LA MÊME CHOSE. La première version ne destructurait pas `error` : une requête
 * en échec rendait `data = null`, donc `false` — la réponse permissive — et la
 * mettait en cache quinze secondes. Le garde s'ouvrait sur une panne de
 * lecture, en silence.
 *
 * Désormais : une table ou une colonne absente vaut `false` (la migration n'est
 * pas jouée, il n'y a rien à lire, et bloquer tous les envois pour ça serait
 * absurde) ; toute autre erreur retombe sur la DERNIÈRE VALEUR CONNUE, et à
 * défaut sur `true` — le côté prudent. Et un échec ne se met JAMAIS en cache,
 * pour qu'un incident de quelques secondes ne gouverne pas les quinze
 * suivantes.
 */
async function verifyEnabled(sb: SupabaseClient): Promise<boolean> {
  const now = Date.now()
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.verifyBeforeSend

  try {
    const { data, error } = await sb
      .from('regulator_settings')
      .select('verify_before_send')
      .eq('id', 'global')
      .maybeSingle()
    if (error) return surEchecDeLecture(error.code)
    const verifyBeforeSend = (data as { verify_before_send?: boolean } | null)?.verify_before_send === true
    cache = { at: now, verifyBeforeSend }
    return verifyBeforeSend
  } catch {
    return surEchecDeLecture(undefined)
  }
}

/** `42P01` table absente, `42703` colonne absente : la migration n'est pas jouée. */
function surEchecDeLecture(code: string | undefined): boolean {
  if (code === '42P01' || code === '42703') return false
  return cache ? cache.verifyBeforeSend : true
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

  // 1. LA SUPPRESSION, TOUJOURS, SANS CONDITION.
  //
  // Elle était enfermée dans `if (await verifyEnabled(sb))` — donc éteindre
  // « vérifier les adresses avant d'envoyer » éteignait AUSSI, en silence, la
  // liste des rebonds durs, des plaintes et des désabonnements. Personne ne lit
  // ce réglage comme « et ignorer les désabonnés » ; l'en-tête de ce fichier
  // promet d'ailleurs le contraire depuis le premier jour.
  //
  // Une suppression est une DÉCISION, pas une mesure : elle ne dépend d'aucun
  // réglage de vérification.
  if (email) {
    const suppressions = await lireSuppressions(sb, [email])
    if (!suppressions.ok) return { allowed: false, reason: 'suppression_illisible' }
    if (suppressions.set.has(email)) return { allowed: false, reason: 'email_suppressed' }
  }

  // 2. Vérification de l'adresse — celle-ci, oui, dépend du réglage.
  if (email && (await verifyEnabled(sb))) {
    const verdicts = await loadVerdicts(sb, [email])
    const verdict = verdicts.get(email)

    // Ceinture et bretelles : `loadVerdicts` marque aussi les supprimées, et un
    // motif lisible vaut mieux qu'un motif vide.
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
  /** `false` = la liste des désabonnés n'a pas pu être lue : tout est retenu. */
  suppressionsLues: boolean
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
  const [enabled, testPhase, suppressions] = await Promise.all([
    verifyEnabled(sb),
    loadTestPhase(sb),
    // MÊME RÈGLE QUE `allowRecipient`, et pour la même raison : le régulateur
    // écarte de la file AVANT de préparer l'envoi. S'il ne voyait les
    // suppressions que lorsque la vérification est allumée, un désabonné
    // resterait dans la file et le garde unitaire serait le seul à l'arrêter —
    // après que l'inscription a franchi l'étape.
    lireSuppressions(sb, emails),
  ])
  const eligibility = new Map<string, SendEligibility>()

  if (enabled && emails.length > 0) {
    const verdicts = await loadVerdicts(sb, emails)
    for (const raw of emails) {
      const email = normalizeEmail(raw)
      if (email) eligibility.set(email, eligibilityOf(verdicts.get(email)))
    }
  }

  // Une liste illisible bloque tout le lot : c'est le même arbitrage
  // qu'unitairement, et il vaut mieux un tour de file perdu qu'un email à
  // quelqu'un qui s'est désabonné.
  for (const raw of emails) {
    const email = normalizeEmail(raw)
    if (!email) continue
    if (!suppressions.ok || suppressions.set.has(email)) eligibility.set(email, 'blocked')
  }

  return { verifyEnabled: enabled, testPhase, eligibility, suppressionsLues: suppressions.ok }
}

/** Éligibilité d'une adresse dans l'état courant du garde. */
export function eligibilityFor(policy: SendPolicy, to: string | null | undefined): SendEligibility {
  const email = normalizeEmail(to)
  if (!email) return 'blocked'
  // La suppression passe AVANT le réglage de vérification : elle ne s'éteint
  // pas avec lui. `loadSendPolicy` a déjà marqué ces adresses `blocked`.
  const connu = policy.eligibility.get(email)
  if (connu === 'blocked') return 'blocked'
  if (!policy.verifyEnabled) return 'ok'
  return connu ?? 'pending'
}
