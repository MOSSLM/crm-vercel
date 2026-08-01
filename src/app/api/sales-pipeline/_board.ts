// _board.ts — le tableau du pipeline commercial.
//
// Une ligne = une opportunité. Huit colonnes = les huit étapes de la vente.
// L'état de chaque cellule vient de trois sources qu'on recoud ici :
//   • `sequence_enrollments` — où en est la séquence (quoi, quelle étape) ;
//   • le RÉGULATEUR — quand le prochain email part, et pourquoi il attend ;
//   • `sales_pipeline_state` — ce que seul le commercial sait (RDV calé,
//     proposition envoyée, perdu / nurturing / blacklist, étapes sautées).
//
// Partagé entre le board admin (tout le CRM) et le board agent (`ownerId` posé).

import { getServiceClient } from '@/app/api/_lib/service-client'
import { SITE_DOMAIN } from '@/lib/site-domain'
import type { Automation, SequenceDefinition } from '@/components/automations/types'
import {
  EMPTY_STATE,
  SALES_STAGES,
  cellStatuses,
  isPendingTask,
  stageForStepKind,
  stageIndex,
  type CellStatus,
  type SalesStageId,
  type SalesStateRow,
} from '@/lib/sales-pipeline/stages'
import { buildRegulatorView, type RegulatorQueueRow } from '@/app/api/automations/regulator/_view'
import type { HoldReason, SendWindow } from '@/lib/automations/regulator'

/** Combien d'opportunités on remonte au maximum avant filtrage. */
const OPPORTUNITY_LIMIT = 1000

export type SalesStatusFilter = 'actifs' | 'rdv' | 'won' | 'closed' | 'tous'

export interface SalesBoardQuery {
  /** Agent : restreint aux prospects qui lui appartiennent. */
  ownerId?: string | null
  q?: string
  /** Filtre « vue » côté admin : un agent en particulier. */
  view?: string
  status?: SalesStatusFilter
  sequence?: string
  todoOnly?: boolean
  page?: number
  perPage?: number
}

export interface SalesSequenceInfo {
  enrollmentId: string
  automationId: string
  name: string
  status: string
  currentStep: number
  totalSteps: number
  stepKind: string | null
  stepLabel: string
  /** Heure retenue par le régulateur pour le prochain email. */
  sendAt: string | null
  holdReason: HoldReason | null
  /** Rang dans la file globale (0 = prochain départ du CRM). */
  rank: number | null
  gapMinutes: number | null
}

export interface SalesTaskInfo {
  id: string
  kind: string
  dueAt: string
  message: string
  scriptName: string | null
  phone: string | null
  linkedin: string | null
  assigneeId: string | null
  routingReason: string | null
}

export interface SalesBoardRow {
  id: string
  name: string
  entrepriseId: number | null
  companyName: string
  companyUrl: string | null
  logoUrl: string | null
  ville: string | null
  sector: string | null
  phone: string | null
  montant: number | null
  type: string | null
  mrr: number | null
  contact: { id: string; name: string; role: string | null; email: string | null; phone: string | null } | null
  owner: { id: string; name: string } | null
  stageName: string | null
  sequence: SalesSequenceInfo | null
  tasks: SalesTaskInfo[]
  emailsSent: number
  lastExchange: { channel: string; at: string } | null
  auditReady: boolean
  demoUrl: string | null
  state: SalesStateRow
  cells: Record<SalesStageId, CellStatus>
  /** La ligne attend une action humaine aujourd'hui. */
  hasTodo: boolean
}

export interface SalesBoardCounts {
  actifs: number
  rdvPlus: number
  won: number
  todo: number
  value: number
}

export interface SalesBoardData {
  rows: SalesBoardRow[]
  total: number
  page: number
  perPage: number
  counts: SalesBoardCounts
  /** Compteurs par colonne, calculés sur l'ensemble filtré (pas sur la page). */
  columns: Record<SalesStageId, { active: number; done: number }>
  agents: { id: string; name: string; isAdmin: boolean }[]
  sequences: {
    id: string
    name: string
    status: string
    steps: { kind: string; day: number; label: string }[]
    windows: SendWindow[]
    activeEnrollments: number
  }[]
  regulator: {
    paused: boolean
    gapMinMinutes: number
    gapMaxMinutes: number
    dailyCap: number
    sentToday: number
    timezone: string
    openWindows: SendWindow[]
    queued: number
    blocked: number
    nextSendAt: string | null
  }
  /** La file complète, pour le tiroir « voir la file d'envoi ». */
  queue: RegulatorQueueRow[]
}

