// POST /api/sales-pipeline/react — « le prospect a réagi », vue admin.
// Cinq issues, et dans tous les cas l'annulation des envois encore planifiés.
import { withAuth } from '@/app/api/_lib/with-auth'
import { preflight } from '@/app/api/_lib/cors'
import { salesReactionSchema, type SalesReactionPayload } from '@/app/api/_lib/schemas'
import { handleReaction } from '../_handlers'

export const runtime = 'nodejs'
export const OPTIONS = (req: Request) => preflight(req)

export const POST = withAuth<SalesReactionPayload>(
  { role: 'admin', body: salesReactionSchema },
  ({ body, user, cors }) => handleReaction(body, { ownerId: null, userId: user.id }, cors),
)
