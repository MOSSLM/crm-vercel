// POST /api/agent/sales-pipeline/react — « le prospect a réagi », côté agent.
import { withAuth } from '@/app/api/_lib/with-auth'
import { preflight } from '@/app/api/_lib/cors'
import { salesReactionSchema, type SalesReactionPayload } from '@/app/api/_lib/schemas'
import { handleReaction } from '@/app/api/sales-pipeline/_handlers'

export const runtime = 'nodejs'
export const OPTIONS = (req: Request) => preflight(req)

export const POST = withAuth<SalesReactionPayload>(
  { role: 'freelance', body: salesReactionSchema },
  ({ body, user, cors }) => handleReaction(body, { ownerId: user.id, userId: user.id }, cors),
)
