// POST /api/sales-pipeline/email — enregistrer à la main l'adresse d'un
// prospect, là où vivent toutes les autres : la fiche entreprise.
import { withAuth } from '@/app/api/_lib/with-auth'
import { preflight } from '@/app/api/_lib/cors'
import { salesSetEmailSchema, type SalesSetEmailPayload } from '@/app/api/_lib/schemas'
import { handleSetEmail } from '../_handlers'

export const runtime = 'nodejs'
export const OPTIONS = (req: Request) => preflight(req)

export const POST = withAuth<SalesSetEmailPayload>(
  { role: 'admin', body: salesSetEmailSchema },
  ({ body, user, cors }) => handleSetEmail(body, { ownerId: null, userId: user.id }, cors),
)
