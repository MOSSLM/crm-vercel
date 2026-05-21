'use client'
// automations-db.ts — accès CRUD aux automatisations via le client Supabase
// navigateur (RLS : authenticated).
import { supabase } from '@/utils/supabase/client'
import type { Automation, AutomationKind, WorkflowDefinition, SequenceDefinition } from './types'

export async function listAutomations(kind?: AutomationKind): Promise<Automation[]> {
  let q = supabase.from('automations').select('*').order('updated_at', { ascending: false })
  if (kind) q = q.eq('kind', kind)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as Automation[]
}

export async function getAutomation(id: string): Promise<Automation | null> {
  const { data, error } = await supabase.from('automations').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return (data as Automation) ?? null
}

export async function createAutomation(input: {
  kind: AutomationKind
  name: string
  description?: string
  definition?: WorkflowDefinition | SequenceDefinition
  settings?: Record<string, unknown>
}): Promise<Automation> {
  const { data, error } = await supabase
    .from('automations')
    .insert({
      kind: input.kind,
      name: input.name,
      description: input.description ?? '',
      status: 'draft',
      definition: input.definition ?? {},
      settings: input.settings ?? {},
    })
    .select('*')
    .single()
  if (error) throw error
  return data as Automation
}

export async function updateAutomation(
  id: string,
  patch: Partial<Omit<Automation, 'id' | 'created_at' | 'updated_at'>>,
): Promise<Automation> {
  const { data, error } = await supabase.from('automations').update(patch).eq('id', id).select('*').single()
  if (error) throw error
  return data as Automation
}

export async function deleteAutomation(id: string): Promise<void> {
  const { error } = await supabase.from('automations').delete().eq('id', id)
  if (error) throw error
}
