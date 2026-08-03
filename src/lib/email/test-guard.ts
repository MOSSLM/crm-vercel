// test-guard.ts — le garde-fou de la phase de test.
//
// Quand la phase de test est active, un email ne part QUE si son destinataire
// figure dans `test_email_addresses`. Tout autre destinataire est retenu : rien
// n'est envoyé, mais l'envoi est journalisé avec son motif et la séquence
// continue d'avancer. On voit donc le régulateur tourner de bout en bout sur de
// vrais prospects, sans qu'un seul email ne sorte.
//
// Le garde vit ici, pas dans chaque appelant : il n'y a qu'un seul endroit où
// décider si un envoi est autorisé.

import type { SupabaseClient } from '@supabase/supabase-js'

export type BlockReason = 'mode_test'

export interface GuardVerdict {
  allowed: boolean
  reason?: BlockReason
  /** Adresses qui recevraient réellement — pour un message d'erreur utile. */
  allowlist?: string[]
}

const ALLOWED: GuardVerdict = { allowed: true }

/** Comparaison d'adresses : la casse et les espaces ne doivent rien changer. */
const normalize = (email: string): string => email.trim().toLowerCase()

type CacheEntry = { at: number; testMode: boolean; allowlist: Set<string> }

/**
 * Le garde est consulté à chaque envoi ; le ticker peut en enchaîner plusieurs
 * par minute. Un cache court évite deux requêtes par email sans jamais retarder
 * la prise en compte d'un changement de plus de quelques secondes.
 */
const CACHE_TTL_MS = 15_000
let cache: CacheEntry | null = null

/** Vide le cache — appelé quand les réglages viennent d'être modifiés. */
export function resetTestGuardCache(): void {
  cache = null
}

async function loadState(sb: SupabaseClient): Promise<CacheEntry> {
  const now = Date.now()
  if (cache && now - cache.at < CACHE_TTL_MS) return cache

  let testMode = false
  try {
    const { data } = await sb.from('regulator_settings').select('test_mode').eq('id', 'global').maybeSingle()
    testMode = data?.test_mode === true
  } catch {
    // Migration pas encore appliquée : on n'invente pas un mode test qui
    // bloquerait des envois légitimes.
    testMode = false
  }

  const allowlist = new Set<string>()
  if (testMode) {
    try {
      const { data } = await sb.from('test_email_addresses').select('email')
      for (const row of (data ?? []) as { email: string | null }[]) {
        if (row.email) allowlist.add(normalize(row.email))
      }
    } catch {
      /* liste illisible : le garde bloquera tout, c'est le sens sûr */
    }
  }

  cache = { at: now, testMode, allowlist }
  return cache
}

/**
 * Ce destinataire peut-il recevoir ?
 *
 * Hors phase de test, tout passe. En phase de test, seules les adresses
 * enregistrées passent — y compris quand la liste est vide, auquel cas plus
 * rien ne part : c'est le comportement sûr, pas un bug.
 */
export async function allowRecipient(sb: SupabaseClient, to: string | null | undefined): Promise<GuardVerdict> {
  const state = await loadState(sb)
  if (!state.testMode) return ALLOWED
  if (to && state.allowlist.has(normalize(to))) return ALLOWED
  return { allowed: false, reason: 'mode_test', allowlist: [...state.allowlist] }
}

/** La phase de test est-elle active ? (bandeau d'alerte, compteurs…) */
export async function isTestPhaseActive(sb: SupabaseClient): Promise<boolean> {
  return (await loadState(sb)).testMode
}

/**
 * État de la phase de test, pour les appelants qui doivent trier une LISTE de
 * destinataires d'un coup — la file du régulateur, notamment.
 *
 * Le régulateur ne peut pas se contenter de tenter puis d'échouer : un envoi
 * retenu doit être écarté de la file AVANT d'être préparé, sinon l'inscription
 * franchit l'étape et le prospect « passe » un email qui n'est jamais parti.
 */
export async function loadTestPhase(sb: SupabaseClient): Promise<{ active: boolean; allowlist: Set<string> }> {
  const state = await loadState(sb)
  return { active: state.testMode, allowlist: state.allowlist }
}

/** Ce destinataire recevrait-il, dans l'état courant du garde-fou ? */
export const recipientAllowed = (
  phase: { active: boolean; allowlist: Set<string> },
  to: string | null | undefined,
): boolean => !phase.active || (!!to && phase.allowlist.has(normalize(to)))

export const BLOCK_LABEL: Record<BlockReason, string> = {
  mode_test: 'Phase de test — destinataire hors liste blanche',
}
