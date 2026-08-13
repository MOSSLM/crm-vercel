// _view.ts — le rapport de performance des séquences.
//
// LA PIÈGE DE `email_logs.delivery_status`
// Ce champ ne garde que l'état le pire vu à ce jour (cf. `DELIVERY_RANK` dans
// le webhook Resend) : « delivered » (rang 3) l'emporte sur « opened » (rang 1)
// et « clicked » (rang 2), pour ne jamais faire régresser un rebond en
// « ouvert ». Conséquence directe : dès que l'événement `delivered` arrive —
// ce qui est presque toujours le cas, et presque toujours EN PREMIER — les
// ouvertures et clics réels qui suivent n'écrivent plus rien sur la ligne.
// Compter les taux d'ouverture depuis `email_logs` sous-évaluerait donc
// massivement la réalité, silencieusement.
//
// D'où le choix de relire `email_events`, le journal BRUT du webhook (une
// ligne par événement Resend, jamais écrasée) : c'est la seule source qui dise
// vraiment « cet email a été ouvert », indépendamment de ce que la ligne
// `email_logs` en a retenu.
//
// LA RÉPONSE ET LE RDV NE SE MESURENT PAS AU NIVEAU DE L'EMAIL
// Rien ne détecte une réponse entrante par email (pas de parsing IMAP) : le
// seul signal fiable est `sales_pipeline_state.replied`, posé à la main par le
// commercial via les « 5 issues » du pipeline (cf. docs/regulateur-et-pipeline-
// commercial.md). Il vit sur l'OPPORTUNITÉ, pas sur l'inscription — deux
// séquences qui se relaient sur la même opportunité verraient donc, en théorie,
// la même réponse comptée deux fois. C'est une approximation assumée, la
// meilleure que les données actuelles permettent.
//
// « Réponse dès la 1ʳᵉ approche » se déduit de `current_step` : les 5 issues
// du pipeline arrêtent la séquence (`stopOutreach`) sans faire avancer
// l'inscription davantage, donc `current_step` reste gelé sur l'étape atteinte
// au moment de la réaction. `current_step <= 1` veut dire « la séquence n'a pas
// dépassé son tout premier contact » — email, WhatsApp ou appel, peu importe le
// canal.

import { getServiceClient } from '@/app/api/_lib/service-client'
import { isMissingTable } from '@/app/api/_lib/schema-gap'
import type { Automation, EnrollmentStatus, SequenceDefinition } from '@/components/automations/types'

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

const rate = (n: number, d: number): number | null => (d > 0 ? n / d : null)

/** Étiquette UTM prête à coller dans les liens d'une séquence, une fois Clarity/GA installés. */
function utmSlug(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base || 'sequence'
}

export interface SequenceStatsRow {
  id: string
  name: string
  status: Automation['status']
  emailSteps: number
  enrollmentsTotal: number
  enrollmentsActive: number
  sent: number
  delivered: number
  opened: number
  clicked: number
  bouncedHard: number
  bouncedSoft: number
  openRate: number | null
  clickRate: number | null
  bounceRate: number | null
  repliedCount: number
  replyRate: number | null
  firstTouchRepliedCount: number
  firstTouchReplyRate: number | null
  rdvCount: number
  rdvRate: number | null
  rdvFromReplyRate: number | null
  utmCampaign: string
}

export interface SequenceStatsView {
  generatedAt: string
  since: string | null
  rows: SequenceStatsRow[]
  totals: Omit<SequenceStatsRow, 'id' | 'name' | 'status' | 'utmCampaign' | 'emailSteps'>
  /** Tables attendues mais absentes (migration non jouée) — les compteurs concernés restent à 0. */
  gaps: string[]
}

const emptyRow = (a: { id: string; name: string; status: Automation['status']; emailSteps: number }): SequenceStatsRow => ({
  ...a,
  enrollmentsTotal: 0,
  enrollmentsActive: 0,
  sent: 0,
  delivered: 0,
  opened: 0,
  clicked: 0,
  bouncedHard: 0,
  bouncedSoft: 0,
  openRate: null,
  clickRate: null,
  bounceRate: null,
  repliedCount: 0,
  replyRate: null,
  firstTouchRepliedCount: 0,
  firstTouchReplyRate: null,
  rdvCount: 0,
  rdvRate: null,
  rdvFromReplyRate: null,
  utmCampaign: utmSlug(a.name),
})

