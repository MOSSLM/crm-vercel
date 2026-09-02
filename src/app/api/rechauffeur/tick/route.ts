// /api/rechauffeur/tick — le tick du réchauffeur, appelé par pg_cron.
//
// POURQUOI IL NE SE GREFFE PAS SUR `/api/automations/tick`
// Celui-là tourne CHAQUE MINUTE avec `maxDuration = 60` et cinq envois par
// passage : c'est la file de prospection, elle doit rester nerveuse. Le
// réchauffeur, lui, planifie une journée entière d'un coup et ouvrira demain
// des sessions IMAP vers les boîtes témoins — des secondes, pas des
// millisecondes. Les mettre dans la même fonction, c'est faire porter au
// courrier qui rapporte le risque de délai du courrier qui ne rapporte rien.
//
// D'où : sa route, son cron toutes les dix minutes, sa `maxDuration`.
//
// LE VERROU N'EST PAS ICI, il est dans la base. Deux ticks qui se croisent ne
// peuvent ni planifier deux fois la même journée (clé primaire de
// `rechauffe_jours`) ni envoyer deux fois le même message (réclamation par le
// compteur de tentatives). L'explication complète est en tête de
// `src/lib/rechauffeur/rechauffeur-db.ts`.
//
// Le cron à poser, une fois les expéditeurs et les témoins renseignés :
//   select cron.schedule('rechauffeur', '*/10 * * * *', $$
//     select net.http_post(
//       url := 'https://<app>/api/rechauffeur/tick',
//       headers := jsonb_build_object('x-pg-cron-secret', '<PG_CRON_SECRET>')
//     ) $$);

import { json } from '@/app/api/_lib/respond'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { requireUser } from '@/app/api/_lib/auth'
import { requireRole } from '@/app/api/_lib/require-role'
import { tickRechauffeur } from '@/lib/rechauffeur/moteur'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * Même contrat que le tick des automatisations : en production, au moins un
 * secret DOIT être configuré et correspondre — sinon on refuse. En local, sans
 * secret configuré, on laisse passer pour pouvoir l'essayer.
 */
function tickAutorise(req: Request): boolean {
  const cronSecret = process.env.CRON_SECRET
  const pgCronSecret = process.env.PG_CRON_SECRET

  if (process.env.NODE_ENV === 'production' && !cronSecret && !pgCronSecret) return false
  if (!cronSecret && !pgCronSecret) return true

  const auth = req.headers.get('authorization')
  const pgHeader = req.headers.get('x-pg-cron-secret')
  return (
    (!!cronSecret && auth === `Bearer ${cronSecret}`) ||
    (!!pgCronSecret && pgHeader === pgCronSecret)
  )
}

/**
 * L'ADMIN PEUT LE DÉCLENCHER LUI-MÊME, et c'est un besoin de diagnostic, pas de
 * confort. Un réchauffeur ne se voit qu'à ses effets : tant que le cron n'a pas
 * tourné, l'écran affiche exactement la même chose qu'un réchauffeur en panne —
 * zéro partout — et rien ne dit lequel des deux on regarde. Le bouton rend le
 * bilan du tick (planifiés, envoyés, alertes) : c'est la seule façon de
 * distinguer « il n'a pas encore tourné » de « il tourne et n'a rien à faire ».
 *
 * Le porteur du secret cron n'est pas dérangé : on ne va lire le rôle que si le
 * secret n'a pas déjà tranché — un aller-retour Supabase par minute pour un
 * appel de machine serait payé pour rien.
 */
async function appelantAutorise(req: Request): Promise<boolean> {
  if (tickAutorise(req)) return true
  const auth = await requireUser(req)
  if (!auth.ok) return false
  const role = await requireRole(auth.user, 'admin')
  return role.ok
}

async function handle(req: Request): Promise<Response> {
  if (!(await appelantAutorise(req))) return json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const resultat = await tickRechauffeur(getServiceClient())
    return json(resultat)
  } catch (err) {
    // La table absente est le cas le plus probable d'un déploiement en avance
    // sur la base : on le nomme plutôt que de rendre un 500 nu.
    const message = err instanceof Error ? err.message : 'Erreur inconnue'
    if (/rechauffe_/.test(message) && /does not exist|relation/i.test(message)) {
      return json(
        { error: 'Migration absente : appliquer sql/20260819_rechauffeur.sql', detail: message },
        { status: 503 },
      )
    }
    return json({ error: message }, { status: 500 })
  }
}

export const GET = handle
export const POST = handle
