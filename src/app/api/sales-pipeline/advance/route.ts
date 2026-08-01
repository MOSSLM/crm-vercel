// POST /api/sales-pipeline/advance — valider l'étape en cours d'une ligne.
import { withAuth } from '@/app/api/_lib/with-auth'
import { preflight } from '@/app/api/_lib/cors'
import { salesAdvanceSchema, type SalesAdvancePayload } from '@/app/api/_lib/schemas'
import { handleAdvance } from '../_handlers'

export const runtime = 'nodejs'
export const OPTIONS = (req: Request) => preflight(req)

export const POST = withAuth<SalesAdvancePayload>(
  { role: 'admin', body: salesAdvanceSchema },
  ({ body, user, cors }) => handleAdvance(body, { ownerId: null, userId: user.id }, cors),
)