export async function buildSequenceStatsView(opts: { sinceDays?: number | null } = {}): Promise<SequenceStatsView> {
  const sb = getServiceClient()
  const gaps: string[] = []
  const since = opts.sinceDays && opts.sinceDays > 0 ? new Date(Date.now() - opts.sinceDays * 86_400_000) : null
  const sinceIso = since ? since.toISOString() : null

  const { data: seqRows } = await sb
    .from('automations')
    .select('id,name,status,definition')
    .eq('kind', 'sequence')
    .order('name', { ascending: true })
  const sequences = (seqRows ?? []) as Pick<Automation, 'id' | 'name' | 'status' | 'definition'>[]

  const rowsById = new Map<string, SequenceStatsRow>()
  for (const seq of sequences) {
    const def = (seq.definition as SequenceDefinition) || { steps: [] }
    const emailSteps = (Array.isArray(def.steps) ? def.steps : []).filter((s) => s.kind === 'email').length
    rowsById.set(seq.id, emptyRow({ id: seq.id, name: seq.name, status: seq.status, emailSteps }))
  }
  if (sequences.length === 0) {
    return { generatedAt: new Date().toISOString(), since: sinceIso, rows: [], totals: emptyRow({ id: '', name: '', status: 'draft', emailSteps: 0 }), gaps }
  }
  const seqIds = sequences.map((s) => s.id)

  // ── Inscriptions ───────────────────────────────────────────────────────
  let enrQuery = sb
    .from('sequence_enrollments')
    .select('id,automation_id,opportunite_id,status,current_step')
    .in('automation_id', seqIds)
  if (sinceIso) enrQuery = enrQuery.gte('entered_at', sinceIso)
  const { data: enrData, error: enrError } = await enrQuery
  if (enrError && isMissingTable(enrError)) gaps.push('sequence_enrollments')
  const enrollments = (enrData ?? []) as {
    id: string
    automation_id: string
    opportunite_id: string | null
    status: EnrollmentStatus
    current_step: number
  }[]

  const oppIds = [...new Set(enrollments.map((e) => e.opportunite_id).filter((x): x is string => !!x))]
  const pipelineByOpp = new Map<string, { replied: boolean; rdv_at: string | null }>()
  for (const batch of chunk(oppIds, 300)) {
    const { data, error } = await sb
      .from('sales_pipeline_state')
      .select('opportunite_id,replied,rdv_at')
      .in('opportunite_id', batch)
    if (error) {
      if (isMissingTable(error)) gaps.push('sales_pipeline_state')
      continue
    }
    for (const r of (data ?? []) as { opportunite_id: string; replied: boolean | null; rdv_at: string | null }[]) {
      pipelineByOpp.set(r.opportunite_id, { replied: !!r.replied, rdv_at: r.rdv_at })
    }
  }

  for (const e of enrollments) {
    const row = rowsById.get(e.automation_id)
    if (!row) continue
    row.enrollmentsTotal++
    if (e.status === 'active') row.enrollmentsActive++
    const pipe = e.opportunite_id ? pipelineByOpp.get(e.opportunite_id) : null
    if (pipe?.replied) {
      row.repliedCount++
      if (e.current_step <= 1) row.firstTouchRepliedCount++
    }
    if (pipe?.rdv_at) row.rdvCount++
  }

  // ── Emails envoyés ─────────────────────────────────────────────────────
  let logQuery = sb
    .from('email_logs')
    .select('automation_id,resend_id,sent_at')
    .in('automation_id', seqIds)
    .eq('status', 'sent')
  if (sinceIso) logQuery = logQuery.gte('sent_at', sinceIso)
  const { data: logData, error: logError } = await logQuery
  if (logError && isMissingTable(logError)) gaps.push('email_logs')
  const emailLogs = (logData ?? []) as { automation_id: string | null; resend_id: string | null; sent_at: string }[]

  const automationByResendId = new Map<string, string>()
  for (const l of emailLogs) {
    if (!l.automation_id) continue
    const row = rowsById.get(l.automation_id)
    if (!row) continue
    row.sent++
    if (l.resend_id) automationByResendId.set(l.resend_id, l.automation_id)
  }

  // ── Livraison, ouvertures, clics, rebonds — depuis le journal brut ────────
  const resendIds = [...automationByResendId.keys()]
  const EVENT_TYPES = ['email.delivered', 'email.opened', 'email.clicked', 'email.bounced'] as const
  const seenPerAutomation = new Map<string, Set<string>>() // `${automationId}:${type}` -> resend_ids déjà comptés
  const markOnce = (automationId: string, type: string, resendId: string): boolean => {
    const key = `${automationId}:${type}`
    let seen = seenPerAutomation.get(key)
    if (!seen) {
      seen = new Set()
      seenPerAutomation.set(key, seen)
    }
    if (seen.has(resendId)) return false
    seen.add(resendId)
    return true
  }

  for (const batch of chunk(resendIds, 300)) {
    const { data, error } = await sb
      .from('email_events')
      .select('resend_id,type,bounce_type')
      .in('resend_id', batch)
      .in('type', EVENT_TYPES as unknown as string[])
    if (error) {
      if (isMissingTable(error)) gaps.push('email_events')
      continue
    }
    for (const ev of (data ?? []) as { resend_id: string | null; type: string; bounce_type: string | null }[]) {
      if (!ev.resend_id) continue
      const automationId = automationByResendId.get(ev.resend_id)
      if (!automationId) continue
      const row = rowsById.get(automationId)
      if (!row) continue
      if (!markOnce(automationId, ev.type, ev.resend_id)) continue
      if (ev.type === 'email.delivered') row.delivered++
      else if (ev.type === 'email.opened') row.opened++
      else if (ev.type === 'email.clicked') row.clicked++
      else if (ev.type === 'email.bounced') {
        if (ev.bounce_type === 'hard') row.bouncedHard++
        else row.bouncedSoft++
      }
    }
  }

  // ── Taux ───────────────────────────────────────────────────────────────
  const rows = sequences.map((seq) => rowsById.get(seq.id)!)
  for (const row of rows) {
    const openBase = row.delivered > 0 ? row.delivered : row.sent
    row.openRate = rate(row.opened, openBase)
    row.clickRate = rate(row.clicked, openBase)
    row.bounceRate = rate(row.bouncedHard + row.bouncedSoft, row.sent)
    row.replyRate = rate(row.repliedCount, row.enrollmentsTotal)
    row.firstTouchReplyRate = rate(row.firstTouchRepliedCount, row.enrollmentsTotal)
    row.rdvRate = rate(row.rdvCount, row.enrollmentsTotal)
    row.rdvFromReplyRate = rate(row.rdvCount, row.repliedCount)
  }

  const totals = rows.reduce<SequenceStatsRow>(
    (acc, r) => {
      acc.enrollmentsTotal += r.enrollmentsTotal
      acc.enrollmentsActive += r.enrollmentsActive
      acc.sent += r.sent
      acc.delivered += r.delivered
      acc.opened += r.opened
      acc.clicked += r.clicked
      acc.bouncedHard += r.bouncedHard
      acc.bouncedSoft += r.bouncedSoft
      acc.repliedCount += r.repliedCount
      acc.firstTouchRepliedCount += r.firstTouchRepliedCount
      acc.rdvCount += r.rdvCount
      return acc
    },
    emptyRow({ id: '', name: '', status: 'draft', emailSteps: 0 }),
  )
  const totalOpenBase = totals.delivered > 0 ? totals.delivered : totals.sent
  totals.openRate = rate(totals.opened, totalOpenBase)
  totals.clickRate = rate(totals.clicked, totalOpenBase)
  totals.bounceRate = rate(totals.bouncedHard + totals.bouncedSoft, totals.sent)
  totals.replyRate = rate(totals.repliedCount, totals.enrollmentsTotal)
  totals.firstTouchReplyRate = rate(totals.firstTouchRepliedCount, totals.enrollmentsTotal)
  totals.rdvRate = rate(totals.rdvCount, totals.enrollmentsTotal)
  totals.rdvFromReplyRate = rate(totals.rdvCount, totals.repliedCount)

  return { generatedAt: new Date().toISOString(), since: sinceIso, rows, totals, gaps: [...new Set(gaps)] }
}
