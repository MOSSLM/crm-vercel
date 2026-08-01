// POST /api/sales-pipeline/enroll — mettre un lot de prospects en séquence.
import { withAuth } from '@/app/api/_lib/with-auth'
import { preflight } from '@/app/api/_lib/cors'
import { salesEnrollSchema, type SalesEnrollPayload } from '@/app/api/_lib/schemas'
import { handleEnroll } from '../_handlers'

export const runtime = 'nodejs'
export const OPTIONS = (req: Request) => preflight(req)

export const POST = withAuth<SalesEnrollPayload>(
  { role: 'admin', body: salesEnrollSchema },
  ({ body, user, cors }) => handleEnroll(body, { ownerId: null, userId: user.id }, cors),
)
