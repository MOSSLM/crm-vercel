// /api/prospection/taches — la file entière, à plat, plus les gestes de masse.
//
// POURQUOI ON REND TOUT D'UN COUP
// 933 lignes, deux embeds, une requête. Filtrer côté serveur pastille par
// pastille voudrait dire un aller-retour par clic et une deuxième écriture de
// la sémantique ET/OU en PostgREST — deux définitions du même filtre, donc deux
// occasions de diverger. Ici la lecture est bête et le tri vit dans un module
// pur qu'on peut éprouver sans base (`src/lib/prospection/vue-taches.ts`).
// Le jour où la file dépassera quelques milliers de lignes, c'est CETTE route
// qui paginera ; les critères, eux, ne bougeront pas.
//
// CE QUE LE GESTE DE MASSE NE FAIT PAS : TERMINER.
// Reporter, réattribuer et ignorer ne touchent que `prospection_tasks`. Boucler
// une tâche, non : `PATCH /api/agent/tasks` pose `premiere_touche_le` sur
// l'entreprise et fait avancer l'inscription. Cocher cinquante appels « faits »
// depuis un écran d'administration daterait donc cinquante premiers contacts
// qui n'ont pas eu lieu — et la comparaison des deux cohortes se lit
// précisément à l'ÂGE depuis cette date. C'est la seule mesure que la campagne
// d'août existe pour produire ; on ne la falsifie pas depuis un tableau.
// « Fait » reste là où le travail se fait : la carte de l'agent.
import { z } from 'zod'
import { json, jsonError } from '@/app/api/_lib/respond'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { withAuth } from '@/app/api/_lib/with-auth'
import { preflight } from '@/app/api/_lib/cors'
import { lireLesTaches } from './_lecture'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const OPTIONS = (req: Request) => preflight(req)

export const GET = withAuth({ role: 'admin' }, async ({ cors }) => {
  const { lignes, tronque, erreur } = await lireLesTaches(getServiceClient())
  if (erreur) return jsonError(erreur, 500, {}, cors)
  return json({ lignes, total: lignes.length, tronque }, { headers: cors })
})

/* ── Les gestes de masse ─────────────────────────────────────────────────── */

const Geste = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  action: z.enum(['reporter', 'attribuer', 'ignorer', 'reprendre']),
  /** `reporter` : la nouvelle échéance. `attribuer` : l'agent, ou null pour détacher. */
  jusquau: z.string().datetime().optional(),
  agentId: z.string().uuid().nullable().optional(),
  motif: z.string().trim().max(300).optional(),
})

export const PATCH = withAuth({ role: 'admin', body: Geste }, async ({ body, cors }) => {
  const sb = getServiceClient()
  const maintenant = new Date().toISOString()

  let patch: Record<string, unknown>
  switch (body.action) {
    case 'reporter': {
      if (!body.jusquau) return jsonError('Une date de report est requise.', 400, {}, cors)
      // REPORTER, C'EST METTRE DE CÔTÉ. Déplacer `due_at` en laissant le statut
      // à `pending` ferait réapparaître la tâche comme échue le lendemain, et
      // surtout `isSetAside` ne la reconnaîtrait pas : c'est la LECTURE DU
      // STATUT qui distingue une mise de côté d'une simple échéance future.
      patch = { status: 'snoozed', due_at: body.jusquau }
      break
    }
    case 'attribuer':
      // `agentId` absent et `agentId: null` ne veulent pas dire la même chose —
      // le premier est un oubli, le second est un détachement volontaire. Zod
      // les distingue, on ne les confond pas ici.
      if (body.agentId === undefined) return jsonError('Un agent est requis.', 400, {}, cors)
      patch = { assignee_id: body.agentId }
      break
    case 'ignorer':
      // `skipped` ne fait avancer aucune inscription — le geste n'a pas eu lieu
      // (cf. `PATCH /api/agent/tasks`). C'est ce qui le rend sûr en masse.
      patch = { status: 'skipped' }
      break
    case 'reprendre':
      // Remettre dans la file ce qu'on avait mis de côté ou ignoré, à
      // aujourd'hui. Ne ressuscite jamais une tâche FAITE : `done_at` est posé
      // et la séquence a déjà avancé derrière — la rouvrir ferait repartir une
      // étape qui est partie.
      patch = { status: 'pending', due_at: maintenant }
      break
  }
  if (body.motif) patch.routing_reason = body.motif

  const requete = sb.from('prospection_tasks').update(patch).in('id', body.ids)
  // Une tâche bouclée reste bouclée, quel que soit le geste : elle porte une
  // trace dans la séquence et dans `premiere_touche_le`.
  const { data, error } = await requete.neq('status', 'done').select('id')

  if (error) return jsonError(error.message, 500, {}, cors)

  const touchees = (data ?? []).length
  return json(
    {
      touchees,
      // Dire ce qui n'a PAS bougé plutôt que d'annoncer un succès sur la
      // sélection entière : cocher 40 lignes dont 3 sont faites doit rendre 37.
      ignorees: body.ids.length - touchees,
    },
    { headers: cors },
  )
})
