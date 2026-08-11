// POST /api/automations/enrollments/[id]/reply
// « Le prospect a répondu » — libère une inscription garée sur une étape
// d'attente-réponse et enchaîne sur le message suivant.
//
// À NE PAS CONFONDRE avec /api/sales-pipeline/react, qui porte les cinq issues
// STOPPANT la séquence. Ici on continue : cf. l'en-tête de `reply.ts`.
import { preflight } from '@/app/api/_lib/cors'
import { json, jsonError } from '@/app/api/_lib/respond'
import { withAuth } from '@/app/api/_lib/with-auth'
import { declarerReponse, type ReplyError } from '@/lib/automations/reply'

export const runtime = 'nodejs'
export const OPTIONS = (req: Request) => preflight(req)

const MESSAGE: Record<ReplyError, { status: number; text: string }> = {
  introuvable: { status: 404, text: 'Inscription introuvable' },
  inactive: { status: 409, text: 'Cette inscription n’est plus active' },
  // Le cas du double-clic, ou d'un bouton resté affiché après un rafraîchissement.
  // On refuse plutôt que d'avancer : sauter une étape en silence coûterait un
  // message au prospect.
  pas_en_attente: { status: 409, text: 'Cette séquence n’attend pas de réponse en ce moment' },
}

type Params = { id: string }

export const POST = withAuth<undefined, Params>({}, async ({ params, cors }) => {
  const result = await declarerReponse(null, params.id)
  if (!result.ok) {
    const m = MESSAGE[result.error ?? 'introuvable']
    return jsonError(m.text, m.status, {}, cors)
  }
  return json({ ok: true, step_index: result.stepIndex }, { headers: cors })
})
