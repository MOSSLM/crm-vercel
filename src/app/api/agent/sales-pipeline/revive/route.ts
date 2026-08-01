// POST /api/agent/sales-pipeline/revive — rouvrir une étape, côté agent.
import { withAuth } from '@/app/api/_lib/with-auth'
import { preflight } from '@/app/api/_lib/cors'
import { salesReviveSchema, type SalesRevivePayload } from '@/app/api/_lib/schemas'
import { handleRevive } from '@/app/api/sales-pipeline/_handlers'

export const runtime = 'nodejs'
export const OPTIONS = (req: Request) => preflight(req)

export const POST = withAuth<SalesRevivePayload>(
  { role: 'freelance', body: salesReviveSchema },
  ({ body, user, cors }) => handleRevive(body, { ownerId: user.id, userId: user.id }, cors),
)
