// /api/automations/campagnes/[id]/revue — ce qu'on voit avant de cliquer.
//
// RIEN NE PART SANS AVOIR ÉTÉ VU. Le CRM connaît déjà la règle par un accident
// voisin : « un audit ne se valide que s'il est préparé », parce qu'un bouton
// de lot validait sans jamais lire le contenu. Un lancement est le même geste
// en plus cher — il écrit à des gens.
//
// La revue répond à trois questions, dans cet ordre :
//   1. Qu'est-ce qui empêche de lancer ? (contrôles, dont l'attente sans délai)
//   2. Combien partent, et pourquoi les autres non ? (décompte par motif)
//   3. Qui part en premier ? (les prochains de la file, nommés)
//
// Le décompte est RECALCULÉ, jamais lu dans `statut` : entre l'ajout et le
// lancement, un prospect a pu être enrichi, archivé, ou répondre. Une revue qui
// affiche l'état du jour de l'ajout fait lancer sur une photo périmée.
import { json, jsonError } from '@/app/api/_lib/respond'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { withAuth } from '@/app/api/_lib/with-auth'
import { preflight } from '@/app/api/_lib/cors'
import { controlesAvantLancement, lancementPermis } from '@/lib/automations/campagne'
import { leadsALancer, revueDeCampagne } from '@/lib/automations/campagne-db'
import { MIGRATION_LISTE, chargerCampagne, migrationAbsente } from '../../_campagne'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const OPTIONS = (req: Request) => preflight(req)

type Params = { id: string }

/** Combien de prochains on nomme. Assez pour reconnaître la population, pas pour la lire en entier. */
const APERCU = 20

export const GET = withAuth<undefined, Params>({ role: 'admin' }, async ({ params, cors }) => {
  const sc = getServiceClient()
  const campagne = await chargerCampagne(sc, params.id)
  if (!campagne) return jsonError('campagne_introuvable', 404, { message: 'Cette campagne n’existe pas.' }, cors)

  const controles = controlesAvantLancement(campagne.steps, campagne.automation.status)

  try {
    const decompte = await revueDeCampagne(sc, params.id, campagne.cible)
    const prochains = await leadsALancer(sc, params.id, APERCU)

    const ids = prochains.map((p) => p.entrepriseId)
    const { data: entData } = ids.length
      ? await sc.from('entreprises').select('id, name, ville, email, telephone').in('id', ids)
      : { data: [] as unknown[] }
    const entPar = new Map(((entData ?? []) as { id: number }[]).map((e) => [Number(e.id), e]))

    return json(
      {
        campagne: {
          id: campagne.automation.id,
          nom: campagne.automation.name,
          statut: campagne.automation.status,
          etapes: campagne.steps.length,
          canaux: [...new Set(campagne.steps.map((s) => s.kind).filter((k) => k !== 'wait'))],
          cible: campagne.cible,
          audience: campagne.audience,
        },
        controles,
        peutLancer: lancementPermis(controles) && decompte.aLancer > 0,
        decompte,
        prochains: prochains.map((p) => ({
          entrepriseId: p.entrepriseId,
          contactId: p.contactId,
          entreprise: entPar.get(p.entrepriseId) ?? null,
        })),
      },
      { headers: cors },
    )
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (migrationAbsente(err)) {
      return jsonError('migration_non_appliquee', 503, { sql_file: MIGRATION_LISTE, message: `${MIGRATION_LISTE} n’est pas appliquée.` }, cors)
    }
    return jsonError(err.message ?? 'erreur', 500, { message: err.message }, cors)
  }
})
