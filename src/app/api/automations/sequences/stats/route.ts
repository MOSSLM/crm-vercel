// /api/automations/sequences/stats — rapport de performance des séquences.
//
// GET ?days=90 : envoyés / ouvertures / clics / rebonds (depuis `email_events`,
// le journal brut — cf. `_view.ts` pour pourquoi pas `email_logs.delivery_status`),
// réponses et RDV (depuis `sales_pipeline_state`, au niveau de l'opportunité).
// Sans `days`, la période est illimitée.
import { json, jsonError } from '@/app/api/_lib/respond'
import { withAuth } from '@/app/api/_lib/with-auth'
import { preflight } from '@/app/api/_lib/cors'
import { buildSequenceStatsView } from './_view'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const OPTIONS = (req: Request) => preflight(req)

export const GET = withAuth({ role: 'admin' }, async ({ req, cors }) => {
  const url = new URL(req.url)
  const daysParam = url.searchParams.get('days')
  const days = daysParam != null ? Number(daysParam) : null
  if (daysParam != null && (!Number.isFinite(days) || (days as number) <= 0)) {
    return jsonError('parametre_days_invalide', 400, { message: '« days » doit être un entier positif.' }, cors)
  }
  const view = await buildSequenceStatsView({ sinceDays: days })
  return json(view, { headers: cors })
})
