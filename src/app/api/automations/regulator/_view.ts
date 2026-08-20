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
  loadQueueEmailContext,
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
import { MIN_SENDS_FOR_GUARD, measureBounceRate } from '@/lib/email/bounce-guard'
import { plafondProspectionDuJour, type PlafondProspection } from '@/lib/rechauffeur/rechauffeur-db'

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
  /**
   * Ce que le réchauffeur autorise aujourd'hui — `null` s'il n'existe pas.
   *
   * Toujours calculé, même réglage éteint : sans ce chiffre, l'interrupteur
   * « plafonner par la chauffe » se proposerait à l'aveugle.
   */
  plafondChauffe: PlafondProspection | null
  adminUserId: string | null
  /** Union des plages de toutes les séquences actives. */
  openWindows: SendWindow[]
  sentToday: number
  queue: RegulatorQueueRow[]
  /** Prospects arrêtés à l'étape email faute d'adresse — hors file, mais à traiter. */
  missingEmail: RegulatorMissingEmailRow[]
  /**
   * Prospects retenus par la phase de test : leur séquence est gelée à l'étape
   * courante, rien n'a été envoyé et rien n'a avancé. Ils repartent seuls dès
   * qu'on coupe la phase de test.
   */
  testHeld: RegulatorMissingEmailRow[]
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
  /** Qualité des adresses et santé de la délivrabilité. */
  verification: RegulatorVerification
}

/**
 * Ce que la page Régulateur montre de la qualité des adresses.
 *
 * Les compteurs disent l'état de la base ; le taux de rebond dit la réalité.
 * Les deux ensemble suffisent à savoir si la prospection est saine, sans avoir
 * à lire la moindre ligne de journal.
 */
export interface RegulatorVerification {
  /** `false` quand sql/20260803_email_verification.sql n'a pas été joué. */
  ready: boolean
  migration: string
  /** Répartition des adresses connues. */
  counts: { valid: number; risky: number; invalid: number; unknown: number; pending: number }
  /** Adresses retirées de la prospection (rebond, plainte, désabonnement). */
  suppressed: number
  /** Taux de rebond dur mesuré, en pourcentage. */
  bounce24h: { sent: number; hardBounces: number; rate: number }
  bounce7d: { sent: number; hardBounces: number; rate: number }
  /** Le disjoncteur couperait-il maintenant ? (seuil dépassé et plancher atteint) */
  overThreshold: boolean
  /** Prospects gelés parce que leur adresse ne recevra pas — à corriger. */
  invalidHeld: RegulatorMissingEmailRow[]
  /** Prospects en attente de vérification — se débloquent seuls. */
  pendingHeld: RegulatorMissingEmailRow[]
  /** Adresses encore à vérifier dans la file de fond. */
  queueLength: number
}

/** Migration qui installe la phase de test (interrupteur + journal des envois retenus). */
export const TEST_GUARD_MIGRATION = 'sql/20260802_test_phase_guard.sql'

