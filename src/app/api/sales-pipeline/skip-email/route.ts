// POST /api/sales-pipeline/skip-email — sauter l'étape email d'un prospect et
// enchaîner sur le canal suivant (WhatsApp en pratique).
import { withAuth } from '@/app/api/_lib/with-auth'
import { preflight } from '@/app/api/_lib/cors'
import { salesSkipEmailSchema, type SalesSkipEmailPayload } from '@/app/api/_lib/schemas'
import { handleSkipEmail } from '../_handlers'

export const runtime = 'nodejs'
export const OPTIONS = (req: Request) => preflight(req)

export const POST = withAuth<SalesSkipEmailPayload>(
  { role: 'admin', body: salesSkipEmailSchema },
  ({ body, user, cors }) => handleSkipEmail(body, { ownerId: null, userId: user.id }, cors),
)
