// /api/automations/tick — ticker triggered by Vercel cron OR pg_cron.
// Processes the automation_jobs queue + due sequence enrollments.
//
// Les étapes de séquence ne partent plus « dès que next_run_at est passé » :
// les emails passent par LE RÉGULATEUR (une seule file pour tout le CRM, écart
// aléatoire, plages horaires, plafond quotidien, espacement même entreprise).
// Le ticker se contente d'exécuter ce que le régulateur a décidé pour cette
// minute, et d'écrire dans la base l'heure retenue pour tous les autres — c'est
// ce qui permet à l'interface d'afficher un compte à rebours et un motif.
import { json } from '@/app/api/_lib/respond'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { dispatchEvent } from '@/lib/automations/dispatch'
import { runWorkflowAutomation, processSequenceEnrollment, holdForMissingEmail } from '@/lib/automations/engine'
import {
  buildQueueItems,
  loadDueEnrollments,
  loadRegulatorSettings,
  loadSendHistory,
  planFromContext,
} from '@/lib/automations/regulator-db'
import type { Automation, AutomationJob, SequenceEnrollment } from '@/components/automations/types'
import type { RunContext as EngineContext } from '@/lib/automations/engine'

export const runtime = 'nodejs'
export const maxDuration = 60

/** After this many failed attempts the job is terminal (status='error'). */
const MAX_ATTEMPTS = 3

/**
 * Combien d'emails de séquence au maximum sur un même tick. Le régulateur
 * espace déjà les départs de plusieurs minutes : en pratique un seul est dû par
 * minute. La borne protège d'un rattrapage massif après une longue coupure.
 */
const MAX_SENDS_PER_TICK = 5

/**
 * Verifies the tick request:
 *   - prod: at least one of CRON_SECRET / PG_CRON_SECRET MUST be set AND match → fail-closed
 *   - dev/test: when neither secret is configured, allow (local cron testing)
 */
const verifyTick = (req: Request): boolean => {
  const cronSecret = process.env.CRON_SECRET
  const pgCronSecret = process.env.PG_CRON_SECRET

  if (process.env.NODE_ENV === 'production' && !cronSecret && !pgCronSecret) {
    return false
  }

  if (!cronSecret && !pgCronSecret) return true

  const auth = req.headers.get('authorization')
  const pgHeader = req.headers.get('x-pg-cron-secret')
  const validVercel = !!cronSecret && auth === `Bearer ${cronSecret}`
  const validPgCron = !!pgCronSecret && pgHeader === pgCronSecret
  return validVercel || validPgCron
}

