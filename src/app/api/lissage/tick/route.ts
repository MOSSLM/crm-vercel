// /api/lissage/tick — le serveur avance ce qu'il peut avancer.
//
// Deux appelants, un seul moteur : le bouton d'un écran (admin) et un cron
// (secret partagé). Le tour de file lui-même est dans `src/lib/lissage/moteur.ts`
// — la route ne fait qu'authentifier et rendre le bilan.
//
// Le cron à poser, quand une passe tournera en continu :
//   select cron.schedule('lissage', '*/15 * * * *', $$
//     select net.http_post(
//       url := 'https://<app>/api/lissage/tick',
//       headers := jsonb_build_object('x-pg-cron-secret', '<PG_CRON_SECRET>')
//     ) $$);
import { z } from 'zod'

import { json, jsonError } from '@/app/api/_lib/respond'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { withAuth } from '@/app/api/_lib/with-auth'
import { preflight } from '@/app/api/_lib/cors'
import { tickLissage } from '@/lib/lissage/moteur'
import { MIGRATION, migrationAbsente, secretPartageValide } from '../_lissage'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'
export const OPTIONS = (req: Request) => preflight(req)

async function avancer(
  passeId: string | undefined,
  taille: number | undefined,
  par: string,
  cors?: Record<string, string>,
): Promise<Response> {
  try {
    const bilan = await tickLissage(getServiceClient(), { passeId, taille, par })
    return json(bilan, { headers: cors })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (migrationAbsente(err)) {
      return jsonError(
        'migration_non_appliquee',
        503,
        { sql_file: MIGRATION, message: `${MIGRATION} n’est pas appliquée.` },
        cors,
      )
    }
    return jsonError(err.message ?? 'erreur', 500, {}, cors)
  }
}

/**
 * Le bouton de l'écran : un admin, une passe, un lot.
 *
 * ⚠️ Le `body:` est ce qui fait LIRE la requête — voir la note du même ordre
 * dans `passes/route.ts`. Sans lui, `passeId` arrivait toujours `undefined` et
 * le tick avançait TOUTES les passes au lieu de celle qu'on avait ouverte.
 */
const corpsTick = z.object({
  passeId: z.string().optional(),
  taille: z.coerce.number().optional(),
})

export const POST = withAuth({ role: 'admin', body: corpsTick }, async ({ body, user, cors }) =>
  avancer(body?.passeId, body?.taille, `admin:${user.id}`, cors),
)

/** Le cron : toutes les passes, par petits lots, sans personne devant. */
export const GET = async (req: Request): Promise<Response> => {
  if (!secretPartageValide(req)) return json({ error: 'Unauthorized' }, { status: 401 })
  const taille = Number(new URL(req.url).searchParams.get('taille')) || 20
  return avancer(undefined, taille, 'cron')
}
