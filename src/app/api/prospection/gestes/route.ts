// /api/prospection/gestes — les derniers gestes, et leur annulation.
//
// DEUX ROUTES POUR LA MÊME MÉCANIQUE, comme partout ailleurs dans ce CRM
// (`/api/prospection/taches` et `/api/agent/taches`) : `requireRole` exige un
// rôle EXACT, un admin n'est pas un freelance à qui on aurait ajouté des
// droits. Celle-ci voit tous les gestes ; celle de l'agent ne voit que les
// siens, et ce n'est pas de la pudeur : annuler le geste d'un collègue lui
// rendrait une tâche dans sa file sans qu'il sache pourquoi.
//
// LE VERDICT PART AVEC LA LISTE, y compris quand il refuse. Un bouton grisé
// sans motif est exactement ce qu'on remplace ici : la phrase dit quoi faire —
// le plus souvent « annule l'autre d'abord ».
import { z } from 'zod'
import { json, jsonError } from '@/app/api/_lib/respond'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { withAuth } from '@/app/api/_lib/with-auth'
import { preflight } from '@/app/api/_lib/cors'
import { annulerGeste, listerGestes } from '@/lib/prospection/gestes-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const OPTIONS = (req: Request) => preflight(req)

/** Une table absente n'est pas une panne : c'est une migration non jouée. */
const migrationAbsente = (message: string): boolean =>
  /prospection_gestes/.test(message) && /does not exist|relation/i.test(message)

const MESSAGE_MIGRATION = 'sql/20260823_annuler_un_geste.sql n’est pas appliquée'

export const GET = withAuth({ role: 'admin' }, async ({ req, cors }) => {
  const limite = Number(new URL(req.url).searchParams.get('limite') ?? 20)
  try {
    const gestes = await listerGestes(getServiceClient(), {
      limite: Number.isFinite(limite) ? limite : 20,
    })
    return json({ gestes }, { headers: cors })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lecture impossible'
    if (migrationAbsente(message)) return jsonError(MESSAGE_MIGRATION, 503, {}, cors)
    return jsonError(message, 500, {}, cors)
  }
})

const Annulation = z.object({ id: z.string().uuid() })

export const POST = withAuth({ role: 'admin', body: Annulation }, async ({ body, user, cors }) => {
  const { ok, motif } = await annulerGeste(getServiceClient(), {
    gesteId: body.id,
    parQui: user.id,
  })
  // UN REFUS N'EST PAS UNE PANNE : il porte une raison que l'humain doit lire,
  // et 409 la distingue d'un 500 dans lequel il n'y aurait rien à comprendre.
  if (!ok) return jsonError(motif, 409, {}, cors)
  return json({ ok: true, motif }, { headers: cors })
})
