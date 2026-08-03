// _view.ts — l'état complet du régulateur, tel que l'interface le consomme.
//
// Une seule construction partagée entre la page Régulateur (vue admin, tout le
// CRM) et le tiroir « file d'envoi » du pipeline commercial : les deux montrent
// la même file, avec les mêmes motifs de report.

import { getServiceClient } from '@/app/api/_lib/service-client'
import { isSchemaGap } from '@/app/api/_lib/schema-gap'
import type { Automation, SequenceDefinition } from '@/components/automations/types'
import {
  buildQueueItems,
  loadDueEnrollments,
  loadRegulatorSettings,
  loadSendHistory,
  loadTaskLoads,
  loadUnavailableAgents,
  planFromContext,
  resolveAdminId,
  type QueueDecoration,
} from '@/lib/automations/regulator-db'
import {
  localDayBounds,
  readSequenceSettings,
  windowsUnion,
  type HoldReason,
  type RegulatorSettings,
  type SendWindow,
} from '@/lib/automations/regulator'

export interface RegulatorQueueRow {
  id: string
  automationId: string
  sequenceName: string
  contactName: string
  companyName: string
  ownerId: string | null
  step: number
  stepLabel: string
  /** ISO, ou null si l'envoi est bloqué. */
  sendAt: string | null
  gapMinutes: number
  reason: HoldReason | null
  rank: number | null
  lastEmailAt: string | null
}

/**
 * Une inscription arrêtée à une étape email faute d'adresse. Elle n'est pas dans
 * la file — rien n'est préparé pour elle — mais elle doit se voir : c'est ce qui
 * alimente l'alerte « N entreprises sans email » et les drapeaux du pipeline.
 */
export interface RegulatorMissingEmailRow {
  enrollmentId: string
  automationId: string
  sequenceName: string
  contactName: string
  companyName: string
  entrepriseId: number | null
  contactId: string | null
  opportuniteId: string | null
  ownerId: string | null
  step: number
  stepLabel: string
}

export interface RegulatorSequenceRow {
  id: string
  name: string
  status: string
  priority: number
  windows: SendWindow[]
  dailyCap: number | null
  sentToday: number
  queued: number
  activeEnrollments: number
  manualTasks: number
  nextSendAt: string | null
  stepKinds: string[]
}

export interface RegulatorAgentRow {
  id: string
  name: string
  role: string | null
  isAdmin: boolean
  unavailable: boolean
  pendingTasks: number
}

export interface RegulatorSentRow {
  id: string
  at: string
  automationId: string | null
  toName: string | null
  subject: string
  gapMinutes: number | null
}

export interface RegulatorView {
  now: string
  settings: RegulatorSettings
  adminUserId: string | null
  /** Union des plages de toutes les séquences actives. */
  openWindows: SendWindow[]
  sentToday: number
  queue: RegulatorQueueRow[]
  /** Prospects arrêtés à l'étape email faute d'adresse — hors file, mais à traiter. */
  missingEmail: RegulatorMissingEmailRow[]
  sent: RegulatorSentRow[]
  sequences: RegulatorSequenceRow[]
  agents: RegulatorAgentRow[]
  /** Tâches manuelles en attente, tous agents confondus. */
  pendingTasks: number
  unassignedTasks: number
  /** Adresses qui reçoivent réellement pendant la phase de test. */
  testAddresses: { id: string; label: string; email: string }[]
  /** Envois retenus aujourd'hui par la phase de test. */
  blockedToday: number
  /** `false` quand sql/20260802_test_phase_guard.sql n'a pas été joué sur cette base. */
  testGuardReady: boolean
  /** Fichier SQL à jouer quand `testGuardReady` est faux. */
  testGuardMigration: string
}

/** Migration qui installe la phase de test (interrupteur + journal des envois retenus). */
export const TEST_GUARD_MIGRATION = 'sql/20260802_test_phase_guard.sql'

const iso = (ms: number | null | undefined): string | null =>
  ms == null || ms === 0 ? null : new Date(ms).toISOString()

