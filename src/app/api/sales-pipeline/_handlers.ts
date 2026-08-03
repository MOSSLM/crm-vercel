// _handlers.ts — le corps des actions du pipeline commercial, partagé entre les
// routes admin (tout le CRM) et les routes agent (ses propres prospects).
//
// Un agent freelance ne peut agir que sur une opportunité qu'il possède : le
// garde-fou est ici, une seule fois, plutôt que recopié dans chaque route.

import { json, jsonError } from '@/app/api/_lib/respond'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { advanceStage, applyReaction, reviveRow, setProspectEmail, skipEmailStep } from '@/lib/sales-pipeline/actions'
import { enrollInSequence, processSequenceEnrollment } from '@/lib/automations/engine'
import type { Automation, SequenceEnrollment } from '@/components/automations/types'
import type {
  SalesAdvancePayload,
  SalesEnrollPayload,
  SalesReactionPayload,
  SalesRevivePayload,
  SalesSetEmailPayload,
  SalesSkipEmailPayload,
} from '@/app/api/_lib/schemas'

type Scope = { ownerId: string | null; userId: string }

/**
 * L'opportunité existe-t-elle, et le caller a-t-il le droit d'y toucher ?
 * `ownerId` non nul = mode agent : l'opportunité doit lui appartenir, ou porter
 * une entreprise qui lui appartient (le CRM double déjà ce scoping ailleurs).
 */
async function assertAccess(
  ids: string[],
  scope: Scope,
): Promise<{ ok: true; owned: string[] } | { ok: false; error: string; status: number }> {
  const sc = getServiceClient()
  const { data, error } = await sc
    .from('opportunites')
    .select('id, owner_id, entreprise:entreprises(owner_id)')
    .in('id', ids)
  if (error) return { ok: false, error: error.message, status: 500 }

  const rows = (data ?? []) as { id: string; owner_id: string | null; entreprise: { owner_id: string | null } | { owner_id: string | null }[] | null }[]
  if (rows.length === 0) return { ok: false, error: 'introuvable', status: 404 }
  if (!scope.ownerId) return { ok: true, owned: rows.map((r) => r.id) }

  const owned = rows
    .filter((r) => {
      const ent = Array.isArray(r.entreprise) ? r.entreprise[0] : r.entreprise
      return r.owner_id === scope.ownerId || ent?.owner_id === scope.ownerId
    })
    .map((r) => r.id)
  if (owned.length === 0) return { ok: false, error: 'prospect_non_attribue', status: 403 }
  return { ok: true, owned }
}

export async function handleReaction(
  body: SalesReactionPayload,
  scope: Scope,
  cors: Record<string, string>,
): Promise<Response> {
  const access = await assertAccess([body.opportunite_id], scope)
  if (!access.ok) return jsonError(access.error, access.status, {}, cors)

  if (body.reaction === 'later' && !body.nurture_at) {
    return jsonError('date_de_relance_requise', 400, {}, cors)
  }
  if ((body.reaction === 'no' || body.reaction === 'bad') && !body.reason?.trim()) {
    return jsonError('motif_requis', 400, {}, cors)
  }

  const result = await applyReaction(getServiceClient(), body.opportunite_id, body.reaction, {
    reason: body.reason,
    nurtureAt: body.nurture_at,
    userId: scope.userId,
    skipColumns: body.skip_columns,
  })
  return json({ ok: true, ...result }, { headers: cors })
}

export async function handleAdvance(
  body: SalesAdvancePayload,
  scope: Scope,
  cors: Record<string, string>,
): Promise<Response> {
  const access = await assertAccess([body.opportunite_id], scope)
  if (!access.ok) return jsonError(access.error, access.status, {}, cors)

  const result = await advanceStage(getServiceClient(), body.opportunite_id, body.stage, {
    amount: body.amount,
    objection: body.objection,
    rdvAt: body.rdv_at,
  })
  return json({ ok: true, ...result }, { headers: cors })
}