async function handle(req: Request): Promise<Response> {
  if (!verifyTick(req)) return json({ error: 'Unauthorized' }, { status: 401 })

  const sb = getServiceClient()
  const now = new Date().toISOString()
  const result = {
    events: 0,
    workflowJobs: 0,
    sequenceSteps: 0,
    emailsSent: 0,
    emailsQueued: 0,
    emailsBlocked: 0,
    emailsNoAddress: 0,
    errors: 0,
  }

  // 1. Événements CRM en attente
  const { data: eventJobs } = await sb
    .from('automation_jobs')
    .select('*')
    .eq('job_type', 'scheduled_trigger')
    .eq('status', 'pending')
    .lte('run_at', now)
    .limit(50)
  for (const job of (eventJobs ?? []) as AutomationJob[]) {
    await sb.from('automation_jobs').update({ status: 'processing' }).eq('id', job.id)
    try {
      await dispatchEvent(job.payload)
      await sb.from('automation_jobs').update({ status: 'done' }).eq('id', job.id)
      result.events++
    } catch (e) {
      result.errors++
      const nextAttempts = (job.attempts ?? 0) + 1
      const terminal = nextAttempts >= MAX_ATTEMPTS
      await sb
        .from('automation_jobs')
        .update({
          status: terminal ? 'error' : 'pending',
          attempts: nextAttempts,
          last_error: String(e),
        })
        .eq('id', job.id)
    }
  }

  // 2. Reprise de workflows après un délai
  const { data: wfJobs } = await sb
    .from('automation_jobs')
    .select('*')
    .eq('job_type', 'workflow_node')
    .eq('status', 'pending')
    .lte('run_at', now)
    .limit(50)
  for (const job of (wfJobs ?? []) as AutomationJob[]) {
    await sb.from('automation_jobs').update({ status: 'processing' }).eq('id', job.id)
    try {
      const { data: auto } = await sb.from('automations').select('*').eq('id', job.automation_id).maybeSingle()
      if (auto) {
        const payload = job.payload as { node_id: string; context: EngineContext }
        await runWorkflowAutomation(auto as Automation, payload.context, {
          runId: job.run_id ?? undefined,
          startNodeId: payload.node_id,
        })
      }
      await sb.from('automation_jobs').update({ status: 'done' }).eq('id', job.id)
      result.workflowJobs++
    } catch (e) {
      result.errors++
      const nextAttempts = (job.attempts ?? 0) + 1
      const terminal = nextAttempts >= MAX_ATTEMPTS
      await sb
        .from('automation_jobs')
        .update({
          status: terminal ? 'error' : 'pending',
          attempts: nextAttempts,
          last_error: String(e),
        })
        .eq('id', job.id)
    }
  }

  // 3. Étapes de séquence dues
  const nowMs = Date.parse(now)
  const settings = await loadRegulatorSettings(sb)
  const { emails, noEmail, others } = await loadDueEnrollments(sb, nowMs)

  // 3a. Les étapes non-email (WhatsApp, appel, LinkedIn, attente) ne passent pas
  //     par la file : elles créent une tâche ou avancent le pointeur tout de suite.
  for (const { enrollment } of others) {
    try {
      await processSequenceEnrollment(enrollment)
      result.sequenceSteps++
    } catch {
      result.errors++
    }
  }

  // 3a bis. Étape email sans destinataire : on ne prépare aucun envoi et la
  //         séquence n'avance pas. Le motif est écrit dans l'inscription pour
  //         que le pipeline commercial affiche le drapeau « sans email ».
  for (const { enrollment } of noEmail) {
    try {
      await holdForMissingEmail(sb, enrollment.id)
      result.emailsNoAddress++
    } catch {
      result.errors++
    }
  }

  // 3b. Les emails passent par le régulateur.
  if (emails.length > 0) {
    const history = await loadSendHistory(sb, settings, nowMs)
    const ctx = { settings, history, now: nowMs }
    const plan = planFromContext(buildQueueItems(emails, ctx), ctx)
    const byId = new Map(emails.map((e) => [e.enrollment.id, e.enrollment]))

    let sent = 0
    for (const slot of plan) {
      const enrollment = byId.get(slot.id) as SequenceEnrollment | undefined
      if (!enrollment) continue

      // Bloqué (pause, plafond, séquence arrêtée) : on garde la trace du motif et
      // on repassera au tick suivant. Rien n'est perdu.
      if (slot.at == null) {
        result.emailsBlocked++
        await sb
          .from('sequence_enrollments')
          .update({ send_at: null, hold_reason: slot.reason })
          .eq('id', enrollment.id)
        continue
      }

      // L'heure retenue n'est pas encore là : on l'inscrit pour que l'interface
      // affiche le compte à rebours et le motif du report.
      if (slot.at > nowMs || sent >= MAX_SENDS_PER_TICK) {
        result.emailsQueued++
        await sb
          .from('sequence_enrollments')
          .update({ send_at: new Date(slot.at).toISOString(), hold_reason: slot.reason })
          .eq('id', enrollment.id)
        continue
      }

      try {
        await processSequenceEnrollment(enrollment)
        result.sequenceSteps++
        result.emailsSent++
        sent++
      } catch {
        result.errors++
      }
    }
  }

  return json({ ok: true, at: now, regulatorPaused: settings.paused, ...result })
}

export async function GET(req: Request) {
  return handle(req)
}
export async function POST(req: Request) {
  return handle(req)
}
