import { preflight } from '@/app/api/_lib/cors'
import { json, jsonError } from '@/app/api/_lib/respond'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { withAuth } from '@/app/api/_lib/with-auth'
import { advanceEnrollmentAfterTask } from '@/lib/automations/engine'
import { journaliserGeste } from '@/lib/prospection/gestes-db'
import type { ProspectionTask } from '@/components/automations/types'

export const runtime = 'nodejs'
export const OPTIONS = (req: Request) => preflight(req)

type Params = { id: string }

export const POST = withAuth<undefined, Params>({}, async ({ req, params, user, cors }) => {
  const body = (await req.json().catch(() => ({}))) as { result?: string }

  const sb = getServiceClient()
  const { data: taskRow } = await sb.from('prospection_tasks').select('*').eq('id', params.id).maybeSingle()
  const task = taskRow as ProspectionTask | null
  if (!task) return jsonError('Tâche introuvable', 404, {}, cors)

  // La photo AVANT la première écriture — même raison qu'en tête de
  // `gestes-db.ts` : après, l'état d'origine n'existe plus nulle part.
  const gesteId = await journaliserGeste(sb, {
    geste: 'terminer',
    tacheId: params.id,
    faitPar: user.id,
  })

  await sb
    .from('prospection_tasks')
    .update({
      status: 'done',
      done_at: new Date().toISOString(),
      payload: { ...task.payload, ...(body.result ? { result: body.result } : {}) },
    })
    .eq('id', params.id)

  if (task.enrollment_id) {
    try {
      await advanceEnrollmentAfterTask(task.enrollment_id)
    } catch {
      /* la tâche reste complétée même si l'avancement échoue */
    }
  }

  return json({ ok: true, geste_id: gesteId }, { headers: cors })
})
