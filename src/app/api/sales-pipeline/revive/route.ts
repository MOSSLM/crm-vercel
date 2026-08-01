// POST /api/sales-pipeline/revive — rouvrir une étape sautée, ou remettre en
// jeu une ligne perdue / en nurturing.
import { withAuth } from '@/app/api/_lib/with-auth'
import { preflight } from '@/app/api/_lib/cors'
import { salesReviveSchema, type SalesRevivePayload } from '@/app/api/_lib/schemas'
import { handleRevive } from '../_handlers'

export const runtime = 'nodejs'
export const OPTIONS = (req: Request) => preflight(req)

export const POST = withAuth<SalesRevivePayload>(
  { role: 'admin', body: salesReviveSchema },
  ({ body, user, cors }) => handleRevive(body, { ownerId: null, userId: user.id }, cors),
)