type OppRow = {
  id: string
  entreprise_id: number | null
  contact_id: string | null
  pipeline_id: string | null
  stage_id: number | null
  name: string | null
  montant: number | null
  type: string | null
  mrr: number | null
  owner_id: string | null
  created_at: string | null
  updated_at: string | null
}

type StateRow = {
  opportunite_id: string
  reached: string
  passed: string[] | null
  skipped: string[] | null
  skip_reason: string | null
  state: string
  state_reason: string | null
  nurture_at: string | null
  replied: boolean | null
  rdv_at: string | null
  propo_amount: number | string | null
  objection: string | null
  stage_dates: Record<string, string> | null
}

const asStage = (value: string | null | undefined): SalesStageId =>
  (stageIndex(value ?? '') >= 0 ? value : 'seq') as SalesStageId

const asStages = (values: string[] | null | undefined): SalesStageId[] =>
  (values ?? []).filter((v) => stageIndex(v) >= 0) as SalesStageId[]

export function toStateRow(row: StateRow | undefined): SalesStateRow {
  if (!row) return { ...EMPTY_STATE, passed: [], skipped: [], stageDates: {} }
  const amount = row.propo_amount == null ? null : Number(row.propo_amount)
  return {
    reached: asStage(row.reached),
    passed: asStages(row.passed),
    skipped: asStages(row.skipped),
    skipReason: row.skip_reason,
    state: (['progress', 'nurt', 'lost', 'black', 'won'].includes(row.state)
      ? row.state
      : 'progress') as SalesStateRow['state'],
    stateReason: row.state_reason,
    nurtureAt: row.nurture_at,
    replied: !!row.replied,
    rdvAt: row.rdv_at,
    propoAmount: Number.isFinite(amount) ? amount : null,
    objection: row.objection,
    stageDates: (row.stage_dates ?? {}) as SalesStateRow['stageDates'],
  }
}

/**
 * Étape réellement atteinte : on part de ce qui est enregistré, et on avance
 * (jamais en arrière) selon ce que dit la séquence. Un prospect ne recule
 * jamais d'étape — sauf réactivation explicite depuis Perdu / Nurturing.
 */
export function deriveReached(state: SalesStateRow, sequence: SalesSequenceInfo | null): SalesStateRow {
  if (state.state === 'won') return { ...state, reached: 'signe' }
  if (state.state !== 'progress') return state

  // Phase commerciale : la séquence n'a plus son mot à dire.
  if (stageIndex(state.reached) >= stageIndex('rdv')) return state

  if (!sequence) {
    // Séquence terminée : le commercial reprend la main au RDV. Sans séquence
    // du tout, on garde ce que dit l'état — une étape validée à la main ne doit
    // pas être annulée par la dérivation.
    if (state.passed.includes('seq')) {
      const target: SalesStageId = 'rdv'
      return stageIndex(state.reached) >= stageIndex(target) ? state : { ...state, reached: target }
    }
    return state
  }

  if (sequence.status === 'finished' || sequence.status === 'exited') {
    return stageIndex(state.reached) >= stageIndex('rdv') ? state : { ...state, reached: 'rdv' }
  }

  const target = stageForStepKind(sequence.stepKind)
  if (!target) return state
  // Le prospect a déjà réagi : on ne le renvoie pas vers un WhatsApp ou un appel.
  if (state.replied && (target === 'wa' || target === 'call')) {
    return stageIndex(state.reached) >= stageIndex('rdv') ? state : { ...state, reached: 'rdv' }
  }
  return { ...state, reached: target }
}

export async function buildSalesBoard(query: SalesBoardQuery = {}): Promise<
  { ok: true; data: SalesBoardData } | { ok: false; error: string; status: number }
