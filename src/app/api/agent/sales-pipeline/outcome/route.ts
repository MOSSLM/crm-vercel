// POST /api/agent/sales-pipeline/outcome — l'issue d'une étape, côté agent.
import { withAuth } from '@/app/api/_lib/with-auth'
import { preflight } from '@/app/api/_lib/cors'
import { salesOutcomeSchema, type SalesOutcomePayload } from '@/app/api/_lib/schemas'
import { handleOutcome } from '@/app/api/sales-pipeline/_handlers'

export const runtime = 'nodejs'
export const OPTIONS = (req: Request) => preflight(req)

export const POST = withAuth<SalesOutcomePayload>(
  { role: 'freelance', body: salesOutcomeSchema },
  ({ body, user, cors }) => handleOutcome(body, { ownerId: user.id, userId: user.id }, cors),
)
