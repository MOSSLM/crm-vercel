// /api/automations/prospection/[id]/complete — complète une tâche de
// démarchage et fait avancer la séquence associée le cas échéant.
import { requireUser } from '@/app/api/_lib/auth'
import { corsHeadersFor, preflight } from '@/app/api/_lib/cors'
import { json, jsonError } from '@/app/api/_lib/respond'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { advanceEnrollmentAfterTask } from '@/lib/automations/engine'
import type { ProspectionTask } from '@/components/automations/types'

export const runtime = 'nodejs'
export const OPTIONS = (req: Request) => preflight(req)

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const cors = corsHeadersFor(req)
  const auth = await requireUser(req, cors)
  if (!auth.ok) return auth.response

  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as { result?: string }

  const sb = getServiceClient()
  const { data: taskRow } = await sb.from('prospection_tasks').select('*').eq('id', id).maybeSingle()
  const task = taskRow as ProspectionTask | null
  if (!task) return jsonError('Tâche introuvable', 404, {}, cors)

  await sb
    .from('prospection_tasks')
    .update({
      status: 'done',
      done_at: new Date().toISOString(),
      payload: { ...task.payload, ...(body.result ? { result: body.result } : {}) },
    })
    .eq('id', id)

  if (task.enrollment_id) {
    try {
      await advanceEnrollmentAfterTask(task.enrollment_id)
    } catch {
      /* la tâche reste complétée même si l'avancement échoue */
    }
  }

  return json({ ok: true }, { headers: cors })
}
