// POST /api/agent/sales-pipeline/email — saisie manuelle de l'adresse d'un
// prospect, côté agent (restreinte à ses propres prospects).
import { withAuth } from '@/app/api/_lib/with-auth'
import { preflight } from '@/app/api/_lib/cors'
import { salesSetEmailSchema, type SalesSetEmailPayload } from '@/app/api/_lib/schemas'
import { handleSetEmail } from '@/app/api/sales-pipeline/_handlers'

export const runtime = 'nodejs'
export const OPTIONS = (req: Request) => preflight(req)

export const POST = withAuth<SalesSetEmailPayload>(
  { role: 'freelance', body: salesSetEmailSchema },
  ({ body, user, cors }) => handleSetEmail(body, { ownerId: user.id, userId: user.id }, cors),
)
