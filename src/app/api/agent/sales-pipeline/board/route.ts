// GET /api/agent/sales-pipeline/board — le tableau commercial de l'agent.
// Mêmes colonnes que la vue admin, mais uniquement ses prospects : le scoping
// se fait sur `opportunites.owner_id`, doublé par `entreprises.owner_id` dans
// les actions.
import { json, jsonError } from '@/app/api/_lib/respond'
import { withAuth } from '@/app/api/_lib/with-auth'
import { preflight } from '@/app/api/_lib/cors'
import { buildSalesBoard } from '@/app/api/sales-pipeline/_board'
import { parseBoardQuery } from '@/app/api/sales-pipeline/board/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const OPTIONS = (req: Request) => preflight(req)

export const GET = withAuth({ role: 'freelance' }, async ({ req, user, cors }) => {
  const result = await buildSalesBoard(parseBoardQuery(new URL(req.url), user.id))
  if (!result.ok) return jsonError(result.error, result.status, {}, cors)
  return json(result.data, { headers: cors })
})
