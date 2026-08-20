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
import { advanceEnrollmentAfterReply, reprendreSurLaBrancheReponse } from '@/lib/automations/engine'
import { cleDeFourche, retourVersLaReponse } from '@/lib/automations/branches'
import { readReplies } from '@/lib/automations/week'
import type { SequenceDefinition, SequenceEnrollment, SequenceStep } from '@/components/automations/types'

export type ReplyError = 'introuvable' | 'inactive' | 'pas_en_attente'

/** Les étapes de la séquence, ou une liste vide — jamais une exception. */
async function lireLesEtapes(sb: SupabaseClient, automationId: string): Promise<SequenceStep[]> {
  const { data } = await sb
    .from('automations')
    .select('definition')
    .eq('id', automationId)
    .maybeSingle()
  const def = (data?.definition as SequenceDefinition) ?? { steps: [] }
  return (Array.isArray(def.steps) ? def.steps : []) as SequenceStep[]
}

export interface ReplyResult {
  ok: boolean
  error?: ReplyError
  /** Index de l'étape d'attente libérée. */
  stepIndex?: number
  /**
   * `true` quand la relance était déjà partie et qu'on a fait demi-tour vers la
   * branche « il a répondu ». L'appelant le dit à l'écran : ce n'est pas le même
   * geste que débloquer une attente, et le prospect a reçu un message de plus.
   */
  rattrapage?: boolean
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
    .select('id, automation_id, status, current_step, hold_reason, vars')
    .eq('id', enrollmentId)
    .maybeSingle()
  const enrollment = data as Pick<
    SequenceEnrollment,
    'id' | 'automation_id' | 'status' | 'current_step' | 'hold_reason' | 'vars'
  > | null

  if (!enrollment) return { ok: false, error: 'introuvable' }
  if (enrollment.status !== 'active') return { ok: false, error: 'inactive' }

  const idx = Number(enrollment.current_step) || 0

  if (enrollment.hold_reason !== 'awaiting_reply') {
    // Il a répondu APRÈS la relance — le cas le plus fréquent, puisque c'est la
    // relance qui l'a réveillé. L'inscription est quelque part dans la branche
    // « sans réponse » : on rejuge l'attente qui l'y a envoyée et on repart sur
    // la branche « il a répondu », plutôt que de continuer à relancer quelqu'un
    // qui vient d'écrire.
    const rattrapage = await rattraperDepuisLeSilence(sb, enrollment, idx)
    if (rattrapage) return rattrapage
    // Cliquer deux fois, ou cliquer sur une inscription qui n'attend rien, ne
    // doit pas la faire sauter une étape : on refuse au lieu d'avancer à
    // l'aveugle.
    return { ok: false, error: 'pas_en_attente' }
  }

  // ⚠️ LA RÉPONSE SE NOTE SOUS L'IDENTIFIANT DE L'ATTENTE, plus sous son rang :
  // insérer une étape plus haut décalait le sac, et la réponse d'un prospect
  // se mettait à désigner une autre attente que celle qu'il avait levée. C'est
  // arrivé le 20/08/2026 sur neuf inscriptions.
  const stepsIci = await lireLesEtapes(sb, enrollment.automation_id)
  const replies = {
    ...readReplies(enrollment.vars),
    [cleDeFourche(stepsIci, idx)]: new Date().toISOString(),
  }
  await sb
    .from('sequence_enrollments')
    .update({ vars: { ...(enrollment.vars ?? {}), replies }, hold_reason: null })
    .eq('id', enrollmentId)

  await advanceEnrollmentAfterReply(enrollmentId)
  return { ok: true, stepIndex: idx }
}

/**
 * Le demi-tour : de la branche « sans réponse » vers la branche « il a répondu ».
 *
 * Rend `null` quand il n'y a rien à rattraper — l'inscription est sur le tronc,
 * ou l'attente qui la gouverne n'a pas de branche « réponse » écrite. C'est
 * l'appelant qui décide alors quoi en dire ; ici, on ne fait rien plutôt que
 * d'avancer d'une étape au hasard.
 */
async function rattraperDepuisLeSilence(
  sb: SupabaseClient,
  enrollment: Pick<SequenceEnrollment, 'id' | 'automation_id' | 'current_step' | 'vars'>,
  idx: number,
): Promise<ReplyResult | null> {
  const steps = await lireLesEtapes(sb, enrollment.automation_id)

  const retour = retourVersLaReponse(steps, idx)
  if (!retour) return null

  // La réponse se note sur l'ATTENTE, pas sur l'étape courante : c'est elle qui
  // décide de la branche, et c'est elle que `etapeSuivante` relira.
  const replies = {
    ...readReplies(enrollment.vars),
    [cleDeFourche(steps, retour.waitIdx)]: new Date().toISOString(),
  }
  await sb
    .from('sequence_enrollments')
    .update({ vars: { ...(enrollment.vars ?? {}), replies }, hold_reason: null })
    .eq('id', enrollment.id)

  await reprendreSurLaBrancheReponse(enrollment.id, retour.cible, retour.waitIdx)
  return { ok: true, stepIndex: retour.waitIdx, rattrapage: true }
}
