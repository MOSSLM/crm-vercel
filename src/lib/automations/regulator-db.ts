// regulator-db.ts — la couche base du régulateur : lire les réglages, monter la
// file d'envoi, compter ce qui est déjà parti.
//
// Le calcul lui-même vit dans `regulator.ts` (pur, testable). Ici on ne fait que
// nourrir ce calcul avec l'état réel du CRM, et on rend les résultats sous une
// forme directement affichable (file du régulateur, colonne Email du pipeline).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Automation, SequenceDefinition, SequenceEnrollment, SequenceStep } from '@/components/automations/types'
import {
  DEFAULT_REGULATOR,
  localDayBounds,
  planQueue,
  readSequenceSettings,
  toRegulatorSettings,
  type PlannedItem,
  type QueueItem,
  type RegulatorSettings,
} from './regulator'

/** La table n'existe pas encore (migration non appliquée) → défauts. */
const isMissingTable = (error: { code?: string; message?: string } | null | undefined): boolean => {
  if (!error) return false
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    error.code === '42703' ||
    /does not exist|could not find the (table|column)/i.test(error.message ?? '')
  )
}

export async function loadRegulatorSettings(sb: SupabaseClient): Promise<RegulatorSettings> {
  try {
    const { data, error } = await sb.from('regulator_settings').select('*').eq('id', 'global').maybeSingle()
    if (error && !isMissingTable(error)) return { ...DEFAULT_REGULATOR }
    return toRegulatorSettings(data as Record<string, unknown> | null)
  } catch {
    return { ...DEFAULT_REGULATOR }
  }
}

/**
 * Admin destinataire des tâches manuelles orphelines. Le réglage explicite fait
 * foi ; sinon on prend le premier administrateur du CRM.
 */
export async function resolveAdminId(sb: SupabaseClient, settings: RegulatorSettings): Promise<string | null> {
  if (settings.adminUserId) return settings.adminUserId
  try {
    const { data } = await sb
      .from('user_profiles')
      .select('id')
      .eq('role', 'admin')
      .order('created_at', { ascending: true })
      .limit(1)
    const row = (data as { id: string }[] | null)?.[0]
    return row?.id ?? null
  } catch {
    return null
  }
}

/** Agents déclarés indisponibles aujourd'hui (absence saisie dans `agent_settings`). */
export async function loadUnavailableAgents(sb: SupabaseClient): Promise<Set<string>> {
  try {
    const today = new Date().toISOString().slice(0, 10)
    const { data, error } = await sb
      .from('agent_settings')
      .select('agent_id, unavailable_until')
      .gte('unavailable_until', today)
    if (error) return new Set()
    return new Set((data ?? []).map((r) => r.agent_id as string))
  } catch {
    return new Set()
  }
}

/** Nombre de tâches manuelles encore en attente, par destinataire. */
export async function loadTaskLoads(sb: SupabaseClient): Promise<Map<string, number>> {
  const loads = new Map<string, number>()
  try {
    const { data } = await sb
      .from('prospection_tasks')
      .select('assignee_id')
      .eq('status', 'pending')
      .not('assignee_id', 'is', null)
      .limit(5000)
    for (const row of (data ?? []) as { assignee_id: string | null }[]) {
      if (!row.assignee_id) continue
      loads.set(row.assignee_id, (loads.get(row.assignee_id) ?? 0) + 1)
    }
  } catch {
    /* pas de charge connue : le routage se fait sans plafond effectif */
  }
  return loads
}

export interface SentEmail {
  id: string
  at: number
  contactId: string | null
  entrepriseId: number | null
  automationId: string | null
  toName: string | null
  subject: string
}

export interface SendHistory {
  /** Emails de séquence partis aujourd'hui (heure locale du régulateur). */
  today: SentEmail[]
  /** Nombre total d'envois du jour, tous confondus. */
  sentToday: number
  /** Par séquence : combien sont partis aujourd'hui. */
  byAutomation: Map<string, number>
  /** Par contact : dernier envoi, en ms. */
  lastByContact: Map<string, number>
  /** Contacts déjà servis aujourd'hui. */
  contactsToday: Set<string>
  /** Par entreprise : dernier envoi, en ms. */
  lastByCompany: Map<string, number>
  /** Dernier envoi tous confondus, en ms (0 = aucun). */
  lastSentAt: number
}

