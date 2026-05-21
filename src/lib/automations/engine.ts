// engine.ts — moteur d'exécution des automatisations (workflows + séquences).
// Exécuté côté serveur uniquement (service-role Supabase).
import { Resend } from 'resend'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { asWorkflow, findNode, getSlotChild, isCondType } from '@/components/automations/workflow-graph'
import type {
  Automation,
  WorkflowNode,
  SequenceDefinition,
  SequenceStep,
  SequenceEnrollment,
  TraceEntry,
} from '@/components/automations/types'

export interface RunContext {
  opportunite_id?: string | null
  contact_id?: string | null
  entreprise_id?: number | null
  pipeline_id?: string | null
  stage_id?: number | null
  from_stage_id?: number | null
  event?: string
}

type VarBag = Record<string, string>
type ResolvedEntities = {
  contactId: string | null
  entrepriseId: number | null
  contactEmail: string | null
  contactName: string | null
  contactPhone: string | null
  contactLinkedin: string | null
  vars: VarBag
}

// ── Résolution des entités + variables ─────────────────────────────────────
async function resolveEntities(sb: SupabaseClient, ctx: RunContext): Promise<ResolvedEntities> {
  let contactId = ctx.contact_id ?? null
  let entrepriseId = ctx.entreprise_id ?? null

  if (ctx.opportunite_id && (!contactId || !entrepriseId)) {
    const { data: opp } = await sb
      .from('opportunites')
      .select('contact_id,entreprise_id')
      .eq('id', ctx.opportunite_id)
      .maybeSingle()
    contactId = contactId ?? (opp?.contact_id ?? null)
    entrepriseId = entrepriseId ?? (opp?.entreprise_id ?? null)
  }

  const vars: VarBag = {}
  let contactEmail: string | null = null
  let contactName: string | null = null
  let contactPhone: string | null = null
  let contactLinkedin: string | null = null

  if (contactId) {
    const { data: c } = await sb
      .from('contacts')
      .select('first_name,last_name,email,tel,role_title,linkedin_url')
      .eq('id', contactId)
      .maybeSingle()
    if (c) {
      vars['contact.first_name'] = c.first_name ?? ''
      vars['contact.last_name'] = c.last_name ?? ''
      vars['contact.role'] = c.role_title ?? ''
      contactEmail = c.email ?? null
      contactName = `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || null
      contactPhone = c.tel ?? null
      contactLinkedin = c.linkedin_url ?? null
    }
  }
  if (entrepriseId) {
    const { data: e } = await sb
      .from('entreprises')
      .select('name,ville,site_web_canonique')
      .eq('id', entrepriseId)
      .maybeSingle()
    if (e) {
      vars['company.name'] = e.name ?? ''
      vars['company.city'] = e.ville ?? ''
      vars['company.website'] = e.site_web_canonique ?? ''
    }
  }
  return { contactId, entrepriseId, contactEmail, contactName, contactPhone, contactLinkedin, vars }
}

export function interpolate(text: string | null | undefined, vars: VarBag): string {
  return (text ?? '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k: string) => vars[k] ?? '')
}

function htmlify(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, '<br/>')}</p>`)
    .join('')
}

// ── Envoi d'email (Resend) ─────────────────────────────────────────────────
export async function sendEngineEmail(
  sb: SupabaseClient,
  opts: {
    to: string
    toName?: string | null
    subject: string
    html: string
    text?: string
    contactId?: string | null
    entrepriseId?: number | null
    opportuniteId?: string | null
    type?: string
  },
): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY non configuré' }

  let fromEmail = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev'
  try {
    const { data: conn } = await sb.from('automation_connections').select('config').eq('id', 'resend').maybeSingle()
    const cfg = (conn?.config ?? {}) as Record<string, string>
    if (cfg.from_email) fromEmail = cfg.from_email
  } catch {
    /* utilise l'env */
  }

  const resend = new Resend(apiKey)
  let status: 'sent' | 'failed' = 'sent'
  let errorMessage: string | undefined
  let resendId: string | undefined

  try {
    const result = await resend.emails.send({
      from: fromEmail,
      to: opts.toName ? `${opts.toName} <${opts.to}>` : opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    })
    if (result.error) {
      status = 'failed'
      errorMessage = result.error.message
    } else {
      resendId = result.data?.id
    }
  } catch (err) {
    status = 'failed'
    errorMessage = err instanceof Error ? err.message : 'Erreur inconnue'
  }

  try {
    await sb.from('email_logs').insert({
      resend_id: resendId ?? null,
      contact_id: opts.contactId ?? null,
      entreprise_id: opts.entrepriseId ?? null,
      opportunite_id: opts.opportuniteId ?? null,
      to_email: opts.to,
      to_name: opts.toName ?? null,
      from_email: fromEmail,
      subject: opts.subject,
      body_html: opts.html,
      body_text: opts.text ?? null,
      type: opts.type ?? 'automation',
      status,
      error_message: errorMessage ?? null,
    })
  } catch {
    /* le log ne doit pas bloquer */
  }

  return status === 'sent' ? { ok: true } : { ok: false, error: errorMessage }
}

