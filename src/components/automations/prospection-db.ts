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

export interface ProspectionEntreprise {
  id: number
  name: string | null
  site_web_canonique: string | null
}

export interface ProspectionTaskFull extends ProspectionTask {
  contacts: ProspectionContact | null
  entreprises: ProspectionEntreprise | null
}

export async function listProspectionTasks(): Promise<ProspectionTaskFull[]> {
  const { data, error } = await supabase
    .from('prospection_tasks')
    .select(
      '*, contacts(id,first_name,last_name,email,tel,role_title,linkedin_url), entreprises(id,name,site_web_canonique)',
    )
    .in('status', ['pending', 'snoozed'])
    .order('due_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as ProspectionTaskFull[]
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

export async function skipProspectionTask(id: string): Promise<void> {
  const { error } = await supabase
    .from('prospection_tasks')
    .update({ status: 'skipped', done_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}