const EMPTY_HISTORY: SendHistory = {
  today: [],
  sentToday: 0,
  byAutomation: new Map(),
  lastByContact: new Map(),
  contactsToday: new Set(),
  lastByCompany: new Map(),
  lastSentAt: 0,
}

/**
 * Historique des envois du jour. C'est lui qui fait tenir l'écart d'un tick à
 * l'autre : sans mémoire, le ticker repartirait à zéro toutes les minutes.
 */
export async function loadSendHistory(sb: SupabaseClient, settings: RegulatorSettings, now: number): Promise<SendHistory> {
  const { start } = localDayBounds(now, settings.timezone)
  try {
    let query = sb
      .from('email_logs')
      .select('id, sent_at, contact_id, entreprise_id, automation_id, to_name, subject, type, status')
      .eq('status', 'sent')
      .gte('sent_at', new Date(start).toISOString())
      .order('sent_at', { ascending: false })
      .limit(1000)
    // Le garde-fou « compter les emails déjà envoyés » élargit la mémoire à tous
    // les envois du CRM, pas seulement à ceux des séquences.
    if (!settings.countAllSequences) query = query.eq('type', 'sequence')

    const { data, error } = await query
    if (error) return { ...EMPTY_HISTORY, today: [], byAutomation: new Map(), lastByContact: new Map(), contactsToday: new Set(), lastByCompany: new Map() }

    const rows = (data ?? []) as Array<{
      id: string
      sent_at: string
      contact_id: string | null
      entreprise_id: number | null
      automation_id: string | null
      to_name: string | null
      subject: string | null
      type: string | null
    }>

    const history: SendHistory = {
      today: [],
      sentToday: 0,
      byAutomation: new Map(),
      lastByContact: new Map(),
      contactsToday: new Set(),
      lastByCompany: new Map(),
      lastSentAt: 0,
    }

    for (const row of rows) {
      const at = Date.parse(row.sent_at)
      if (!Number.isFinite(at)) continue
      const isSequence = row.type === 'sequence'
      if (isSequence) {
        history.sentToday++
        history.today.push({
          id: row.id,
          at,
          contactId: row.contact_id,
          entrepriseId: row.entreprise_id,
          automationId: row.automation_id,
          toName: row.to_name,
          subject: row.subject ?? '',
        })
        if (row.automation_id) {
          history.byAutomation.set(row.automation_id, (history.byAutomation.get(row.automation_id) ?? 0) + 1)
        }
        history.lastSentAt = Math.max(history.lastSentAt, at)
      }
      if (row.contact_id) {
        history.contactsToday.add(row.contact_id)
        history.lastByContact.set(row.contact_id, Math.max(history.lastByContact.get(row.contact_id) ?? 0, at))
      }
      if (row.entreprise_id != null) {
        const key = String(row.entreprise_id)
        history.lastByCompany.set(key, Math.max(history.lastByCompany.get(key) ?? 0, at))
      }
    }
    history.today.sort((a, b) => b.at - a.at)
    return history
  } catch {
    return { ...EMPTY_HISTORY, today: [], byAutomation: new Map(), lastByContact: new Map(), contactsToday: new Set(), lastByCompany: new Map() }
  }
}

/** Étape courante d'une inscription, ou `null` si la séquence est terminée. */
export function currentStep(automation: Automation, enrollment: SequenceEnrollment): SequenceStep | null {
  const def = (automation.definition as SequenceDefinition) || { steps: [] }
  const steps = Array.isArray(def.steps) ? def.steps : []
  return steps[enrollment.current_step] ?? null
}

export interface DueEnrollment {
  enrollment: SequenceEnrollment
  automation: Automation
  step: SequenceStep | null
}

export interface QueueBuild {
  /** Les inscriptions dont l'étape courante est un email : elles passent par la file. */
  emails: DueEnrollment[]
  /** Les autres (WhatsApp, appel, attente…) : traitées tout de suite, sans régulateur. */
  others: DueEnrollment[]
}

/**
 * Inscriptions actives dont l'étape courante est due (`next_run_at` passé), avec
 * leur automation résolue. C'est l'entrée de la file.
 */