// ── Exécution d'une action de workflow ─────────────────────────────────────
async function executeAction(
  sb: SupabaseClient,
  node: WorkflowNode,
  ctx: RunContext,
  ent: ResolvedEntities,
  automationId: string,
): Promise<TraceEntry> {
  const at = new Date().toISOString()
  const cfg = node.config
  const base = { node_id: node.id, type: node.type, at }

  try {
    switch (node.type) {
      case 'act.send_email': {
        if (!ent.contactEmail) return { ...base, status: 'skipped', message: 'Aucun email destinataire' }
        const { data: tpl } = await sb
          .from('email_templates')
          .select('subject,body')
          .eq('id', cfg.template as string)
          .maybeSingle()
        if (!tpl) return { ...base, status: 'error', message: 'Template introuvable' }
        const subject = interpolate(tpl.subject, ent.vars)
        const text = interpolate(tpl.body, ent.vars)
        const r = await sendEngineEmail(sb, {
          to: ent.contactEmail,
          toName: ent.contactName,
          subject,
          html: htmlify(text),
          text,
          contactId: ent.contactId,
          entrepriseId: ent.entrepriseId,
          opportuniteId: ctx.opportunite_id ?? null,
          type: 'workflow',
        })
        return r.ok
          ? { ...base, status: 'ok', message: `Email envoyé à ${ent.contactEmail}` }
          : { ...base, status: 'error', message: r.error }
      }
      case 'act.move_stage': {
        if (!ctx.opportunite_id) return { ...base, status: 'skipped', message: 'Pas d’opportunité' }
        await sb.from('opportunites').update({ stage_id: Number(cfg.stage) }).eq('id', ctx.opportunite_id)
        return { ...base, status: 'ok', message: 'Opportunité déplacée' }
      }
      case 'act.add_tag': {
        if (!ctx.opportunite_id) return { ...base, status: 'skipped' }
        const { data: tag } = await sb.from('crm_tags').select('name').eq('id', cfg.tag as string).maybeSingle()
        const { data: opp } = await sb.from('opportunites').select('tags').eq('id', ctx.opportunite_id).maybeSingle()
        const existing = (opp?.tags ?? '').split(',').map((t: string) => t.trim()).filter(Boolean)
        if (tag?.name && !existing.includes(tag.name)) existing.push(tag.name)
        await sb.from('opportunites').update({ tags: existing.join(', ') }).eq('id', ctx.opportunite_id)
        return { ...base, status: 'ok', message: `Tag « ${tag?.name ?? ''} » ajouté` }
      }
      case 'act.create_task': {
        await sb.from('opportunite_tasks').insert({
          opportunite_id: ctx.opportunite_id ?? null,
          entreprise_id: ent.entrepriseId ?? null,
          titre: interpolate((cfg.title as string) || node.title, ent.vars),
          type: (cfg.task_type as string) ?? 'tt_admin',
          statut: 'todo',
          due_date: new Date(Date.now() + Number(cfg.due_days ?? 2) * 86400000).toISOString(),
          workflow_id: automationId,
        })
        return { ...base, status: 'ok', message: 'Tâche créée' }
      }
      case 'act.notify': {
        const { data: conn } = await sb
          .from('automation_connections')
          .select('config,status')
          .eq('id', 'slack')
          .maybeSingle()
        const url = (conn?.config as Record<string, string>)?.webhook_url
        if (!url || conn?.status !== 'on')
          return { ...base, status: 'skipped', message: 'Slack non configuré' }
        await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text: interpolate((cfg.message as string) || node.title, ent.vars) }),
        })
        return { ...base, status: 'ok', message: 'Notification Slack envoyée' }
      }
      case 'act.webhook': {
        const url = cfg.url as string
        if (!url) return { ...base, status: 'skipped', message: 'URL manquante' }
        await fetch(url, {
          method: (cfg.method as string) || 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ event: ctx.event, context: ctx }),
        })
        return { ...base, status: 'ok', message: 'Webhook appelé' }
      }
      case 'act.assign_owner':
        return { ...base, status: 'ok', message: 'Attribution enregistrée (suivi équipe)' }
      case 'act.ai_score':
        return { ...base, status: 'ok', message: 'Score IA — étape journalisée' }
      case 'act.task_call':
      case 'act.task_whatsapp':
      case 'act.task_linkedin': {
        const kind = node.type === 'act.task_call' ? 'call' : node.type === 'act.task_whatsapp' ? 'whatsapp' : 'linkedin'
        let message = ''
        if (kind === 'whatsapp' && cfg.template) {
          const { data: wt } = await sb.from('whatsapp_templates').select('body').eq('id', cfg.template as string).maybeSingle()
          message = interpolate(wt?.body, ent.vars)
        } else if (kind === 'linkedin') {
          message = interpolate(cfg.message as string, ent.vars)
        }
        let scriptName: string | undefined
        if (kind === 'call' && cfg.script) {
          const { data: sc } = await sb.from('call_scripts').select('name,body').eq('id', cfg.script as string).maybeSingle()
          scriptName = sc?.name
          message = sc?.body ?? ''
        }
        await sb.from('prospection_tasks').insert({
          kind,
          contact_id: ent.contactId,
          entreprise_id: ent.entrepriseId,
          opportunite_id: ctx.opportunite_id ?? null,
          automation_id: automationId,
          title: node.title,
          payload: { message, script: message, scriptName, phone: ent.contactPhone, linkedin: ent.contactLinkedin },
        })
        return { ...base, status: 'ok', message: `Tâche ${kind} ajoutée au démarchage` }
      }
      default:
        return { ...base, status: 'skipped', message: 'Action non implémentée' }
    }
  } catch (err) {
    return { ...base, status: 'error', message: err instanceof Error ? err.message : 'Erreur' }
  }
}

