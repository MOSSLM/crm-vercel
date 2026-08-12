// POST /api/sales-pipeline/outcome — l'issue d'une étape et ce que le prospect
// a dit, vue admin. La note rejoint le fil d'échanges de l'entreprise ; l'issue
// décide si la ligne continue ou s'arrête (et, si elle s'arrête, annule tout ce
// qui était encore planifié).
import { withAuth } from '@/app/api/_lib/with-auth'
import { preflight } from '@/app/api/_lib/cors'
import { salesOutcomeSchema, type SalesOutcomePayload } from '@/app/api/_lib/schemas'
import { handleOutcome } from '../_handlers'

export const runtime = 'nodejs'
export const OPTIONS = (req: Request) => preflight(req)

export const POST = withAuth<SalesOutcomePayload>(
  { role: 'admin', body: salesOutcomeSchema },
  ({ body, user, cors }) => handleOutcome(body, { ownerId: null, userId: user.id }, cors),
)
