// /api/agent/gestes — l'agent annule ses propres gestes, et rien d'autre.
//
// Le pendant de `/api/prospection/gestes` pour l'espace agent : même mécanique,
// périmètre réduit à ses propres gestes. Voir l'en-tête de l'autre route pour
// la raison du dédoublement.
import { z } from 'zod'
import { json, jsonError } from '@/app/api/_lib/respond'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { withAuth } from '@/app/api/_lib/with-auth'
import { preflight } from '@/app/api/_lib/cors'
import { annulerGeste, listerGestes } from '@/lib/prospection/gestes-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const OPTIONS = (req: Request) => preflight(req)

export const GET = withAuth({ role: 'freelance' }, async ({ req, user, cors }) => {
  const limite = Number(new URL(req.url).searchParams.get('limite') ?? 10)
  try {
    const gestes = await listerGestes(getServiceClient(), {
      agentId: user.id,
      limite: Number.isFinite(limite) ? limite : 10,
    })
    return json({ gestes }, { headers: cors })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lecture impossible'
    if (/prospection_gestes/.test(message)) {
      return jsonError('sql/20260823_annuler_un_geste.sql n’est pas appliquée', 503, {}, cors)
    }
    return jsonError(message, 500, {}, cors)
  }
})

const Annulation = z.object({ id: z.string().uuid() })

export const POST = withAuth({ role: 'freelance', body: Annulation }, async ({ body, user, cors }) => {
  const { ok, motif } = await annulerGeste(getServiceClient(), {
    gesteId: body.id,
    parQui: user.id,
    auteurExige: user.id,
  })
  if (!ok) return jsonError(motif, 409, {}, cors)
  return json({ ok: true, motif }, { headers: cors })
})
