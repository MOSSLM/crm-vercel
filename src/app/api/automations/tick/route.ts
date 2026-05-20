// /api/automations/tick — ticker traité par Vercel Cron (voir vercel.json).
// Traite la file automation_jobs + les inscriptions de séquence dues.
import { json } from '@/app/api/_lib/respond'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { dispatchEvent } from '@/lib/automations/dispatch'
import { runWorkflowAutomation, processSequenceEnrollment } from '@/lib/automations/engine'
import type { Automation, AutomationJob, SequenceEnrollment } from '@/components/automations/types'
import type { RunContext as EngineContext } from '@/lib/automations/engine'

export const runtime = 'nodejs'
export const maxDuration = 60

async function handle(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const sb = getServiceClient()
  const now = new Date().toISOString()
  const result = { events: 0, workflowJobs: 0, sequenceSteps: 0, errors: 0 }

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
      await sb
        .from('automation_jobs')
        .update({ status: 'error', last_error: String(e), attempts: job.attempts + 1 })
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
      await sb.from('automation_jobs').update({ status: 'error', last_error: String(e) }).eq('id', job.id)
    }
  }

  // 3. Étapes de séquence dues
  const { data: enrollments } = await sb
    .from('sequence_enrollments')
    .select('*')
    .eq('status', 'active')
    .not('next_run_at', 'is', null)
    .lte('next_run_at', now)
    .limit(50)
  for (const enr of (enrollments ?? []) as SequenceEnrollment[]) {
    try {
      await processSequenceEnrollment(enr)
      result.sequenceSteps++
    } catch {
      result.errors++
    }
  }

  return json({ ok: true, at: now, ...result })
}

export async function GET(req: Request) {
  return handle(req)
}
export async function POST(req: Request) {
  return handle(req)
}