export async function handleRevive(
  body: SalesRevivePayload,
  scope: Scope,
  cors: Record<string, string>,
): Promise<Response> {
  const access = await assertAccess([body.opportunite_id], scope)
  if (!access.ok) return jsonError(access.error, access.status, {}, cors)

  await reviveRow(getServiceClient(), body.opportunite_id, body.stage)
  return json({ ok: true }, { headers: cors })
}

/**
 * « Pas d'email — passer à WhatsApp ». L'étape email est barrée et l'inscription
 * enchaîne sur le canal suivant, tâche créée dans la foulée.
 */
export async function handleSkipEmail(
  body: SalesSkipEmailPayload,
  scope: Scope,
  cors: Record<string, string>,
): Promise<Response> {
  const access = await assertAccess([body.opportunite_id], scope)
  if (!access.ok) return jsonError(access.error, access.status, {}, cors)

  const result = await skipEmailStep(getServiceClient(), body.opportunite_id, body.skip_columns ?? [])
  return json({ ok: true, ...result }, { headers: cors })
}

/**
 * Une entreprise appartient-elle au caller ? Le pendant de `assertAccess` pour
 * les surfaces qui raisonnent en entreprises (page Séquences) plutôt qu'en
 * opportunités (pipeline commercial).
 */
async function assertCompanyAccess(
  entrepriseId: number,
  scope: Scope,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const sc = getServiceClient()
  const { data, error } = await sc.from('entreprises').select('id, owner_id').eq('id', entrepriseId).maybeSingle()
  if (error) return { ok: false, error: error.message, status: 500 }
  if (!data) return { ok: false, error: 'introuvable', status: 404 }
  if (!scope.ownerId) return { ok: true }
  if ((data.owner_id as string | null) !== scope.ownerId) {
    return { ok: false, error: 'prospect_non_attribue', status: 403 }
  }
  return { ok: true }
}

/**
 * Saisie manuelle de l'adresse d'un prospect. Elle atterrit sur la fiche
 * entreprise, au même endroit que toutes les autres adresses du CRM.
 */
export async function handleSetEmail(
  body: SalesSetEmailPayload,
  scope: Scope,
  cors: Record<string, string>,
): Promise<Response> {
  if (body.opportunite_id) {
    const access = await assertAccess([body.opportunite_id], scope)
    if (!access.ok) return jsonError(access.error, access.status, {}, cors)
  } else if (body.entreprise_id != null) {
    const access = await assertCompanyAccess(body.entreprise_id, scope)
    if (!access.ok) return jsonError(access.error, access.status, {}, cors)
  } else {
    return jsonError('cible_manquante', 400, {}, cors)
  }

  const result = await setProspectEmail(
    getServiceClient(),
    { opportuniteId: body.opportunite_id ?? null, entrepriseId: body.entreprise_id ?? null },
    body.email,
  )
  if (!result.ok) return jsonError(result.error, result.error === 'email_invalide' ? 400 : 404, {}, cors)
  return json({ ok: true, ...result.result }, { headers: cors })
}

export type EnrollOutcome = {
  opportunite_id: string
  status: 'enrolled' | 'deja_inscrit' | 'contact_manquant' | 'non_attribue' | 'erreur'
}

/**
 * Mise en séquence depuis le pipeline, en lot. L'email du jour 0 n'est PAS
 * envoyé ici : il entre dans la file du régulateur, qui décidera de l'heure.
 * Sans cette réserve, mettre 30 prospects en séquence enverrait 30 emails à la
 * même seconde.
 */
