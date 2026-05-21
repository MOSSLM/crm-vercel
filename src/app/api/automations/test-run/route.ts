// /api/automations/test-run — exécute une automatisation en mode test.
import { requireUser } from '@/app/api/_lib/auth'
import { corsHeadersFor, preflight } from '@/app/api/_lib/cors'
import { json, jsonError } from '@/app/api/_lib/respond'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { runWorkflowAutomation, enrollInSequence, type RunContext } from '@/lib/automations/engine'
import type { Automation } from '@/components/automations/types'

export const runtime = 'nodejs'
export const OPTIONS = (req: Request) => preflight(req)

export async function POST(req: Request) {
  const cors = corsHeadersFor(req)
  const auth = await requireUser(req, cors)
  if (!auth.ok) return auth.response

  const body = (await req.json().catch(() => ({}))) as { automation_id?: string }
  if (!body.automation_id) return jsonError('automation_id requis', 400, {}, cors)

  const sb = getServiceClient()
  const { data: autoRow } = await sb.from('automations').select('*').eq('id', body.automation_id).maybeSingle()
  const auto = autoRow as Automation | null
  if (!auto) return jsonError('Automatisation introuvable', 404, {}, cors)

  // Construit un contexte de test à partir d'une opportunité de l'échantillon
  let ctx: RunContext = { event: 'test' }
  if (auto.trigger_pipeline_id) {
    let q = sb
      .from('opportunites')
      .select('id,contact_id,entreprise_id,pipeline_id,stage_id')
      .eq('pipeline_id', auto.trigger_pipeline_id)
    if (auto.trigger_stage_id != null) q = q.eq('stage_id', auto.trigger_stage_id)
    const { data: opp } = await q.limit(1).maybeSingle()
    if (opp) {
      ctx = {
        event: 'test',
        opportunite_id: opp.id,
        contact_id: opp.contact_id,
        entreprise_id: opp.entreprise_id,
        pipeline_id: opp.pipeline_id,
        stage_id: opp.stage_id,
      }
    }
  }

  try {
    if (auto.kind === 'sequence') {
      if (!ctx.contact_id) {
        return jsonError("Aucune opportunité d'échantillon pour tester cette séquence", 422, {}, cors)
      }
      const enrolled = await enrollInSequence(auto, ctx)
      return json(
        { ok: true, kind: 'sequence', enrolled, message: enrolled ? 'Contact inscrit à la séquence' : 'Déjà inscrit' },
        { headers: cors },
      )
    }
    const { runId } = await runWorkflowAutomation(auto, ctx, { isTest: true })
    return json({ ok: true, kind: 'workflow', run_id: runId }, { headers: cors })
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'Échec du test', 500, {}, cors)
  }
}
