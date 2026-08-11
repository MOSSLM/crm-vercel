'use client'
// prospection-db.ts — accès à la file de tâches manuelles (Démarchage).
import { supabase } from '@/utils/supabase/client'
import { authedFetch } from '@/utils/authedFetch'
import type { ProspectionTask } from './types'

export interface ProspectionContact {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  tel: string | null
  role_title: string | null
  linkedin_url: string | null
}

/** Un autre contact de la même entreprise — porteur d'un numéro que la tâche ignore. */
export interface ProspectionAutreContact {
  id: string
  first_name: string | null
  last_name: string | null
  tel: string | null
  role_title: string | null
  is_decision_maker: boolean | null
}

export interface ProspectionEntreprise {
  id: number
  name: string | null
  site_web_canonique: string | null
  telephone: string | null
  telephones: string[] | null
  contacts: ProspectionAutreContact[] | null
}

export interface ProspectionTaskFull extends ProspectionTask {
  contacts: ProspectionContact | null
  entreprises: ProspectionEntreprise | null
}

/**
 * Les tâches en attente, avec TOUS les numéros du prospect.
 *
 * On ne se contente pas du contact lié à la tâche : 47 entreprises du parc
 * portent plusieurs numéros distincts, répartis entre `entreprises.telephone`,
 * `telephones[]` et les autres fiches `contacts`. Sans eux, l'agent compose ce
 * que le moteur a retenu sans jamais savoir qu'une autre ligne existe.
 */
export async function listProspectionTasks(): Promise<ProspectionTaskFull[]> {
  const { data, error } = await supabase
    .from('prospection_tasks')
    .select(
      '*, contacts(id,first_name,last_name,email,tel,role_title,linkedin_url), ' +
        'entreprises(id,name,site_web_canonique,telephone,telephones,' +
        'contacts(id,first_name,last_name,tel,role_title,is_decision_maker))',
    )
    .in('status', ['pending', 'snoozed'])
    .order('due_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as ProspectionTaskFull[]
}

/**
 * Une inscription garée sur une étape « attendre une réponse ».
 *
 * Ces prospects n'ont PLUS de tâche : celle qui a envoyé le WhatsApp est
 * terminée, elle a disparu de la file. Sans cette liste, il n'existerait aucun
 * endroit où déclarer la réponse — la séquence resterait garée pour toujours.
 */
export interface AwaitingReplyRow {
  enrollmentId: string
  automationId: string
  sequenceName: string
  entrepriseId: number | null
  companyName: string
  contactName: string | null
  phone: string | null
  /** Depuis quand on attend. */
  since: string
  /** Date de la relance automatique, ou null si on attend indéfiniment. */
  relanceAt: string | null
  assigneeId: string | null
}

export async function listAwaitingReply(): Promise<AwaitingReplyRow[]> {
  const { data, error } = await supabase
    .from('sequence_enrollments')
    .select(
      'id, automation_id, entreprise_id, next_run_at, updated_at, created_by, ' +
        'automations(name), entreprises(id,name,telephone,owner_id), contacts(first_name,last_name,tel)',
    )
    .eq('status', 'active')
    .eq('hold_reason', 'awaiting_reply')
    .order('updated_at', { ascending: true })
  if (error) throw error

  type Row = {
    id: string
    automation_id: string
    entreprise_id: number | null
    next_run_at: string | null
    updated_at: string
    created_by: string | null
    automations: { name: string | null } | null
    entreprises: { id: number; name: string | null; telephone: string | null; owner_id: string | null } | null
    contacts: { first_name: string | null; last_name: string | null; tel: string | null } | null
  }

  return ((data ?? []) as unknown as Row[]).map((r) => ({
    enrollmentId: r.id,
    automationId: r.automation_id,
    sequenceName: r.automations?.name ?? 'Séquence',
    entrepriseId: r.entreprise_id,
    companyName: r.entreprises?.name ?? 'Entreprise',
    contactName: `${r.contacts?.first_name ?? ''} ${r.contacts?.last_name ?? ''}`.trim() || null,
    phone: r.contacts?.tel ?? r.entreprises?.telephone ?? null,
    since: r.updated_at,
    relanceAt: r.next_run_at,
    // Même règle que le routage des tâches : le propriétaire de l'entreprise
    // d'abord, celui qui a lancé la séquence ensuite.
    assigneeId: r.entreprises?.owner_id ?? r.created_by ?? null,
  }))
}

/** « Il a répondu » — libère l'attente et enchaîne sur l'étape suivante. */
export async function declareReply(enrollmentId: string): Promise<void> {
  const res = await authedFetch(`/api/automations/enrollments/${enrollmentId}/reply`, { method: 'POST' })
  if (res.ok) return
  const payload = (await res.json().catch(() => ({}))) as { message?: string }
  throw new Error(payload.message || 'Impossible de reprendre la séquence')
}

export async function completeProspectionTask(id: string, result?: string): Promise<void> {
  const res = await authedFetch(`/api/automations/prospection/${id}/complete`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ result }),
  })
  if (res.ok) return
  // repli direct si la route échoue
  const { error } = await supabase
    .from('prospection_tasks')
    .update({ status: 'done', done_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function snoozeProspectionTask(id: string, hours: number): Promise<void> {
  const due = new Date(Date.now() + hours * 3600_000).toISOString()
  const { error } = await supabase.from('prospection_tasks').update({ status: 'snoozed', due_at: due }).eq('id', id)
  if (error) throw error
}

/**
 * Redonne une tâche à quelqu'un d'autre. `null` la sort de toutes les files
 * sans la supprimer — elle réapparaît dans « sans destinataire ».
 */
export async function assignProspectionTask(id: string, assigneeId: string | null): Promise<void> {
  const res = await authedFetch(`/api/automations/prospection/${id}/assign`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ assignee_id: assigneeId }),
  })
  if (res.ok) return
  const payload = (await res.json().catch(() => ({}))) as { message?: string }
  throw new Error(payload.message || 'Réattribution impossible')
}

export async function skipProspectionTask(id: string): Promise<void> {
  const { error } = await supabase
    .from('prospection_tasks')
    .update({ status: 'skipped', done_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}
