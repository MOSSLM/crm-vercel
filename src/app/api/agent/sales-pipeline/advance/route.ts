// POST /api/agent/sales-pipeline/advance — valider une étape, côté agent.
import { withAuth } from '@/app/api/_lib/with-auth'
import { preflight } from '@/app/api/_lib/cors'
import { salesAdvanceSchema, type SalesAdvancePayload } from '@/app/api/_lib/schemas'
import { handleAdvance } from '@/app/api/sales-pipeline/_handlers'

export const runtime = 'nodejs'
export const OPTIONS = (req: Request) => preflight(req)

export const POST = withAuth<SalesAdvancePayload>(
  { role: 'freelance', body: salesAdvanceSchema },
  ({ body, user, cors }) => handleAdvance(body, { ownerId: user.id, userId: user.id }, cors),
)
