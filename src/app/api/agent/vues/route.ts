// /api/agent/vues — les vues de tâches de l'agent, et rien que les siennes.
//
// `vues_taches` PORTE DÉJÀ `agent_id` — la colonne existe depuis le 19/08 et
// n'avait aucun écran pour l'écrire. C'est elle qui distingue « Mes appels du
// jour », qui n'appartient qu'à celui qui l'a nommée, d'une vue d'équipe.
//
// LES VUES D'ÉQUIPE RESTENT VISIBLES. Une vue à `agent_id` nul est une vue de
// l'admin, et l'agent la voit : « Sans réponse J+7 » est un actif partagé, le
// cloisonner obligerait chacun à la recréer et on aurait deux définitions du
// même mot. Il ne peut simplement pas la modifier — c'est le seul mur.
//
// ON STOCKE LES CRITÈRES, JAMAIS LES RÉSULTATS. Même invariante que les
// segments : une vue est une QUESTION posée à la file, pas une liste de tâches.
import { z } from 'zod'
import { json, jsonError } from '@/app/api/_lib/respond'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { withAuth } from '@/app/api/_lib/with-auth'
import { preflight } from '@/app/api/_lib/cors'
import { normaliserCriteres } from '@/lib/prospection/vue-taches'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const OPTIONS = (req: Request) => preflight(req)

const migrationAbsente = (message: string) =>
  /relation .*vues_taches.* does not exist|could not find the table/i.test(message)

const ABSENTE =
  'La table `vues_taches` n’existe pas encore : appliquer `sql/20260819_vues_taches.sql`.'

export const GET = withAuth({ role: 'freelance' }, async ({ user, cors }) => {
  const sb = getServiceClient()
  const { data, error } = await sb
    .from('vues_taches')
    .select('id, nom, criteres, agent_id, cree_le, utilise_le')
    // Les siennes ET celles de l'équipe. `or` accepte `is.null` pour la seconde.
    .or(`agent_id.eq.${user.id},agent_id.is.null`)
    .order('utilise_le', { ascending: false, nullsFirst: false })
    .order('cree_le', { ascending: true })

  if (error) {
    return migrationAbsente(error.message)
      ? jsonError(ABSENTE, 503, {}, cors)
      : jsonError(error.message, 500, {}, cors)
  }

  const vues = (data ?? []).map((v) => ({
    id: v.id as string,
    nom: v.nom as string,
    agentId: (v.agent_id as string | null) ?? null,
    creeLe: v.cree_le as string,
    utiliseLe: (v.utilise_le as string | null) ?? null,
    // Une vue d'équipe se lit, ne se modifie pas : l'écran a besoin de le
    // savoir pour ne pas offrir un bouton qui rendra 403.
    aMoi: (v.agent_id as string | null) === user.id,
    // Normalisés à la sortie : l'écran ne doit jamais recevoir un champ qu'il
    // ne sait pas lire, même si quelqu'un a écrit dans la table à la main.
    criteres: normaliserCriteres(v.criteres),
  }))

  return json({ vues }, { headers: cors })
})

const Nouvelle = z.object({
  nom: z.string().trim().min(1).max(60),
  criteres: z.unknown(),
})

export const POST = withAuth({ role: 'freelance', body: Nouvelle }, async ({ body, user, cors }) => {
  const criteres = normaliserCriteres(body.criteres)
  if (!criteres) return jsonError('Critères illisibles.', 400, {}, cors)

  const sb = getServiceClient()
  const { data, error } = await sb
    .from('vues_taches')
    // `agent_id` est posé D'OFFICE : un agent ne crée jamais de vue d'équipe,
    // même en le demandant dans le corps de la requête.
    .insert({ nom: body.nom, criteres, agent_id: user.id, cree_par: user.id })
    .select('id, nom, criteres, agent_id, cree_le')
    .maybeSingle()

  if (error) {
    if (migrationAbsente(error.message)) return jsonError(ABSENTE, 503, {}, cors)
    if (/duplicate key|vues_taches_nom_unique/i.test(error.message)) {
      return jsonError(`Vous avez déjà une vue « ${body.nom} ».`, 409, {}, cors)
    }
    return jsonError(error.message, 500, {}, cors)
  }

  return json({ vue: data }, { headers: cors })
})

const Modification = z.object({
  id: z.string().uuid(),
  nom: z.string().trim().min(1).max(60).optional(),
  criteres: z.unknown().optional(),
  /** Marquer qu'on vient de l'ouvrir — c'est ce qui dit plus tard laquelle est morte. */
  utilisee: z.boolean().optional(),
})

export const PATCH = withAuth({ role: 'freelance', body: Modification }, async ({ body, user, cors }) => {
  const patch: Record<string, unknown> = {}
  if (body.nom !== undefined) patch.nom = body.nom
  if (body.criteres !== undefined) {
    const criteres = normaliserCriteres(body.criteres)
    if (!criteres) return jsonError('Critères illisibles.', 400, {}, cors)
    patch.criteres = criteres
  }
  if (body.utilisee) patch.utilise_le = new Date().toISOString()
  if (Object.keys(patch).length === 0) return jsonError('Rien à modifier.', 400, {}, cors)

  const sb = getServiceClient()
  const { data, error } = await sb
    .from('vues_taches')
    .update(patch)
    .eq('id', body.id)
    // LE MUR : on ne modifie que les siennes. Une vue d'équipe reste à l'admin.
    .eq('agent_id', user.id)
    .select('id, nom, criteres, utilise_le')
    .maybeSingle()

  if (error) {
    if (migrationAbsente(error.message)) return jsonError(ABSENTE, 503, {}, cors)
    if (/duplicate key|vues_taches_nom_unique/i.test(error.message)) {
      return jsonError(`Vous avez déjà une vue « ${body.nom} ».`, 409, {}, cors)
    }
    return jsonError(error.message, 500, {}, cors)
  }
  if (!data) return jsonError('Vue introuvable, ou elle appartient à l’équipe.', 404, {}, cors)

  return json({ vue: data }, { headers: cors })
})

const Suppression = z.object({ id: z.string().uuid() })

// SUPPRIMER UNE VUE NE SUPPRIME RIEN D'AUTRE : une vue ne contient pas de
// tâches, elle contient une question.
export const DELETE = withAuth({ role: 'freelance', body: Suppression }, async ({ body, user, cors }) => {
  const sb = getServiceClient()
  const { data, error } = await sb
    .from('vues_taches')
    .delete()
    .eq('id', body.id)
    .eq('agent_id', user.id)
    .select('id')

  if (error) {
    return migrationAbsente(error.message)
      ? jsonError(ABSENTE, 503, {}, cors)
      : jsonError(error.message, 500, {}, cors)
  }
  if (!(data ?? []).length) return jsonError('Vue introuvable, ou elle appartient à l’équipe.', 404, {}, cors)
  return json({ ok: true }, { headers: cors })
})