> {
  const sb = getServiceClient()
  const perPage = Math.min(50, Math.max(1, query.perPage ?? 8))
  const page = Math.max(0, query.page ?? 0)

  // ── 1. Opportunités ──────────────────────────────────────────────────────
  let oppQuery = sb
    .from('opportunites')
    .select('id, entreprise_id, contact_id, pipeline_id, stage_id, name, montant, type, mrr, owner_id, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(OPPORTUNITY_LIMIT)
  if (query.ownerId) oppQuery = oppQuery.eq('owner_id', query.ownerId)

  const { data: oppData, error: oppError } = await oppQuery
  if (oppError) return { ok: false, error: oppError.message, status: 500 }
  const opps = (oppData ?? []) as OppRow[]

  const oppIds = opps.map((o) => o.id)
  const entIds = [...new Set(opps.map((o) => o.entreprise_id).filter((v) => v != null))] as number[]

  // ── 2. Tout ce qui décore une ligne, en lots ─────────────────────────────
  const [entsRes, statesRes, enrollRes, tasksRes, logsRes, auditsRes, sitesRes, stagesRes, contactsRes] =
    await Promise.all([
      entIds.length > 0
        ? sb
            .from('entreprises')
            .select('id, name, ville, telephone, site_web_canonique, canonical_url, logo_url, owner_id, service_tags')
            .in('id', entIds)
        : Promise.resolve({ data: [] as unknown[] }),
      oppIds.length > 0
        ? sb.from('sales_pipeline_state').select('*').in('opportunite_id', oppIds)
        : Promise.resolve({ data: [] as unknown[] }),
      oppIds.length > 0
        ? sb
            .from('sequence_enrollments')
            .select('id, automation_id, opportunite_id, entreprise_id, current_step, status, send_at, hold_reason')
            .in('opportunite_id', oppIds)
            .in('status', ['active', 'paused', 'finished', 'replied', 'exited'])
        : Promise.resolve({ data: [] as unknown[] }),
      oppIds.length > 0
        ? sb
            .from('prospection_tasks')
            .select('id, kind, status, due_at, payload, opportunite_id, assignee_id, routing_reason')
            .in('opportunite_id', oppIds)
            .eq('status', 'pending')
        : Promise.resolve({ data: [] as unknown[] }),
      oppIds.length > 0
        ? sb
            .from('email_logs')
            .select('opportunite_id, sent_at, channel, type, status')
            .in('opportunite_id', oppIds)
            .eq('status', 'sent')
            .order('sent_at', { ascending: false })
            .limit(5000)
        : Promise.resolve({ data: [] as unknown[] }),
      oppIds.length > 0
        ? sb.from('audits').select('opportunite_id, statut, pdf_url, demo_site_url').in('opportunite_id', oppIds)
        : Promise.resolve({ data: [] as unknown[] }),
      entIds.length > 0
        ? sb
            .from('sites')
            .select('enterprise_id, is_published, published_subdomain, published_domain, build_stage, is_template')
            .in('enterprise_id', entIds)
        : Promise.resolve({ data: [] as unknown[] }),
      sb.from('etapes_pipeline').select('id, nom'),
      // Les contacts sont chargés par entreprise, jamais en entier : la table
      // porte tout le CRM et un `select *` la ferait grossir avec le carnet.
      entIds.length > 0
        ? sb
            .from('contacts')
            .select('id, first_name, last_name, email, tel, role_title, entreprise_id, is_decision_maker')
            .in('entreprise_id', entIds)
        : Promise.resolve({ data: [] as unknown[] }),
    ])

  const entById = new Map(
    (
      (entsRes.data ?? []) as {
        id: number
        name: string | null
        ville: string | null
        telephone: string | null
        site_web_canonique: string | null
        canonical_url: string | null
        logo_url: string | null
        owner_id: string | null
        service_tags: string[] | string | null
      }[]
    ).map((e) => [e.id, e]),
  )

  const stateByOpp = new Map(((statesRes.data ?? []) as StateRow[]).map((s) => [s.opportunite_id, s]))
  const stageNameById = new Map(
    ((stagesRes.data ?? []) as { id: number; nom: string }[]).map((s) => [s.id, s.nom]),
  )

  // Contact d'une opportunité : celui rattaché, sinon le décideur de l'entreprise.
  type ContactRow = {
    id: string
    first_name: string | null
    last_name: string | null
    email: string | null
    tel: string | null
    role_title: string | null
    entreprise_id: number | null
    is_decision_maker: boolean | null
  }
  const contacts = (contactsRes.data ?? []) as ContactRow[]

  // Un contact rattaché à l'opportunité mais pas à l'entreprise (rare, mais ça
  // existe après une fusion de doublons) ne serait pas dans le lot ci-dessus.
  const known = new Set(contacts.map((c) => c.id))
  const orphanIds = opps
    .map((o) => o.contact_id)
    .filter((id): id is string => !!id && !known.has(id))
  if (orphanIds.length > 0) {
    const { data: extra } = await sb
      .from('contacts')
      .select('id, first_name, last_name, email, tel, role_title, entreprise_id, is_decision_maker')
      .in('id', [...new Set(orphanIds)])
    contacts.push(...((extra ?? []) as ContactRow[]))
  }
  const contactById = new Map(contacts.map((c) => [c.id, c]))
  const contactByEnt = new Map<number, (typeof contacts)[number]>()
  for (const c of contacts) {
    if (c.entreprise_id == null) continue
    const current = contactByEnt.get(c.entreprise_id)
    if (!current || (c.is_decision_maker && !current.is_decision_maker)) contactByEnt.set(c.entreprise_id, c)
  }

  // Inscription retenue par opportunité : d'abord une active, sinon la dernière connue.
  type EnrollRow = {
    id: string
    automation_id: string
    opportunite_id: string | null
    current_step: number
    status: string
    send_at: string | null
    hold_reason: string | null
  }
  const enrollments = (enrollRes.data ?? []) as EnrollRow[]
  const enrollByOpp = new Map<string, EnrollRow>()
  for (const e of enrollments) {
    if (!e.opportunite_id) continue
    const current = enrollByOpp.get(e.opportunite_id)
    const rank = (s: string) => (s === 'active' ? 0 : s === 'paused' ? 1 : 2)
    if (!current || rank(e.status) < rank(current.status)) enrollByOpp.set(e.opportunite_id, e)
  }

  const automationIds = [...new Set(enrollments.map((e) => e.automation_id))]
  const { data: autoRows } = automationIds.length
    ? await sb.from('automations').select('id, name, status, definition, settings').in('id', automationIds)
    : { data: [] as unknown[] }
  const automationById = new Map(((autoRows ?? []) as Automation[]).map((a) => [a.id, a]))

  const tasksByOpp = new Map<string, SalesTaskInfo[]>()
  for (const t of (tasksRes.data ?? []) as {
    id: string
    kind: string
    due_at: string
    payload: Record<string, unknown> | null
    opportunite_id: string | null
    assignee_id: string | null
    routing_reason: string | null
  }[]) {
    if (!t.opportunite_id) continue
    const list = tasksByOpp.get(t.opportunite_id) ?? []
    const payload = t.payload ?? {}
    list.push({
      id: t.id,
      kind: t.kind,
      dueAt: t.due_at,
      message: String(payload.message ?? payload.script ?? ''),
      scriptName: (payload.scriptName as string | undefined) ?? null,
      phone: (payload.phone as string | undefined) ?? null,
      linkedin: (payload.linkedin as string | undefined) ?? null,
      assigneeId: t.assignee_id,
      routingReason: t.routing_reason,
    })
    tasksByOpp.set(t.opportunite_id, list)
  }

  const emailCount = new Map<string, number>()
  const lastExchange = new Map<string, { channel: string; at: string }>()
  for (const log of (logsRes.data ?? []) as {
    opportunite_id: string | null
    sent_at: string
    channel: string | null
    type: string | null
  }[]) {
    if (!log.opportunite_id) continue
    const channel = log.channel ?? 'email'
    if (channel === 'email') emailCount.set(log.opportunite_id, (emailCount.get(log.opportunite_id) ?? 0) + 1)
    if (!lastExchange.has(log.opportunite_id)) lastExchange.set(log.opportunite_id, { channel, at: log.sent_at })
  }

  const auditByOpp = new Map(
    ((auditsRes.data ?? []) as { opportunite_id: string | null; statut: string | null; demo_site_url: string | null }[])
      .filter((a) => a.opportunite_id)
      .map((a) => [a.opportunite_id as string, a]),
  )

  const siteByEnt = new Map<number, string>()
  for (const s of (sitesRes.data ?? []) as {
    enterprise_id: number | null
    is_published: boolean | null
    published_subdomain: string | null
    published_domain: string | null
    is_template: boolean | null
  }[]) {
    if (s.enterprise_id == null || s.is_template) continue
    const url = s.published_domain
      ? s.published_domain.startsWith('http')
        ? s.published_domain
        : `https://${s.published_domain}`
      : s.published_subdomain
        ? `https://${s.published_subdomain}.${SITE_DOMAIN}`
        : null
    if (url && (s.is_published || !siteByEnt.has(s.enterprise_id))) siteByEnt.set(s.enterprise_id, url)
  }

  // ── 3. Le régulateur : quand part le prochain email de chaque ligne ──────
  const regulatorView = await buildRegulatorView()
  const slotByEnrollment = new Map(regulatorView.queue.map((q) => [q.id, q]))

  // ── 4. Agents ────────────────────────────────────────────────────────────
  const agents = regulatorView.agents.map((a) => ({ id: a.id, name: a.name, isAdmin: a.isAdmin }))
  const agentNameById = new Map(agents.map((a) => [a.id, a.name]))

  // ── 5. Montage des lignes ────────────────────────────────────────────────
  const rows: SalesBoardRow[] = opps.map((opp) => {
    const ent = opp.entreprise_id != null ? entById.get(opp.entreprise_id) : undefined
    const contact =
      (opp.contact_id ? contactById.get(opp.contact_id) : undefined) ??
      (opp.entreprise_id != null ? contactByEnt.get(opp.entreprise_id) : undefined)

    const enrollment = enrollByOpp.get(opp.id)
    let sequence: SalesSequenceInfo | null = null
    if (enrollment) {
      const automation = automationById.get(enrollment.automation_id)
      const def = (automation?.definition as SequenceDefinition) ?? { steps: [] }
      const steps = Array.isArray(def.steps) ? def.steps : []
      const step = steps[enrollment.current_step]
      const slot = slotByEnrollment.get(enrollment.id)
      sequence = {
        enrollmentId: enrollment.id,
        automationId: enrollment.automation_id,
        name: automation?.name ?? 'Séquence',
        // Une séquence mise en pause par l'admin gèle ses inscriptions.
        status: automation && automation.status !== 'on' && enrollment.status === 'active' ? 'paused' : enrollment.status,
        currentStep: enrollment.current_step + 1,
        totalSteps: steps.length,
        stepKind: step?.kind ?? null,
        stepLabel: step?.label || step?.template || `Étape ${enrollment.current_step + 1}`,
        sendAt: slot?.sendAt ?? enrollment.send_at,
        holdReason: (slot?.reason ?? (enrollment.hold_reason as HoldReason | null)) ?? null,
        rank: slot?.rank ?? null,
        gapMinutes: slot?.gapMinutes ?? null,
      }
    }

    const state = deriveReached(toStateRow(stateByOpp.get(opp.id)), sequence)
    const cells = cellStatuses(state)
    const ownerId = opp.owner_id ?? ent?.owner_id ?? null
    const audit = auditByOpp.get(opp.id)
    const tags = Array.isArray(ent?.service_tags)
      ? ent?.service_tags.filter(Boolean).join(' · ')
      : typeof ent?.service_tags === 'string'
        ? ent.service_tags
        : null

    return {
      id: opp.id,
      name: opp.name ?? ent?.name ?? 'Opportunité',
      entrepriseId: opp.entreprise_id,
      companyName: ent?.name ?? opp.name ?? '—',
      companyUrl: ent?.site_web_canonique ?? ent?.canonical_url ?? null,
      logoUrl: ent?.logo_url ?? null,
      ville: ent?.ville ?? null,
      sector: tags,
      phone: ent?.telephone ?? contact?.tel ?? null,
      montant: opp.montant,
      type: opp.type,
      mrr: opp.mrr,
      contact: contact
        ? {
            id: contact.id,
            name: `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim() || 'Contact',
            role: contact.role_title,
            email: contact.email,
            phone: contact.tel,
          }
        : null,
      owner: ownerId ? { id: ownerId, name: agentNameById.get(ownerId) ?? 'Agent' } : null,
      stageName: opp.stage_id != null ? (stageNameById.get(opp.stage_id) ?? null) : null,
      sequence,
      tasks: tasksByOpp.get(opp.id) ?? [],
      emailsSent: emailCount.get(opp.id) ?? 0,
      lastExchange: lastExchange.get(opp.id) ?? null,
      auditReady: audit?.statut === 'ready',
      demoUrl: (opp.entreprise_id != null ? siteByEnt.get(opp.entreprise_id) : undefined) ?? audit?.demo_site_url ?? null,
      state,
      cells,
      hasTodo: SALES_STAGES.some((s) => isPendingTask(state, s.id)),
    }
  })

  // ── 6. Filtres ───────────────────────────────────────────────────────────
  const needle = (query.q ?? '').trim().toLowerCase()
  const filtered = rows.filter((row) => {
    if (needle) {
      const hay = `${row.companyName} ${row.name} ${row.ville ?? ''} ${row.sector ?? ''} ${row.contact?.name ?? ''}`
      if (!hay.toLowerCase().includes(needle)) return false
    }
    if (query.view && query.view !== 'all') {
      if (query.view === 'none' ? row.owner != null : row.owner?.id !== query.view) return false
    }
    if (query.sequence && query.sequence !== 'all') {
      if (query.sequence === 'none' ? row.sequence != null : row.sequence?.automationId !== query.sequence) return false
    }
    const status = query.status ?? 'actifs'
    if (status === 'actifs' && row.state.state !== 'progress') return false
    if (status === 'rdv' && stageIndex(row.state.reached) < stageIndex('rdv')) return false
    if (status === 'won' && row.state.state !== 'won') return false
    if (status === 'closed' && row.state.state === 'progress') return false
    if (query.todoOnly && !row.hasTodo) return false
    return true
  })

  // ── 7. Compteurs et pagination ───────────────────────────────────────────
  const columns = {} as SalesBoardData['columns']
  for (const stage of SALES_STAGES) columns[stage.id] = { active: 0, done: 0 }
  for (const row of filtered) {
    for (const stage of SALES_STAGES) {
      const status = row.cells[stage.id]
      if (status === 'active') columns[stage.id].active++
      else if (status === 'done') columns[stage.id].done++
    }
  }

  const active = rows.filter((r) => r.state.state === 'progress')
  const counts: SalesBoardCounts = {
    actifs: active.length,
    rdvPlus: active.filter((r) => stageIndex(r.state.reached) >= stageIndex('rdv')).length,
    won: rows.filter((r) => r.state.state === 'won').length,
    todo: rows.filter((r) => r.hasTodo).length,
    value: active.reduce((sum, r) => sum + (r.montant ?? 0), 0),
  }

  const total = filtered.length
  const maxPage = Math.max(0, Math.ceil(total / perPage) - 1)
  const safePage = Math.min(page, maxPage)
  const pageRows = filtered.slice(safePage * perPage, safePage * perPage + perPage)

  // ── 8. Séquences proposables + état du régulateur ────────────────────────
  const sequences = regulatorView.sequences.map((s) => {
    const automation = automationById.get(s.id)
    const def = (automation?.definition as SequenceDefinition) ?? { steps: [] }
    return {
      id: s.id,
      name: s.name,
      status: s.status,
      steps: (Array.isArray(def.steps) ? def.steps : []).map((step) => ({
        kind: step.kind,
        day: step.day ?? 0,
        label: step.label || step.template || step.kind,
      })),
      windows: s.windows,
      activeEnrollments: s.activeEnrollments,
    }
  })

  // Les définitions d'étapes ne sont chargées que pour les séquences déjà
  // utilisées ; on complète pour celles qui n'ont encore aucune inscription.
  const missing = regulatorView.sequences.filter((s) => !automationById.has(s.id)).map((s) => s.id)
  if (missing.length > 0) {
    const { data: extra } = await sb.from('automations').select('id, definition').in('id', missing)
    const defById = new Map(((extra ?? []) as { id: string; definition: unknown }[]).map((a) => [a.id, a.definition]))
    for (const seq of sequences) {
      if (seq.steps.length > 0) continue
      const def = (defById.get(seq.id) as SequenceDefinition | undefined) ?? { steps: [] }
      seq.steps = (Array.isArray(def.steps) ? def.steps : []).map((step) => ({
        kind: step.kind,
        day: step.day ?? 0,
        label: step.label || step.template || step.kind,
      }))
    }
  }

  const scopedQueue = query.ownerId
    ? regulatorView.queue.filter((q) => q.ownerId === query.ownerId)
    : regulatorView.queue

  const nextSend = scopedQueue.find((q) => q.sendAt != null)

  return {
    ok: true,
    data: {
      rows: pageRows,
      total,
      page: safePage,
      perPage,
      counts,
      columns,
      agents,
      sequences,
      regulator: {
        paused: regulatorView.settings.paused,
        gapMinMinutes: regulatorView.settings.gapMinMinutes,
        gapMaxMinutes: regulatorView.settings.gapMaxMinutes,
        dailyCap: regulatorView.settings.dailyCap,
        sentToday: regulatorView.sentToday,
        timezone: regulatorView.settings.timezone,
        openWindows: regulatorView.openWindows,
        queued: scopedQueue.filter((q) => q.sendAt != null).length,
        blocked: scopedQueue.filter((q) => q.sendAt == null).length,
        nextSendAt: nextSend?.sendAt ?? null,
      },
      queue: scopedQueue,
    },
  }
}