/** Migration qui installe le vérificateur d'adresses et le disjoncteur de rebond. */
export const VERIFY_MIGRATION = 'sql/20260803_email_verification.sql'

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

  const {
    emails,
    noEmail,
    testHeld: testHeldDue,
    invalidEmail: invalidDue,
    unverified: unverifiedDue,
    addressOf,
  } = await loadDueEnrollments(sb, nowMs, 400)

  // La file affichée doit montrer les MÊMES motifs que ceux du ticker : quota
  // des adresses douteuses et première touche par domaine compris. Sans ça,
  // l'interface annoncerait un départ que le tick suivant refuserait.
  const emailContext = await loadQueueEmailContext(sb, addressOf, settings, history.emailsToday)
  const ctxWithEmails = { ...ctx, emailContext }

  // Les inscriptions déjà marquées retenues par le ticker : elles ne sont plus
  // forcément « dues » mais restent à traiter, donc elles doivent apparaître
  // dans l'alerte. On les fusionne avec celles que ce tour vient de détecter.
  const { data: heldRows } = await sb
    .from('sequence_enrollments')
    .select('id, automation_id, contact_id, entreprise_id, opportunite_id, current_step, hold_reason')
    .eq('status', 'active')
    .in('hold_reason', ['no_email', 'test_hold', 'email_invalid', 'email_pending'])
    .limit(500)

  type HeldReasonKey = 'no_email' | 'test_hold' | 'email_invalid' | 'email_pending'
  type HeldRow = {
    id: string
    automation_id: string
    contact_id: string | null
    entreprise_id: number | null
    opportunite_id: string | null
    current_step: number
    hold_reason: HeldReasonKey
  }
  const held = new Map<string, HeldRow>()
  for (const row of (heldRows ?? []) as HeldRow[]) held.set(row.id, row)
  const remember = (list: typeof noEmail, reason: HeldReasonKey) => {
    for (const entry of list) {
      held.set(entry.enrollment.id, {
        id: entry.enrollment.id,
        automation_id: entry.enrollment.automation_id,
        contact_id: entry.enrollment.contact_id,
        entreprise_id: entry.enrollment.entreprise_id,
        opportunite_id: entry.enrollment.opportunite_id,
        current_step: entry.enrollment.current_step,
        hold_reason: reason,
      })
    }
  }
  // Le tri du tour courant fait foi : une inscription débloquée depuis la
  // dernière écriture ne doit pas rester dans l'ancienne catégorie.
  remember(noEmail, 'no_email')
  remember(testHeldDue, 'test_hold')
  remember(invalidDue, 'email_invalid')
  remember(unverifiedDue, 'email_pending')
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

  let items = buildQueueItems(emails, ctxWithEmails, decorate)
  if (opts.ownerId) items = items.filter((i) => i.ownerId === opts.ownerId)

  const plan = planFromContext(items, ctxWithEmails)

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

  // ── Retenus hors file : sans email, ou hors liste de la phase de test ─────
  const decorateHeld = (row: HeldRow): RegulatorMissingEmailRow => {
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
  }
  const byCompany = (a: RegulatorMissingEmailRow, b: RegulatorMissingEmailRow) =>
    a.companyName.localeCompare(b.companyName)
  const ownedByCaller = (row: HeldRow) =>
    !opts.ownerId || (row.entreprise_id != null ? entById.get(row.entreprise_id)?.owner_id : null) === opts.ownerId

  const missingEmail = heldList
    .filter((row) => row.hold_reason === 'no_email' && ownedByCaller(row))
    .map(decorateHeld)
    .sort(byCompany)
  const testHeld = heldList
    .filter((row) => row.hold_reason === 'test_hold' && ownedByCaller(row))
    .map(decorateHeld)
    .sort(byCompany)
  const invalidHeld = heldList
    .filter((row) => row.hold_reason === 'email_invalid' && ownedByCaller(row))
    .map(decorateHeld)
    .sort(byCompany)
  const pendingHeld = heldList
    .filter((row) => row.hold_reason === 'email_pending' && ownedByCaller(row))
    .map(decorateHeld)
    .sort(byCompany)

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

  // Le tableau de bord du régulateur ne montre que ce qui peut travailler : une
  // séquence archivée n'a plus ni file ni plage à régler. On filtre la SORTIE et
  // non la requête — `automationById` doit continuer à résoudre le nom d'une
  // séquence archivée pour les inscriptions qu'elle a laissées derrière elle.
  const sequences: RegulatorSequenceRow[] = sequencesRaw.filter((a) => a.status !== 'archived').map((a) => {
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

  // ── Qualité des adresses ──────────────────────────────────────────────────
  // Comme la phase de test : si sql/20260803_email_verification.sql n'a pas été
  // joué, on ne fait pas tomber la page — on remonte `ready: false` et
  // l'interface dit quoi jouer.
  const verification = await buildVerificationView(sb, settings, invalidHeld, pendingHeld)

  // Ce que la chauffe autorise aujourd'hui. Lu même quand le réglage est
  // ÉTEINT : c'est le seul moyen de dire à l'écran « voilà ce qui se passerait
  // si tu l'armais », plutôt que de proposer un interrupteur à l'aveugle.
  const plafondChauffe = await plafondProspectionDuJour(sb, new Date(nowMs)).catch(() => null)

  return {
    now: new Date(nowMs).toISOString(),
    settings,
    adminUserId: adminId,
    openWindows: openWindows.length > 0 ? openWindows : settings.defaultWindows,
    sentToday: history.sentToday,
    queue,
    missingEmail,
    testHeld,
    sent,
    sequences,
    agents,
    pendingTasks: tasks.length,
    unassignedTasks,
    testAddresses,
    blockedToday: blockedRes.count ?? 0,
    testGuardReady,
    testGuardMigration: TEST_GUARD_MIGRATION,
    verification,
    plafondChauffe,
  }
}

/* ── Qualité des adresses & délivrabilité ───────────────────────────────── */

const EMPTY_RATE = { sent: 0, hardBounces: 0, rate: 0 }

const EMPTY_VERIFICATION: Omit<RegulatorVerification, 'invalidHeld' | 'pendingHeld'> = {
  ready: false,
  migration: VERIFY_MIGRATION,
  counts: { valid: 0, risky: 0, invalid: 0, unknown: 0, pending: 0 },
  suppressed: 0,
  bounce24h: EMPTY_RATE,
  bounce7d: EMPTY_RATE,
  overThreshold: false,
  queueLength: 0,
}

/** Compte les lignes d'une table sans les rapatrier. */
async function countRows(
  sb: ReturnType<typeof getServiceClient>,
  build: (q: ReturnType<ReturnType<typeof getServiceClient>['from']>) => unknown,
  table: string,
): Promise<{ count: number; missing: boolean }> {
  try {
    const query = build(sb.from(table)) as Promise<{ count: number | null; error: unknown }>
    const { count, error } = await query
    if (error) return { count: 0, missing: isSchemaGap(error) }
    return { count: count ?? 0, missing: false }
  } catch {
    return { count: 0, missing: true }
  }
}

async function buildVerificationView(
  sb: ReturnType<typeof getServiceClient>,
  settings: RegulatorSettings,
  invalidHeld: RegulatorMissingEmailRow[],
  pendingHeld: RegulatorMissingEmailRow[],
): Promise<RegulatorVerification> {
  const statuses = ['valid', 'risky', 'invalid', 'unknown', 'pending'] as const

  const [countResults, suppressed, bounce24h, bounce7d] = await Promise.all([
    Promise.all(
      statuses.map((status) =>
        countRows(
          sb,
          (q) => q.select('email', { count: 'exact', head: true }).eq('status', status),
          'email_verifications',
        ),
      ),
    ),
    countRows(sb, (q) => q.select('email', { count: 'exact', head: true }), 'email_suppressions'),
    measureBounceRate(sb),
    measureBounceRate(sb, 7 * 86_400_000),
  ])

  if (countResults.some((r) => r.missing)) {
    return { ...EMPTY_VERIFICATION, invalidHeld, pendingHeld }
  }

  const counts = Object.fromEntries(
    statuses.map((status, i) => [status, countResults[i].count]),
  ) as RegulatorVerification['counts']

  const rate = (r: { sent: number; hardBounces: number; rate: number }) => ({
    sent: r.sent,
    hardBounces: r.hardBounces,
    rate: Number(r.rate.toFixed(2)),
  })

  return {
    ready: true,
    migration: VERIFY_MIGRATION,
    counts,
    suppressed: suppressed.count,
    bounce24h: rate(bounce24h),
    bounce7d: rate(bounce7d),
    // Le plancher compte autant que le seuil : un rebond sur trois envois
    // afficherait 33 % sans rien vouloir dire.
    overThreshold:
      bounce24h.measured &&
      bounce24h.sent >= MIN_SENDS_FOR_GUARD &&
      bounce24h.rate > settings.bounceGuardThreshold,
    invalidHeld,
    pendingHeld,
    // La file de vérification, c'est tout ce qui n'a pas de verdict frais.
    queueLength: counts.pending + counts.unknown,
  }
}

/** Bornes du jour local — exportées pour les routes qui affichent « aujourd'hui ». */
export { localDayBounds }
