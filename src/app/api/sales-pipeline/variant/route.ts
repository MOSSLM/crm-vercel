// POST /api/sales-pipeline/variant — épingler la version de message d'un
// prospect (à l'entreprise ou au contact), vue admin.
//
// L'épingle vit sur l'inscription et non sur la carte : c'est le seul moyen
// qu'un e-mail la respecte, puisqu'il part par le régulateur sans personne
// devant l'écran.
import { withAuth } from '@/app/api/_lib/with-auth'
import { preflight } from '@/app/api/_lib/cors'
import { salesVariantSchema, type SalesVariantPayload } from '@/app/api/_lib/schemas'
import { handleVariant } from '../_handlers'

export const runtime = 'nodejs'
export const OPTIONS = (req: Request) => preflight(req)

export const POST = withAuth<SalesVariantPayload>(
  { role: 'admin', body: salesVariantSchema },
  ({ body, user, cors }) => handleVariant(body, { ownerId: null, userId: user.id }, cors),
)