/**
 * Construit la vue régulateur. `ownerId` restreint la file aux prospects d'un
 * agent (portail agent) ; sans lui, on voit tout le CRM.
 */
export async function buildRegulatorView(opts: { ownerId?: string | null } = {}): Promise<RegulatorView> {
  const sb = getServiceClient()
  const nowMs = Date.now()
  const settings = await loadRegulatorSettings(sb)
  const history = await loadSendHistory(sb, settings, nowMs)
  const ctx = { settings, history, now: nowMs }

  const { emails, noEmail } = await loadDueEnrollments(sb, nowMs, 400)

  // Les inscriptions déjà marquées « sans email » par le ticker : elles ne sont
  // plus « dues » (leur relecture est reportée) mais restent à traiter, donc
  // elles doivent apparaître dans l'alerte. On les fusionne avec celles que ce
  // tour vient de détecter.
  const { data: heldRows } = await sb
    .from('sequence_enrollments')
    .select('id, automation_id, contact_id, entreprise_id, opportunite_id, current_step')
    .eq('status', 'active')
    .eq('hold_reason', 'no_email')
    .limit(500)

  type HeldRow = {
    id: string
    automation_id: string
    contact_id: string | null
    entreprise_id: number | null
    opportunite_id: string | null
    current_step: number
  }
  const held = new Map<string, HeldRow>()
  for (const row of (heldRows ?? []) as HeldRow[]) held.set(row.id, row)
  for (const entry of noEmail) {
    held.set(entry.enrollment.id, {
      id: entry.enrollment.id,
      automation_id: entry.enrollment.automation_id,
      contact_id: entry.enrollment.contact_id,
      entreprise_id: entry.enrollment.entreprise_id,
      opportunite_id: entry.enrollment.opportunite_id,
      current_step: entry.enrollment.current_step,
    })
  }
  const heldList = [...held.values()]

  // Décoration : nom du contact, entreprise, propriétaire. Deux requêtes en lot
  // plutôt qu'une par ligne — file et « sans email » servies d'un coup.
  const contactIds = [
    ...new Set([...emails.map((e) => e.enrollment.contact_id), ...heldList.map((h) => h.contact_id)].filter(Boolean)),
  ] as string[]
  const entIds = [
    ...new Set(
      [...emails.map((e) => e.enrollment.entreprise_id), ...heldList.map((h) => h.entreprise_id)].filter(
        (v) => v != null,
      ),
    ),
  ] as number[]

  const [contactsRes, entsRes] = await Promise.all([
    contactIds.length > 0
      ? sb.from('contacts').select('id, first_name, last_name').in('id', contactIds)
      : Promise.resolve({ data: [] }),
    entIds.length > 0
      ? sb.from('entreprises').select('id, name, owner_id').in('id', entIds)
      : Promise.resolve({ data: [] }),
  ])

  const contactById = new Map(
    ((contactsRes.data ?? []) as { id: string; first_name: string | null; last_name: string | null }[]).map((c) => [
      c.id,
      `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim(),
    ]),
  )
  const entById = new Map(
    ((entsRes.data ?? []) as { id: number; name: string | null; owner_id: string | null }[]).map((e) => [e.id, e]),
  )

  const decorate = (entry: (typeof emails)[number]): QueueDecoration => {
    const ent = entry.enrollment.entreprise_id != null ? entById.get(entry.enrollment.entreprise_id) : undefined
    return {
      contactName: (entry.enrollment.contact_id ? contactById.get(entry.enrollment.contact_id) : '') || 'Contact',
      companyName: ent?.name ?? '—',
      ownerId: ent?.owner_id ?? null,
    }
  }

  let items = buildQueueItems(emails, ctx, decorate)
  if (opts.ownerId) items = items.filter((i) => i.ownerId === opts.ownerId)

  const plan = planFromContext(items, ctx)

  const queue: RegulatorQueueRow[] = plan.map((p) => ({
    id: p.id,
    automationId: p.automationId,
    sequenceName: p.sequenceName,
    contactName: p.contactName,
    companyName: p.companyName,
    ownerId: p.ownerId,
    step: p.step,
    stepLabel: p.stepLabel,
    sendAt: iso(p.at),
    gapMinutes: p.gapMinutes,
    reason: p.reason,
    rank: p.rank,
    lastEmailAt: iso(p.lastEmailAt),
  }))

  // ── Séquences ─────────────────────────────────────────────────────────────
  const { data: seqRows } = await sb
    .from('automations')
    .select('id, name, status, definition, settings')
    .eq('kind', 'sequence')
    .order('name', { ascending: true })
  const sequencesRaw = (seqRows ?? []) as Automation[]
  const automationById = new Map(sequencesRaw.map((a) => [a.id, a]))

  // ── Sans email ────────────────────────────────────────────────────────────
  let missingEmail: RegulatorMissingEmailRow[] = heldList.map((row) => {
    const automation = automationById.get(row.automation_id)
    const def = (automation?.definition as SequenceDefinition) || { steps: [] }
    const steps = Array.isArray(def.steps) ? def.steps : []
    const step = steps[row.current_step]
    const ent = row.entreprise_id != null ? entById.get(row.entreprise_id) : undefined
    return {
      enrollmentId: row.id,
      automationId: row.automation_id,
      sequenceName: automation?.name ?? 'Séquence',
      contactName: (row.contact_id ? contactById.get(row.contact_id) : '') || 'Contact',
      companyName: ent?.name ?? '—',
      entrepriseId: row.entreprise_id,
      contactId: row.contact_id,
      opportuniteId: row.opportunite_id,
      ownerId: ent?.owner_id ?? null,
      step: row.current_step + 1,
      stepLabel: step?.label || step?.template || `Étape ${row.current_step + 1}`,
    }
  })
  if (opts.ownerId) missingEmail = missingEmail.filter((m) => m.ownerId === opts.ownerId)
  missingEmail.sort((a, b) => a.companyName.localeCompare(b.companyName))

  const { data: activeCounts } = await sb
    .from('sequence_enrollments')
    .select('automation_id, status')
    .eq('status', 'active')
    .limit(5000)
  const activeByAutomation = new Map<string, number>()
  for (const row of (activeCounts ?? []) as { automation_id: string }[]) {
    activeByAutomation.set(row.automation_id, (activeByAutomation.get(row.automation_id) ?? 0) + 1)
  }

  const { data: taskRows } = await sb
    .from('prospection_tasks')
    .select('automation_id, assignee_id')
    .eq('status', 'pending')
    .in('kind', ['call', 'whatsapp', 'linkedin'])
    .limit(5000)
  const tasks = (taskRows ?? []) as { automation_id: string | null; assignee_id: string | null }[]
  const tasksByAutomation = new Map<string, number>()
  const tasksByAgent = new Map<string, number>()
  let unassignedTasks = 0
  for (const t of tasks) {
    if (t.automation_id) tasksByAutomation.set(t.automation_id, (tasksByAutomation.get(t.automation_id) ?? 0) + 1)
    if (t.assignee_id) tasksByAgent.set(t.assignee_id, (tasksByAgent.get(t.assignee_id) ?? 0) + 1)
    else unassignedTasks++
  }

  const queuedByAutomation = new Map<string, number>()
  const nextByAutomation = new Map<string, number>()
  for (const p of plan) {
    queuedByAutomation.set(p.automationId, (queuedByAutomation.get(p.automationId) ?? 0) + 1)
    if (p.at != null && !nextByAutomation.has(p.automationId)) nextByAutomation.set(p.automationId, p.at)
  }

  const sequences: RegulatorSequenceRow[] = sequencesRaw.map((a) => {
    const conf = readSequenceSettings(a.settings)
    const def = (a.definition as SequenceDefinition) || { steps: [] }
    return {
      id: a.id,
      name: a.name,
      status: a.status,
      priority: conf.priority,
      windows: conf.windows.length > 0 ? conf.windows : settings.defaultWindows,
      dailyCap: conf.dailyCap,
      sentToday: history.byAutomation.get(a.id) ?? 0,
      queued: queuedByAutomation.get(a.id) ?? 0,
      activeEnrollments: activeByAutomation.get(a.id) ?? 0,
      manualTasks: tasksByAutomation.get(a.id) ?? 0,
      nextSendAt: iso(nextByAutomation.get(a.id) ?? null),
      stepKinds: Array.isArray(def.steps) ? def.steps.map((s) => s.kind) : [],
    }
  })

  // ── Équipe ────────────────────────────────────────────────────────────────
  const [{ data: profiles }, unavailable, adminId, loads] = await Promise.all([
    sb.from('user_profiles').select('id, full_name, email, role').in('role', ['admin', 'freelance']),
    loadUnavailableAgents(sb),
    resolveAdminId(sb, settings),
    loadTaskLoads(sb),
  ])

  const agents: RegulatorAgentRow[] = (
    (profiles ?? []) as { id: string; full_name: string | null; email: string | null; role: string | null }[]
  )
    .map((p) => ({
      id: p.id,
      name: p.full_name || p.email || 'Sans nom',
      role: p.role,
      isAdmin: p.role === 'admin',
      unavailable: unavailable.has(p.id),
      pendingTasks: tasksByAgent.get(p.id) ?? loads.get(p.id) ?? 0,
    }))
    .sort((a, b) => Number(b.isAdmin) - Number(a.isAdmin) || a.name.localeCompare(b.name))

  // ── Derniers envois, avec l'écart réellement appliqué ─────────────────────
  const sent: RegulatorSentRow[] = history.today.slice(0, 12).map((e, i, arr) => {
    const previous = arr[i + 1]
    return {
      id: e.id,
      at: new Date(e.at).toISOString(),
      automationId: e.automationId,
      toName: e.toName,
      subject: e.subject,
      gapMinutes: previous ? Math.round((e.at - previous.at) / 60_000) : null,
    }
  })

  const openWindows = windowsUnion(
    sequences.filter((s) => s.status === 'on').map((s) => s.windows),
  )

  // ── Phase de test ─────────────────────────────────────────────────────────
  // Tout ce bloc dépend de sql/20260802_test_phase_guard.sql. Sur une base où
  // la migration n'a pas été jouée, on ne fait PAS tomber la page entière : on
  // remonte `testGuardReady: false` et l'interface explique quoi jouer.
  const dayStart = new Date(localDayBounds(nowMs, settings.timezone).start).toISOString()
  const [testRes, blockedRes] = await Promise.all([
    sb.from('test_email_addresses').select('id, label, email').order('created_at', { ascending: true }),
    sb
      .from('email_logs')
      .select('id', { count: 'exact', head: true })
      .not('blocked_reason', 'is', null)
      .gte('sent_at', dayStart),
  ])
  const testGuardReady = !isSchemaGap(testRes.error) && !isSchemaGap(blockedRes.error)
  const testAddresses = ((testRes.data ?? []) as { id: string; label: string | null; email: string }[]).map((r) => ({
    id: r.id,
    label: r.label || r.email.split('@')[0],
    email: r.email,
  }))

  return {
    now: new Date(nowMs).toISOString(),
    settings,
    adminUserId: adminId,
    openWindows: openWindows.length > 0 ? openWindows : settings.defaultWindows,
    sentToday: history.sentToday,
    queue,
    missingEmail,
    sent,
    sequences,
    agents,
    pendingTasks: tasks.length,
    unassignedTasks,
    testAddresses,
    blockedToday: blockedRes.count ?? 0,
    testGuardReady,
    testGuardMigration: TEST_GUARD_MIGRATION,
  }
}

/** Bornes du jour local — exportées pour les routes qui affichent « aujourd'hui ». */
export { localDayBounds }
