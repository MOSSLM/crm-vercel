// POST /api/agent/sales-pipeline/variant — épingler la version de message, côté agent.
import { withAuth } from '@/app/api/_lib/with-auth'
import { preflight } from '@/app/api/_lib/cors'
import { salesVariantSchema, type SalesVariantPayload } from '@/app/api/_lib/schemas'
import { handleVariant } from '@/app/api/sales-pipeline/_handlers'

export const runtime = 'nodejs'
export const OPTIONS = (req: Request) => preflight(req)

export const POST = withAuth<SalesVariantPayload>(
  { role: 'freelance', body: salesVariantSchema },
  ({ body, user, cors }) => handleVariant(body, { ownerId: user.id, userId: user.id }, cors),
)