// ── Évaluation d'une condition ─────────────────────────────────────────────
async function evalCondition(sb: SupabaseClient, node: WorkflowNode, ctx: RunContext): Promise<boolean> {
  if (node.type === 'cnd.if_tag') {
    if (!ctx.opportunite_id) return false
    const { data: tag } = await sb.from('crm_tags').select('name').eq('id', node.config.tag as string).maybeSingle()
    const { data: opp } = await sb.from('opportunites').select('tags').eq('id', ctx.opportunite_id).maybeSingle()
    return !!tag?.name && (opp?.tags ?? '').includes(tag.name)
  }
  // cnd.if_field
  if (!ctx.opportunite_id) return false
  const field = node.config.field as string
  const op = (node.config.op as string) || 'eq'
  const raw = node.config.value
  if (!field) return false
  const { data: opp } = await sb.from('opportunites').select('*').eq('id', ctx.opportunite_id).maybeSingle()
  const actual = (opp as Record<string, unknown> | null)?.[field]
  const numA = Number(actual)
  const numB = Number(raw)
  const bothNum = !Number.isNaN(numA) && !Number.isNaN(numB)
  switch (op) {
    case 'eq': return String(actual) === String(raw)
    case 'neq': return String(actual) !== String(raw)
    case 'gt': return bothNum && numA > numB
    case 'gte': return bothNum && numA >= numB
    case 'lt': return bothNum && numA < numB
    case 'lte': return bothNum && numA <= numB
    case 'contains': return String(actual ?? '').toLowerCase().includes(String(raw ?? '').toLowerCase())
    case 'isset': return actual != null && actual !== ''
    case 'isnotset': return actual == null || actual === ''
    default: return false
  }
}

function waitMs(cfg: Record<string, unknown>): number {
  const amount = Number(cfg.amount ?? 1)
  const unit = (cfg.unit as string) || 'd'
  const mult = unit === 'm' ? 60000 : unit === 'h' ? 3600000 : 86400000
  return Math.max(0, amount) * mult
}

