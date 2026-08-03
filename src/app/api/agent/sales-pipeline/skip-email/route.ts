// POST /api/agent/sales-pipeline/skip-email — sauter l'étape email, côté agent.
import { withAuth } from '@/app/api/_lib/with-auth'
import { preflight } from '@/app/api/_lib/cors'
import { salesSkipEmailSchema, type SalesSkipEmailPayload } from '@/app/api/_lib/schemas'
import { handleSkipEmail } from '@/app/api/sales-pipeline/_handlers'

export const runtime = 'nodejs'
export const OPTIONS = (req: Request) => preflight(req)

export const POST = withAuth<SalesSkipEmailPayload>(
  { role: 'freelance', body: salesSkipEmailSchema },
  ({ body, user, cors }) => handleSkipEmail(body, { ownerId: user.id, userId: user.id }, cors),
)