export async function handleEnroll(
  body: SalesEnrollPayload,
  scope: Scope,
  cors: Record<string, string>,
): Promise<Response> {
  const sc = getServiceClient()
  const access = await assertAccess(body.opportunite_ids, scope)
  if (!access.ok) return jsonError(access.error, access.status, {}, cors)
  const allowed = new Set(access.owned)

  const { data: autoRow } = await sc.from('automations').select('*').eq('id', body.automation_id).maybeSingle()
  const automation = autoRow as Automation | null
  if (!automation || automation.kind !== 'sequence') return jsonError('sequence_introuvable', 404, {}, cors)
  if (automation.status !== 'on') return jsonError('sequence_inactive', 409, {}, cors)

  // Un agent ne lance que les séquences que l'admin lui a attribuées.
  if (scope.ownerId) {
    const { data: assignment } = await sc
      .from('sequence_agent_assignments')
      .select('id')
      .eq('automation_id', body.automation_id)
      .eq('agent_id', scope.ownerId)
      .maybeSingle()
    if (!assignment) return jsonError('sequence_non_assignee', 403, {}, cors)
  }

  const firstStepKind = (automation.definition as { steps?: { kind?: string }[] } | null)?.steps?.[0]?.kind ?? null

  const { data: oppRows } = await sc
    .from('opportunites')
    .select('id, entreprise_id, contact_id')
    .in('id', body.opportunite_ids)
  const opps = (oppRows ?? []) as { id: string; entreprise_id: number | null; contact_id: string | null }[]

  // Contact de repli quand l'opportunité n'en porte pas : le décideur de l'entreprise.
  const entIds = [...new Set(opps.map((o) => o.entreprise_id).filter((v) => v != null))] as number[]
  const { data: contactRows } = entIds.length
    ? await sc
        .from('contacts')
        .select('id, entreprise_id, is_decision_maker, email')
        .in('entreprise_id', entIds)
    : { data: [] as unknown[] }
  const fallbackContact = new Map<number, string>()
  for (const c of (contactRows ?? []) as {
    id: string
    entreprise_id: number | null
    is_decision_maker: boolean | null
    email: string | null
  }[]) {
    if (c.entreprise_id == null) continue
    if (!fallbackContact.has(c.entreprise_id) || c.is_decision_maker) fallbackContact.set(c.entreprise_id, c.id)
  }

  const results: EnrollOutcome[] = []
  for (const opp of opps) {
    if (!allowed.has(opp.id)) {
      results.push({ opportunite_id: opp.id, status: 'non_attribue' })
      continue
    }
    const contactId = opp.contact_id ?? (opp.entreprise_id != null ? fallbackContact.get(opp.entreprise_id) : undefined)
    if (!contactId) {
      results.push({ opportunite_id: opp.id, status: 'contact_manquant' })
      continue
    }
    try {
      const { enrolled, enrollmentId } = await enrollInSequence(
        automation,
        {
          contact_id: contactId,
          entreprise_id: opp.entreprise_id,
          opportunite_id: opp.id,
          event: 'sales_pipeline_enroll',
        },
        { createdBy: scope.userId },
      )
      if (!enrolled) {
        results.push({ opportunite_id: opp.id, status: 'deja_inscrit' })
        continue
      }

      // La position de la ligne est DÉRIVÉE de l'inscription : rien à écrire
      // ici. On s'assure seulement que la ligne repart d'un état propre — une
      // remise en séquence après un « pas intéressé » doit redevenir active.
      await sc.from('sales_pipeline_state').upsert(
        { opportunite_id: opp.id, state: 'progress', state_reason: null, nurture_at: null },
        { onConflict: 'opportunite_id' },
      )

      // Une étape manuelle du jour 0 crée sa tâche tout de suite ; un email
      // attend son créneau.
      if (enrollmentId && firstStepKind && firstStepKind !== 'email') {
        const { data: enr } = await sc.from('sequence_enrollments').select('*').eq('id', enrollmentId).maybeSingle()
        if (enr) await processSequenceEnrollment(enr as SequenceEnrollment).catch(() => {})
      }
      results.push({ opportunite_id: opp.id, status: 'enrolled' })
    } catch {
      results.push({ opportunite_id: opp.id, status: 'erreur' })
    }
  }

  return json(
    { ok: true, enrolled: results.filter((r) => r.status === 'enrolled').length, results },
    { headers: cors },
  )
}