// ── Exécution d'un workflow ────────────────────────────────────────────────
export async function runWorkflowAutomation(
  automation: Automation,
  ctx: RunContext,
  opts: { isTest?: boolean; runId?: string; startNodeId?: string | null } = {},
): Promise<{ runId: string }> {
  const sb = getServiceClient()
  const def = asWorkflow(automation.definition)
  const ent = await resolveEntities(sb, ctx)

  let runId = opts.runId
  let trace: TraceEntry[] = []
  if (!runId) {
    const { data: run } = await sb
      .from('automation_runs')
      .insert({
        automation_id: automation.id,
        status: 'running',
        trigger_type: automation.trigger_type,
        context: ctx as Record<string, unknown>,
        is_test: !!opts.isTest,
      })
      .select('id')
      .single()
    runId = run!.id as string
  } else {
    const { data: run } = await sb.from('automation_runs').select('trace').eq('id', runId).maybeSingle()
    trace = (run?.trace as TraceEntry[]) ?? []
  }

  let nodeId: string | null = opts.startNodeId ?? def.layout.root
  let guard = 0
  let finalStatus: 'success' | 'error' = 'success'

  while (nodeId && guard++ < 60) {
    const node = findNode(def, nodeId)
    if (!node) break

    if (node.cat === 'trigger') {
      nodeId = getSlotChild(def, nodeId, 'next')
      continue
    }
    if (node.type === 'flow.exit') break

    if (isCondType(node.type)) {
      const result = await evalCondition(sb, node, ctx)
      trace.push({ node_id: node.id, type: node.type, status: 'ok', message: result ? 'OUI' : 'NON', at: new Date().toISOString() })
      nodeId = getSlotChild(def, nodeId, result ? 'yes' : 'no')
      continue
    }

    if (node.type === 'flow.wait') {
      const nextId = getSlotChild(def, nodeId, 'next')
      if (nextId) {
        await sb.from('automation_jobs').insert({
          automation_id: automation.id,
          run_id: runId,
          job_type: 'workflow_node',
          payload: { node_id: nextId, context: ctx },
          run_at: new Date(Date.now() + waitMs(node.config)).toISOString(),
        })
      }
      trace.push({ node_id: node.id, type: node.type, status: 'ok', message: 'En attente', at: new Date().toISOString() })
      await sb.from('automation_runs').update({ trace }).eq('id', runId)
      return { runId } // la suite reprendra via le ticker
    }

    const entry = await executeAction(sb, node, ctx, ent, automation.id)
    trace.push(entry)
    if (entry.status === 'error') finalStatus = 'error'
    nodeId = getSlotChild(def, nodeId, 'next')
  }

  await sb.from('automation_runs').update({ status: finalStatus, trace, finished_at: new Date().toISOString() }).eq('id', runId)
  await sb
    .from('automations')
    .update({ runs_7d: (automation.runs_7d ?? 0) + 1, last_run_at: new Date().toISOString() })
    .eq('id', automation.id)
  return { runId }
}

// ── Séquences : inscription + avancement ───────────────────────────────────
function stepIsManual(step: SequenceStep): boolean {
  return step.kind === 'call' || step.kind === 'whatsapp' || step.kind === 'linkedin' || step.kind === 'task'
}

export async function enrollInSequence(automation: Automation, ctx: RunContext): Promise<boolean> {
  const sb = getServiceClient()
  const ent = await resolveEntities(sb, ctx)
  if (!ent.contactId) return false
  // éviter les doublons actifs
  const { data: existing } = await sb
    .from('sequence_enrollments')
    .select('id')
    .eq('automation_id', automation.id)
    .eq('contact_id', ent.contactId)
    .in('status', ['active', 'paused'])
    .maybeSingle()
  if (existing) return false

  await sb.from('sequence_enrollments').insert({
    automation_id: automation.id,
    contact_id: ent.contactId,
    opportunite_id: ctx.opportunite_id ?? null,
    entreprise_id: ent.entrepriseId,
    current_step: 0,
    status: 'active',
    next_run_at: new Date().toISOString(),
    vars: ent.vars,
  })
  return true
}

