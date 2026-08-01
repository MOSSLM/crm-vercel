// POST /api/agent/sales-pipeline/enroll — mise en séquence, côté agent.
// La séquence doit lui avoir été attribuée par l'admin (vérifié dans le handler).
import { withAuth } from '@/app/api/_lib/with-auth'
import { preflight } from '@/app/api/_lib/cors'
import { salesEnrollSchema, type SalesEnrollPayload } from '@/app/api/_lib/schemas'
import { handleEnroll } from '@/app/api/sales-pipeline/_handlers'

export const runtime = 'nodejs'
export const OPTIONS = (req: Request) => preflight(req)

export const POST = withAuth<SalesEnrollPayload>(
  { role: 'freelance', body: salesEnrollSchema },
  ({ body, user, cors }) => handleEnroll(body, { ownerId: user.id, userId: user.id }, cors),
)
