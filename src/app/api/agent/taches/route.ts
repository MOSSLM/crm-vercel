// /api/agent/taches — la file de l'agent, à plat, et les trois gestes qu'il a.
//
// LA MÊME LECTURE QUE L'ADMIN, FILTRÉE — `lireLesTaches` est partagée. Le
// périmètre de l'agent est l'UNION de « ce qui m'est attribué » et de « mes
// entreprises » : le détail est écrit en tête de `_lecture.ts`, et il compte,
// parce que prendre l'un des deux seulement escamote des lignes sans que rien à
// l'écran ne le dise.
//
// TROIS GESTES, PAS QUATRE. L'agent peut reporter, ignorer et reprendre. Il ne
// peut pas ATTRIBUER : la réattribution est le filet de sécurité de l'admin
// (cf. l'en-tête de `/api/automations/prospection/[id]/assign`), et un agent
// qui se donne les tâches d'un autre casse la répartition sans que personne le
// voie.
//
// ET IL NE PEUT PAS TERMINER DEPUIS ICI — comme l'admin, et pour la même
// raison : « Fait » pose `premiere_touche_le` sur l'entreprise et fait avancer
// l'inscription. Cocher trente appels « faits » depuis un tableau daterait
// trente premiers contacts qui n'ont pas eu lieu, et la comparaison des deux
// cohortes se lit précisément à l'ÂGE depuis cette date. « Fait » reste là où
// le travail se fait : la carte de démarchage.
import { z } from 'zod'
import { json, jsonError } from '@/app/api/_lib/respond'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { withAuth } from '@/app/api/_lib/with-auth'
import { preflight } from '@/app/api/_lib/cors'
import { lireLesTaches } from '@/app/api/prospection/taches/_lecture'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const OPTIONS = (req: Request) => preflight(req)

export const GET = withAuth({ role: 'freelance' }, async ({ user, cors }) => {
  const { lignes, tronque, erreur } = await lireLesTaches(getServiceClient(), { agentId: user.id })
  if (erreur) return jsonError(erreur, 500, {}, cors)
  return json({ lignes, total: lignes.length, tronque }, { headers: cors })
})

const Geste = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  action: z.enum(['reporter', 'ignorer', 'reprendre']),
  /** `reporter` : la nouvelle échéance. */
  jusquau: z.string().datetime().optional(),
  motif: z.string().trim().max(300).optional(),
})

export const PATCH = withAuth({ role: 'freelance', body: Geste }, async ({ body, user, cors }) => {
  const sb = getServiceClient()
  const maintenant = new Date().toISOString()

  // ON NE FAIT PAS CONFIANCE AUX IDENTIFIANTS DU CORPS. La liste vient de
  // l'écran, mais rien n'empêche de la fabriquer : on relit chaque tâche et on
  // ne garde que celles du périmètre de l'agent. Ce qui tombe est COMPTÉ et
  // rendu — un geste silencieusement partiel se lit comme un geste complet.
  const { data: candidates, error: eLecture } = await sb
    .from('prospection_tasks')
    .select('id, status, assignee_id, entreprise:entreprises(owner_id)')
    .in('id', body.ids)

  if (eLecture) return jsonError(eLecture.message, 500, {}, cors)

  const premier = <T,>(v: unknown): T | null =>
    (Array.isArray(v) ? (v[0] as T | undefined) : (v as T | null)) ?? null

  const siennes = (candidates ?? []).filter((t) => {
    const ent = premier<{ owner_id: string | null }>(t.entreprise)
    return t.assignee_id === user.id || ent?.owner_id === user.id
  })
  const idsAutorises = siennes.map((t) => t.id as string)

  if (idsAutorises.length === 0) {
    return jsonError('Aucune de ces tâches n’est dans votre périmètre.', 403, {}, cors)
  }

  let patch: Record<string, unknown>
  switch (body.action) {
    case 'reporter': {
      if (!body.jusquau) return jsonError('Une date de report est requise.', 400, {}, cors)
      // REPORTER, C'EST METTRE DE CÔTÉ. Déplacer `due_at` en laissant le statut
      // à `pending` ferait réapparaître la tâche comme échue le lendemain, et
      // `isSetAside` ne la reconnaîtrait pas : c'est la LECTURE DU STATUT qui
      // distingue une mise de côté d'une simple échéance future.
      patch = { status: 'snoozed', due_at: body.jusquau }
      break
    }
    case 'ignorer':
      // `skipped` ne fait avancer aucune inscription — le geste n'a pas eu lieu.
      // ⚠️ Côté carte, ignorer appelle `garerTacheAnnulee` pour poser un motif
      // sur une inscription que plus rien ne porte. Ici on ne le fait pas : un
      // geste de masse ne doit pas garer trente inscriptions d'un coup sans
      // qu'on ait lu chacune. Elles restent dans la file de l'admin, visibles.
      patch = { status: 'skipped' }
      break
    case 'reprendre':
      // Remettre dans la file ce qu'on avait mis de côté ou ignoré, à
      // aujourd'hui. Ne ressuscite jamais une tâche FAITE.
      patch = { status: 'pending', due_at: maintenant }
      break
  }
  if (body.motif) patch.routing_reason = body.motif

  const { data, error } = await sb
    .from('prospection_tasks')
    .update(patch)
    .in('id', idsAutorises)
    // Une tâche bouclée reste bouclée : elle porte une trace dans la séquence
    // et dans `premiere_touche_le`.
    .neq('status', 'done')
    .select('id')

  if (error) return jsonError(error.message, 500, {}, cors)

  const touchees = (data ?? []).length
  return json(
    {
      touchees,
      // Dire ce qui n'a PAS bougé, et pourquoi : hors périmètre d'un côté,
      // déjà faites de l'autre. Annoncer un succès sur la sélection entière
      // ferait croire qu'on a déplacé des lignes qui n'ont pas bougé.
      ignorees: body.ids.length - touchees,
      horsPerimetre: body.ids.length - idsAutorises.length,
    },
    { headers: cors },
  )
})