export async function loadDueEnrollments(
  sb: SupabaseClient,
  now: number,
  limit = 200,
): Promise<QueueBuild> {
  const { data } = await sb
    .from('sequence_enrollments')
    .select('*')
    .eq('status', 'active')
    .not('next_run_at', 'is', null)
    .lte('next_run_at', new Date(now).toISOString())
    .order('next_run_at', { ascending: true })
    .limit(limit)

  const enrollments = (data ?? []) as SequenceEnrollment[]
  if (enrollments.length === 0) return { emails: [], others: [] }

  const ids = [...new Set(enrollments.map((e) => e.automation_id))]
  const { data: autos } = await sb.from('automations').select('*').in('id', ids)
  const byId = new Map((autos ?? []).map((a) => [a.id as string, a as Automation]))

  const emails: DueEnrollment[] = []
  const others: DueEnrollment[] = []
  for (const enrollment of enrollments) {
    const automation = byId.get(enrollment.automation_id)
    if (!automation) continue
    const step = currentStep(automation, enrollment)
    const entry = { enrollment, automation, step }
    if (step?.kind === 'email') emails.push(entry)
    else others.push(entry)
  }
  return { emails, others }
}

export interface QueueContext {
  settings: RegulatorSettings
  history: SendHistory
  now: number
}

/** Métadonnées d'affichage jointes aux entrées de file (nom du contact, entreprise…). */
export interface QueueDecoration {
  contactName: string
  companyName: string
  ownerId: string | null
}

/**
 * Monte les entrées de file à partir des inscriptions dues. Les décorations
 * (nom du contact, entreprise, propriétaire) sont optionnelles : le ticker n'en
 * a pas besoin, l'interface si.
 */
export function buildQueueItems(
  due: DueEnrollment[],
  ctx: QueueContext,
  decorate?: (e: DueEnrollment) => QueueDecoration,
): QueueItem[] {
  return due.map(({ enrollment, automation, step }) => {
    const seq = readSequenceSettings(automation.settings)
    const deco = decorate?.({ enrollment, automation, step }) ?? {
      contactName: '',
      companyName: '',
      ownerId: null,
    }
    const companyKey = enrollment.entreprise_id != null ? String(enrollment.entreprise_id) : `contact:${enrollment.contact_id}`
    const lastForContact = enrollment.contact_id ? (ctx.history.lastByContact.get(enrollment.contact_id) ?? 0) : 0
    const lastForCompany = ctx.history.lastByCompany.get(companyKey) ?? 0

    return {
      id: enrollment.id,
      automationId: automation.id,
      sequenceName: automation.name,
      priority: seq.priority,
      windows: seq.windows,
      sequenceActive: automation.status === 'on',
      sequenceDailyCap: seq.dailyCap,
      sequenceSentToday: ctx.history.byAutomation.get(automation.id) ?? 0,
      companyKey,
      contactId: enrollment.contact_id,
      companyName: deco.companyName,
      contactName: deco.contactName,
      ownerId: deco.ownerId,
      step: enrollment.current_step + 1,
      stepLabel: step?.label || step?.template || `Étape ${enrollment.current_step + 1}`,
      eligibleAt: enrollment.next_run_at ? Date.parse(enrollment.next_run_at) : ctx.now,
      lastEmailAt: Math.max(lastForContact, lastForCompany),
      emailedToday: enrollment.contact_id ? ctx.history.contactsToday.has(enrollment.contact_id) : false,
    }
  })
}

/**
 * Plan complet de la file : curseur au premier créneau libre après le dernier
 * envoi réel, plafond restant déduit des envois du jour.
 */
export function planFromContext(items: QueueItem[], ctx: QueueContext): PlannedItem[] {
  const { settings, history, now } = ctx
  // Le curseur repart du dernier envoi : sans ça, deux ticks consécutifs
  // enverraient deux emails collés.
  const cursor = history.lastSentAt > 0 ? Math.max(now, history.lastSentAt + settings.gapMinMinutes * 60_000) : now
  return planQueue(items, {
    now,
    cursor,
    settings,
    capLeft: Math.max(0, settings.dailyCap - history.sentToday),
  })
}
