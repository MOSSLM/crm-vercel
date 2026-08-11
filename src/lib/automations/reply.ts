// reply.ts — « le prospect a répondu, on continue ».
//
// À NE PAS CONFONDRE AVEC « le prospect a réagi »
// Le pipeline commercial a déjà cinq issues (`SALES_REACTIONS`) et elles
// STOPPENT toutes la séquence : a pris RDV, m'a rappelé, intéressé plus tard,
// pas intéressé, mauvais numéro. Elles répondent à « il s'est passé quelque
// chose, on arrête d'insister ».
//
// Ce fichier fait l'inverse. Sur une séquence WhatsApp, le premier message est
// une simple vérification — « bonjour, je suis bien avec X ? » — et sa réponse
// ne dit rien de l'offre : elle dit seulement que la conversation est ouverte,
// donc qu'on peut envoyer le site. C'est un DÉBLOCAGE, pas une sortie.
//
// D'où la décision de ne PAS toucher à `sales_pipeline_state.replied` :
// `hasInterest()` s'en sert pour éteindre les cellules WhatsApp et Appel
// (« il a déjà réagi, on n'insiste plus »), ce qui couperait précisément les
// étapes que cette séquence veut enchaîner.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { advanceEnrollmentAfterReply } from '@/lib/automations/engine'
import { readReplies } from '@/lib/automations/week'
import type { SequenceEnrollment } from '@/components/automations/types'

export type ReplyError = 'introuvable' | 'inactive' | 'pas_en_attente'

export interface ReplyResult {
  ok: boolean
  error?: ReplyError
  /** Index de l'étape d'attente libérée. */
  stepIndex?: number
}

/**
 * Déclare que le prospect a répondu, et fait repartir sa séquence.
 *
 * Marque l'étape d'attente comme satisfaite (dans `vars.replies`, daté), puis
 * avance en RÉANCRANT : les J+n de la suite se comptent depuis ce clic, pas
 * depuis l'inscription. Sans ça, une accroche répondue au bout d'une semaine
 * enverrait la démo dans la seconde qui suit.
 */
export async function declarerReponse(
  sbIn: SupabaseClient | null,
  enrollmentId: string,
): Promise<ReplyResult> {
  const sb = sbIn ?? getServiceClient()

  const { data } = await sb
    .from('sequence_enrollments')
    .select('id, status, current_step, hold_reason, vars')
    .eq('id', enrollmentId)
    .maybeSingle()
  const enrollment = data as Pick<
    SequenceEnrollment,
    'id' | 'status' | 'current_step' | 'hold_reason' | 'vars'
  > | null

  if (!enrollment) return { ok: false, error: 'introuvable' }
  if (enrollment.status !== 'active') return { ok: false, error: 'inactive' }
  // Cliquer deux fois, ou cliquer sur une inscription qui n'attend rien, ne doit
  // pas la faire sauter une étape : on refuse au lieu d'avancer à l'aveugle.
  if (enrollment.hold_reason !== 'awaiting_reply') return { ok: false, error: 'pas_en_attente' }

  const idx = Number(enrollment.current_step) || 0
  const replies = { ...readReplies(enrollment.vars), [String(idx)]: new Date().toISOString() }
  await sb
    .from('sequence_enrollments')
    .update({ vars: { ...(enrollment.vars ?? {}), replies }, hold_reason: null })
    .eq('id', enrollmentId)

  await advanceEnrollmentAfterReply(enrollmentId)
  return { ok: true, stepIndex: idx }
}
