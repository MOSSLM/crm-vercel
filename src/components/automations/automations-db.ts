'use client'
// automations-db.ts — accès CRUD aux automatisations via le client Supabase
// navigateur (RLS : authenticated).
import { supabase } from '@/utils/supabase/client'
import type { AttributionSequence, ModeAcces } from '@/lib/automations/acces'
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
 *
 * Les agents autorisés suivent aussi. `settings.acces` est recopié avec le
 * reste : une copie restreinte SANS ses agents serait visible de personne, et
 * ce vide-là ne se voit qu'en ouvrant la boîte d'accès. Le geste veut dire
 * « la même », accès compris.
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
  const copie = data as Automation

  // Best-effort : rater la recopie des accès ne doit pas annuler la copie
  // elle-même, qui est déjà en base et que l'utilisateur voit apparaître.
  try {
    const { data: rows } = await supabase
      .from('sequence_agent_assignments')
      .select('agent_id')
      .eq('automation_id', source.id)
    const agents = (rows ?? []) as { agent_id: string }[]
    if (agents.length > 0) {
      const { data: auth } = await supabase.auth.getUser()
      await supabase.from('sequence_agent_assignments').upsert(
        agents.map((a) => ({
          automation_id: copie.id,
          agent_id: a.agent_id,
          assigned_by: auth?.user?.id ?? null,
        })),
        { onConflict: 'automation_id,agent_id' },
      )
    }
  } catch {
    /* la copie existe ; ses accès se recochent à la main */
  }

  return copie
}

/* ── Accès des agents ──────────────────────────────────────────────────────
 *
 * Deux écritures distinctes, parce que ce sont deux décisions distinctes :
 * le MODE vit dans `automations.settings.acces` (ouvert à tous / restreint),
 * la LISTE dans `sequence_agent_assignments`. Garder les noms cochés quand on
 * repasse en « tous » est délibéré : on rouvre souvent le temps d'un essai, et
 * effacer la liste obligerait à la reconstituer de mémoire au retour.
 */

export interface AgentRef {
  id: string
  name: string
  email: string | null
}

/** Les agents freelance — ceux à qui une séquence peut être ouverte. */
export async function listAgents(): Promise<AgentRef[]> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, full_name, email')
    .eq('role', 'freelance')
    .order('full_name', { nullsFirst: false })
  if (error) throw error
  return ((data ?? []) as { id: string; full_name: string | null; email: string | null }[]).map((a) => ({
    id: a.id,
    name: a.full_name?.trim() || a.email || 'Agent',
    email: a.email,
  }))
}

export async function listAttributions(): Promise<AttributionSequence[]> {
  const { data, error } = await supabase
    .from('sequence_agent_assignments')
    .select('automation_id, agent_id')
  if (error) throw error
  return (data ?? []) as AttributionSequence[]
}

/**
 * Coche ou décoche un agent sur un lot de séquences.
 *
 * `upsert` plutôt qu'`insert` : la contrainte d'unicité (automation_id, agent_id)
 * ferait échouer tout le lot pour une seule ligne déjà présente — cas courant
 * quand on coche un agent sur une sélection dont la moitié l'avait déjà.
 */
export async function setAttribution(
  automationIds: string[],
  agentId: string,
  assigned: boolean,
): Promise<void> {
  if (automationIds.length === 0) return
  if (assigned) {
    const { data: auth } = await supabase.auth.getUser()
    const { error } = await supabase.from('sequence_agent_assignments').upsert(
      automationIds.map((automation_id) => ({
        automation_id,
        agent_id: agentId,
        assigned_by: auth?.user?.id ?? null,
      })),
      { onConflict: 'automation_id,agent_id' },
    )
    if (error) throw error
    return
  }
  const { error } = await supabase
    .from('sequence_agent_assignments')
    .delete()
    .eq('agent_id', agentId)
    .in('automation_id', automationIds)
  if (error) throw error
}

/**
 * Le mode d'accès, réglage par réglage.
 *
 * `settings` est un JSONB écrit en bloc : envoyer `{ acces }` seul EFFACERAIT
 * les plages d'envoi, le public visé et le reste. On fusionne donc à partir de
 * ce que la ligne porte déjà — d'où la séquence complète en argument plutôt
 * qu'un simple identifiant.
 */
export async function setModeAcces(sequences: Automation[], acces: ModeAcces): Promise<void> {
  for (const seq of sequences) {
    const { error } = await supabase
      .from('automations')
      .update({ settings: { ...(seq.settings ?? {}), acces } })
      .eq('id', seq.id)
    if (error) throw error
  }
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
