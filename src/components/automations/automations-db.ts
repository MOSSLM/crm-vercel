'use client'
// automations-db.ts — accès CRUD aux automatisations via le client Supabase
// navigateur (RLS : authenticated).
import { supabase } from '@/utils/supabase/client'
import type {
  Automation,
  AutomationKind,
  AutomationStatus,
  WorkflowDefinition,
  SequenceDefinition,
} from './types'

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

/**
 * Le même statut sur plusieurs automatisations, en une requête.
 *
 * Une boucle de `update` aurait produit N allers-retours et, surtout, une
 * réussite partielle impossible à annoncer : « 3 archivées sur 5, et lesquelles ? ».
 */
export async function setAutomationsStatus(ids: string[], status: AutomationStatus): Promise<void> {
  if (ids.length === 0) return
  const { error } = await supabase.from('automations').update({ status }).in('id', ids)
  if (error) throw error
}

/**
 * Une copie de travail : mêmes étapes, mêmes réglages, aucune inscription.
 *
 * TOUJOURS EN BROUILLON, quel que soit l'état de l'originale. Dupliquer une
 * séquence en service pour en essayer une variante ferait sinon partir deux
 * campagnes sur le même public à la seconde du clic — le geste veut dire
 * « donne-moi de quoi bricoler », pas « lance-en une deuxième ».
 *
 * Le déclencheur (pipeline + étape d'entrée) est recopié : c'est un réglage de
 * la séquence comme un autre, et une copie qui n'a pas le même public ne
 * servirait pas à comparer. Il ne déclenche rien tant que la copie est en
 * brouillon.
 */
export async function duplicateAutomation(source: Automation): Promise<Automation> {
  const { data, error } = await supabase
    .from('automations')
    .insert({
      kind: source.kind,
      name: nomDeCopie(source.name),
      description: source.description ?? '',
      status: 'draft',
      definition: source.definition ?? {},
      settings: source.settings ?? {},
      trigger_type: source.trigger_type,
      trigger_pipeline_id: source.trigger_pipeline_id,
      trigger_stage_id: source.trigger_stage_id,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as Automation
}

/**
 * « Ma séquence » → « Ma séquence (copie) » → « Ma séquence (copie 2) ».
 *
 * Dupliquer deux fois de suite est le cas normal quand on essaie des variantes :
 * trois lignes nommées à l'identique seraient indistinguables dans la liste.
 */
export function nomDeCopie(name: string): string {
  const base = name.replace(/\s*\(copie(?: \d+)?\)\s*$/i, '')
  const m = name.match(/\(copie(?: (\d+))?\)\s*$/i)
  if (!m) return `${base} (copie)`
  return `${base} (copie ${Number(m[1] ?? 1) + 1})`
}
