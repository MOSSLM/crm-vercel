// GET /api/sales-pipeline/board — le tableau commercial, vue admin (tout le CRM).
// Le pendant agent est `/api/agent/sales-pipeline/board`, scopé à ses prospects.
// Les deux partagent `buildSalesBoard`.
import { json, jsonError } from '@/app/api/_lib/respond'
import { withAuth } from '@/app/api/_lib/with-auth'
import { preflight } from '@/app/api/_lib/cors'
import { buildSalesBoard, type SalesStatusFilter } from '../_board'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const OPTIONS = (req: Request) => preflight(req)

const STATUSES: SalesStatusFilter[] = ['actifs', 'rdv', 'won', 'closed', 'tous']

export function parseBoardQuery(url: URL, ownerId: string | null) {
  const status = url.searchParams.get('status') as SalesStatusFilter | null
  return {
    ownerId,
    q: url.searchParams.get('q') ?? undefined,
    view: url.searchParams.get('view') ?? undefined,
    status: status && STATUSES.includes(status) ? status : 'actifs',
    sequence: url.searchParams.get('sequence') ?? undefined,
    todoOnly: url.searchParams.get('todo') === '1',
    page: Number(url.searchParams.get('page') ?? 0) || 0,
    perPage: Number(url.searchParams.get('per_page') ?? 8) || 8,
  }
}

export const GET = withAuth({ role: 'admin' }, async ({ req, cors }) => {
  const result = await buildSalesBoard(parseBoardQuery(new URL(req.url), null))
  if (!result.ok) return jsonError(result.error, result.status, {}, cors)
  return json(result.data, { headers: cors })
})
