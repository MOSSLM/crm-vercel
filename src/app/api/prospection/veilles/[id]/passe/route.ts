// /api/prospection/veilles/[id]/passe — faire tourner une veille, à la main.
//
// À LA MAIN, ET PAS ENCORE EN CRON. C'est délibéré, et ça se défend : une
// passe est une lecture (elle n'écrit que dans `veille_constats`), donc la
// mettre en cron ne présente aucun risque d'envoi. Mais un cron pose la
// question de la CADENCE, et la cadence dépend de la matière : le RGE bouge à
// l'échelle du trimestre, le rapport ouvert à l'heure. Fixer une cadence avant
// d'avoir vu une veille tourner, c'est choisir un chiffre au hasard et le
// défendre six mois.
//
// LA PASSE EST RELANÇABLE SANS CONSÉQUENCE — c'est le point qui compte. Deux
// passes lancées coup sur coup ne doublent rien : l'unicité
// `(veille_id, entreprise_id)` tranche en base. La seconde rend simplement
// « 0 nouvelle », ce qui est la vérité.
import { json, jsonError } from '@/app/api/_lib/respond'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { withAuth } from '@/app/api/_lib/with-auth'
import { preflight } from '@/app/api/_lib/cors'
import { estDeclencheur, etatDe, phraseDe } from '@/lib/prospection/signaux'
import { passerLaVeille } from '@/lib/prospection/signaux-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const OPTIONS = (req: Request) => preflight(req)

type Params = { id: string }

const migrationAbsente = (message: string) =>
  /relation .*veille.* does not exist|could not find the table/i.test(message)

const ABSENTE = 'Les tables des veilles n’existent pas encore : appliquer `sql/20260820_veilles.sql`.'

export const POST = withAuth<unknown, Params>({ role: 'admin' }, async ({ params, cors }) => {
  const sb = getServiceClient()

  const { data: v, error } = await sb
    .from('veilles')
    .select('id, declencheur, perimetre, premiere_passe_le')
    .eq('id', params.id)
    .maybeSingle()

  if (error) {
    return migrationAbsente(error.message)
      ? jsonError(ABSENTE, 503, {}, cors)
      : jsonError(error.message, 500, {}, cors)
  }
  if (!v) return jsonError('Veille introuvable.', 404, {}, cors)

  // Un déclencheur retiré du catalogue laisse une veille orpheline. La refuser
  // en le NOMMANT vaut mieux qu'un bilan à zéro : zéro voudrait dire « rien
  // trouvé », alors qu'on n'a rien cherché.
  const declencheur = v.declencheur as string
  if (!estDeclencheur(declencheur)) {
    return jsonError(
      `Déclencheur inconnu : « ${declencheur} ». Il a été retiré du catalogue — cette veille ne peut plus tourner.`,
      409,
      {},
      cors,
    )
  }

  const { bilan } = await passerLaVeille(sb, {
    id: v.id as string,
    declencheur,
    perimetre: (v.perimetre as 'attribuees' | 'parc') ?? 'attribuees',
    premierePasseLe: (v.premiere_passe_le as string | null) ?? null,
  })

  const etat = etatDe({ premierePasseLe: bilan.reprise ? new Date().toISOString() : (v.premiere_passe_le as string | null), derniereBilan: bilan })
  return json({ bilan, etat, phrase: phraseDe(etat, bilan) }, { headers: cors })
})
