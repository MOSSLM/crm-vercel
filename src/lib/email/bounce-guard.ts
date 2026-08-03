// bounce-guard.ts — le disjoncteur.
//
// C'est la seule protection du système qui ne repose sur AUCUNE prédiction.
// Tout le reste — syntaxe, DNS, listes, quotas — essaie de deviner à l'avance
// ce qui va rebondir, et se trompera parfois : personne ne peut prouver qu'une
// boîte existe avant de lui écrire. Le disjoncteur, lui, ne devine rien : il
// regarde le taux de rebond RÉEL des dernières vingt-quatre heures et coupe la
// file quand il dérape.
//
// Peu importe donc qu'une adresse ait été mal classée, qu'un lot d'import soit
// pourri ou qu'un domaine entier soit mort : si la réalité dérape, tout
// s'arrête et l'admin est prévenu. C'est ce qui rend la mise en liste noire du
// domaine expéditeur structurellement improbable.
//
// Deux garde-fous sur le garde-fou :
//
//   · un PLANCHER d'envois (sans lui, un rebond sur trois envois afficherait
//     33 % et couperait une file parfaitement saine) ;
//   · une seule coupure : si le régulateur est déjà en pause, on ne renotifie
//     pas à chaque minute.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { RegulatorSettings } from '@/lib/automations/regulator'

const DAY_MS = 86_400_000

/**
 * En dessous de ce nombre d'envois sur la fenêtre, le taux n'a pas de sens
 * statistique et le disjoncteur reste au repos.
 */
export const MIN_SENDS_FOR_GUARD = 20

export interface BounceRate {
  /** Emails réellement partis sur la fenêtre. */
  sent: number
  /** Rebonds durs encaissés sur la fenêtre. */
  hardBounces: number
  /** Taux en pourcentage, 0 quand rien n'est parti. */
  rate: number
  /** Le calcul a-t-il pu se faire ? (tables absentes → non) */
  measured: boolean
}

const EMPTY_RATE: BounceRate = { sent: 0, hardBounces: 0, rate: 0, measured: false }

/**
 * Taux de rebond dur sur une fenêtre glissante.
 *
 * Le dénominateur vient de `email_logs` (ce qui est vraiment parti) et le
 * numérateur de `email_events` (ce que Resend a renvoyé). Les deux sont des
 * faits, pas des estimations.
 */
export async function measureBounceRate(sb: SupabaseClient, windowMs = DAY_MS): Promise<BounceRate> {
  const since = new Date(Date.now() - windowMs).toISOString()

  let sent = 0
  try {
    const { count, error } = await sb
      .from('email_logs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'sent')
      .gte('sent_at', since)
    if (error) return EMPTY_RATE
    sent = count ?? 0
  } catch {
    return EMPTY_RATE
  }

  let hardBounces = 0
  try {
    const { count, error } = await sb
      .from('email_events')
      .select('event_id', { count: 'exact', head: true })
      .eq('type', 'email.bounced')
      .eq('bounce_type', 'hard')
      .gte('created_at', since)
    if (error) return EMPTY_RATE
    hardBounces = count ?? 0
  } catch {
    return EMPTY_RATE
  }

  return {
    sent,
    hardBounces,
    rate: sent > 0 ? (hardBounces / sent) * 100 : 0,
    measured: true,
  }
}

export interface GuardOutcome {
  /** Le disjoncteur vient-il de couper (ou a-t-il déjà coupé) la file ? */
  tripped: boolean
  /** Phrase française expliquant la coupure, pour les journaux et la notification. */
  detail?: string
  rate?: BounceRate
}

/**
 * Coupe la file si le taux de rebond dépasse le seuil.
 *
 * Rend `tripped` avec le détail quand la coupure vient d'avoir lieu, pour que
 * l'appelant traite le tick comme si le régulateur était en pause — sans quoi
 * les envois de CE tick partiraient encore.
 */
export async function tripBounceGuard(
  sb: SupabaseClient,
  settings: RegulatorSettings,
): Promise<GuardOutcome> {
  if (!settings.bounceGuard) return { tripped: false }
  // Déjà en pause : rien à couper, et surtout rien à renotifier.
  if (settings.paused) return { tripped: false }

  const rate = await measureBounceRate(sb)
  if (!rate.measured || rate.sent < MIN_SENDS_FOR_GUARD) return { tripped: false, rate }
  if (rate.rate <= settings.bounceGuardThreshold) return { tripped: false, rate }

  const detail =
    `${rate.hardBounces} rebonds durs sur ${rate.sent} envois en 24 h ` +
    `(${rate.rate.toFixed(1)} %, seuil ${settings.bounceGuardThreshold} %)`

  try {
    await sb.from('regulator_settings').update({ paused: true }).eq('id', 'global')
  } catch {
    // Si la pause n'a pas pu s'écrire, on rend quand même `tripped` : le tick
    // courant s'abstient d'envoyer, ce qui est le comportement sûr.
    return { tripped: true, detail, rate }
  }

  await notifyAdmin(sb, settings, detail, rate)
  return { tripped: true, detail, rate }
}

/**
 * Prévient l'admin. Sans notification, une file gelée toute seule ressemble à
 * une panne — et c'est exactement le moment où il faut regarder ses adresses.
 */
async function notifyAdmin(
  sb: SupabaseClient,
  settings: RegulatorSettings,
  detail: string,
  rate: BounceRate,
): Promise<void> {
  let userId = settings.adminUserId
  if (!userId) {
    try {
      const { data } = await sb
        .from('user_profiles')
        .select('id')
        .eq('role', 'admin')
        .order('created_at', { ascending: true })
        .limit(1)
      userId = (data as { id: string }[] | null)?.[0]?.id ?? null
    } catch {
      userId = null
    }
  }
  if (!userId) return

  try {
    await sb.from('notifications').insert({
      user_id: userId,
      type: 'regulator',
      status: 'error',
      title: 'Envois mis en pause — trop de rebonds',
      summary: {
        detail,
        sent: rate.sent,
        hard_bounces: rate.hardBounces,
        rate: Number(rate.rate.toFixed(2)),
        threshold: settings.bounceGuardThreshold,
      },
    })
  } catch {
    /* la notification est un confort, la pause est l'essentiel */
  }
}
