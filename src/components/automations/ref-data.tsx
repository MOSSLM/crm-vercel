'use client'
// ref-data.tsx — charge les données de référence Supabase utilisées par les
// dropdowns SupaSelect (pipelines, stages, users, templates, scripts, tags…).
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '@/utils/supabase/client'
import type {
  PipelineRef,
  StageRef,
  UserRef,
  EmailTemplate,
  WhatsappTemplate,
  CallScript,
  TaskType,
  CrmTag,
} from './types'

export interface FormRef {
  id: string
  name: string
}

/**
 * Les autres séquences — pour l'étape « passer à une autre séquence ».
 *
 * Les archivées en font partie : une transition posée vers une séquence qu'on
 * a rangée depuis doit rester LISIBLE dans l'éditeur, sinon la carte affiche
 * « destination à choisir » alors qu'elle en a une. Le statut est là pour
 * qu'on puisse le dire.
 */
export interface SequenceRef {
  id: string
  name: string
  status: string
}

export interface RefData {
  pipelines: PipelineRef[]
  stages: StageRef[]
  users: UserRef[]
  email_templates: EmailTemplate[]
  whatsapp_templates: WhatsappTemplate[]
  call_scripts: CallScript[]
  task_types: TaskType[]
  tags: CrmTag[]
  forms: FormRef[]
  sequences: SequenceRef[]
  loading: boolean
  reload: () => void
}

const USER_COLORS = ['#2F7AE0', '#7A5AE0', '#0E93A6', '#1F8A5B', '#C8881F', '#B5322F']

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const EMPTY: RefData = {
  pipelines: [],
  stages: [],
  users: [],
  email_templates: [],
  whatsapp_templates: [],
  call_scripts: [],
  task_types: [],
  tags: [],
  forms: [],
  sequences: [],
  loading: true,
  reload: () => {},
}

const RefDataContext = createContext<RefData>(EMPTY)

export function useRefData(): RefData {
  return useContext(RefDataContext)
}

export function RefDataProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<RefData>(EMPTY)

  const load = useCallback(async () => {
    setData((d) => ({ ...d, loading: true }))
    try {
      const [pip, stg, usr, etpl, wtpl, scr, tt, tags, forms, seqs] = await Promise.all([
        supabase.from('pipelines').select('id,nom,ordre,visible').order('ordre'),
        supabase.from('etapes_pipeline').select('id,nom,ordre,visible,pipeline_id').order('ordre'),
        supabase.from('user_profiles').select('id,full_name,role,actif'),
        supabase.from('email_templates').select('id,name,subject,body'),
        supabase.from('whatsapp_templates').select('id,name,body'),
        supabase.from('call_scripts').select('id,name,duration,body'),
        supabase.from('automation_task_types').select('id,name,color'),
        supabase.from('crm_tags').select('id,name,color'),
        supabase.from('forms').select('id,name'),
        supabase.from('automations').select('id,name,status').eq('kind', 'sequence').order('name'),
      ])

      const pipelines: PipelineRef[] = (pip.data ?? [])
        .filter((p: { visible?: boolean }) => p.visible !== false)
        .map((p: { id: string; nom: string | null }) => ({ id: p.id, name: p.nom ?? 'Pipeline' }))

      const stages: StageRef[] = (stg.data ?? [])
        .filter((s: { visible?: boolean }) => s.visible !== false)
        .map((s: { id: number; nom: string | null; ordre: number | null; pipeline_id: string }) => ({
          id: s.id,
          name: s.nom ?? 'Stage',
          position: s.ordre ?? 0,
          pipeline_id: s.pipeline_id,
        }))

      const users: UserRef[] = (usr.data ?? []).map(
        (u: { id: string; full_name: string | null; role: string | null }, i: number) => ({
          id: u.id,
          name: u.full_name ?? 'Utilisateur',
          initials: initials(u.full_name ?? '?'),
          role: u.role,
          color: USER_COLORS[i % USER_COLORS.length],
        }),
      )

      const email_templates: EmailTemplate[] = (etpl.data ?? []).map(
        (t: { id: string; name: string | null; subject: string | null; body: string | null }) => ({
          id: t.id,
          name: t.name ?? 'Template',
          subject: t.subject,
          body_preview: (t.body ?? '').replace(/<[^>]+>/g, '').slice(0, 90),
        }),
      )

      const whatsapp_templates: WhatsappTemplate[] = (wtpl.data ?? []) as WhatsappTemplate[]
      const call_scripts: CallScript[] = (scr.data ?? []) as CallScript[]
      const task_types: TaskType[] = (tt.data ?? []) as TaskType[]
      const crmTags: CrmTag[] = (tags.data ?? []) as CrmTag[]
      const formRefs: FormRef[] = (forms.data ?? []) as FormRef[]
      const sequences: SequenceRef[] = (seqs.data ?? []) as SequenceRef[]

      setData({
        pipelines,
        stages,
        users,
        email_templates,
        whatsapp_templates,
        call_scripts,
        task_types,
        tags: crmTags,
        forms: formRefs,
        sequences,
        loading: false,
        reload: load,
      })
    } catch {
      setData((d) => ({ ...d, loading: false, reload: load }))
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return <RefDataContext.Provider value={data}>{children}</RefDataContext.Provider>
}