export async function processSequenceEnrollment(enrollment: SequenceEnrollment): Promise<void> {
  const sb = getServiceClient()
  const { data: autoRow } = await sb.from('automations').select('*').eq('id', enrollment.automation_id).maybeSingle()
  const automation = autoRow as Automation | null
  if (!automation || automation.status !== 'on') {
    await sb.from('sequence_enrollments').update({ next_run_at: null }).eq('id', enrollment.id)
    return
  }
  const def = (automation.definition as SequenceDefinition) || { steps: [] }
  const steps = Array.isArray(def.steps) ? def.steps : []
  const idx = enrollment.current_step

  if (idx >= steps.length) {
    await sb
      .from('sequence_enrollments')
      .update({ status: 'finished', next_run_at: null, finished_at: new Date().toISOString() })
      .eq('id', enrollment.id)
    return
  }

  const step = steps[idx]
  const ctx: RunContext = {
    contact_id: enrollment.contact_id,
    opportunite_id: enrollment.opportunite_id,
    entreprise_id: enrollment.entreprise_id,
  }
  const ent = await resolveEntities(sb, ctx)

  if (step.kind === 'email') {
    if (ent.contactEmail && step.template) {
      const { data: tpl } = await sb.from('email_templates').select('subject,body').eq('id', step.template).maybeSingle()
      if (tpl) {
        const text = interpolate(tpl.body, ent.vars)
        await sendEngineEmail(sb, {
          to: ent.contactEmail,
          toName: ent.contactName,
          subject: interpolate(tpl.subject, ent.vars),
          html: htmlify(text),
          text,
          contactId: ent.contactId,
          entrepriseId: ent.entrepriseId,
          opportuniteId: enrollment.opportunite_id,
          type: 'sequence',
        })
      }
    }
    await scheduleNextStep(sb, enrollment, steps, idx + 1)
  } else if (step.kind === 'wait') {
    await scheduleNextStep(sb, enrollment, steps, idx + 1)
  } else if (stepIsManual(step)) {
    let message = interpolate(step.message, ent.vars)
    let scriptName: string | undefined
    if (step.kind === 'whatsapp' && step.template) {
      const { data: wt } = await sb.from('whatsapp_templates').select('body').eq('id', step.template).maybeSingle()
      message = interpolate(wt?.body, ent.vars)
    }
    if (step.kind === 'call' && step.script) {
      const { data: sc } = await sb.from('call_scripts').select('name,body').eq('id', step.script).maybeSingle()
      scriptName = sc?.name
      message = sc?.body ?? message
    }
    await sb.from('prospection_tasks').insert({
      kind: step.kind === 'task' ? 'linkedin' : step.kind,
      contact_id: ent.contactId,
      entreprise_id: ent.entrepriseId,
      opportunite_id: enrollment.opportunite_id,
      automation_id: automation.id,
      enrollment_id: enrollment.id,
      step_id: step.id,
      title: `${automation.name} — étape ${idx + 1}`,
      payload: { message, script: message, scriptName, phone: ent.contactPhone, linkedin: ent.contactLinkedin },
    })
    // l'inscription se met en pause jusqu'à la complétion de la tâche
    await sb.from('sequence_enrollments').update({ next_run_at: null }).eq('id', enrollment.id)
  } else {
    await scheduleNextStep(sb, enrollment, steps, idx + 1)
  }
}

async function scheduleNextStep(
  sb: SupabaseClient,
  enrollment: SequenceEnrollment,
  steps: SequenceStep[],
  nextIdx: number,
): Promise<void> {
  if (nextIdx >= steps.length) {
    await sb
      .from('sequence_enrollments')
      .update({ current_step: nextIdx, status: 'finished', next_run_at: null, finished_at: new Date().toISOString() })
      .eq('id', enrollment.id)
    return
  }
  const next = steps[nextIdx]
  const entered = new Date(enrollment.entered_at).getTime()
  let runAt = entered + (next.day ?? 0) * 86400000
  if (runAt < Date.now()) runAt = Date.now()
  await sb
    .from('sequence_enrollments')
    .update({ current_step: nextIdx, next_run_at: new Date(runAt).toISOString() })
    .eq('id', enrollment.id)
}

/** Appelé quand une tâche de démarchage liée à une séquence est complétée. */
export async function advanceEnrollmentAfterTask(enrollmentId: string): Promise<void> {
  const sb = getServiceClient()
  const { data: enr } = await sb.from('sequence_enrollments').select('*').eq('id', enrollmentId).maybeSingle()
  const enrollment = enr as SequenceEnrollment | null
  if (!enrollment || enrollment.status !== 'active') return
  const { data: autoRow } = await sb.from('automations').select('definition').eq('id', enrollment.automation_id).maybeSingle()
  const def = (autoRow?.definition as SequenceDefinition) || { steps: [] }
  const steps = Array.isArray(def.steps) ? def.steps : []
  await scheduleNextStep(sb, enrollment, steps, enrollment.current_step + 1)
}
