// /api/prospection/vues — les vues de tâches enregistrées.
//
// ON STOCKE LES CRITÈRES, JAMAIS LES RÉSULTATS. Une vue est une QUESTION posée
// à la file, pas une liste de tâches : la tâche qui devient échue ce matin y
// entre toute seule, celle qu'on vient de boucler en sort. C'est la même
// invariante que les segments (`sql/20260817_segments_entreprises.sql`), et
// c'est ce qui distingue une vue d'un lot.
//
// LES CRITÈRES SONT VALIDÉS ICI, PAS SEULEMENT À LA LECTURE. Le jsonb accepte
// n'importe quoi ; une pastille inventée ferait un tableau vide que personne ne
// saurait expliquer. `normaliserCriteres` écarte l'illisible et garde le reste
// — perdre une pastille sur quatre vaut mieux que perdre la vue entière.
import { z } from 'zod'
import { json, jsonError } from '@/app/api/_lib/respond'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { withAuth } from '@/app/api/_lib/with-auth'
import { preflight } from '@/app/api/_lib/cors'
import { normaliserCriteres } from '@/lib/prospection/vue-taches'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const OPTIONS = (req: Request) => preflight(req)

/** La table est née le 19/08 — sans elle, la route le DIT plutôt que de rendre 500. */
const migrationAbsente = (message: string) =>
  /relation .*vues_taches.* does not exist|could not find the table/i.test(message)

const ABSENTE =
  'La table `vues_taches` n’existe pas encore : appliquer `sql/20260819_vues_taches.sql`.'

export const GET = withAuth({ role: 'admin' }, async ({ cors }) => {
  const sb = getServiceClient()
  const { data, error } = await sb
    .from('vues_taches')
    .select('id, nom, criteres, agent_id, cree_le, utilise_le')
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
    // Normalisés à la sortie : l'écran ne doit jamais recevoir un champ qu'il
    // ne sait pas lire, même si quelqu'un a écrit dans la table à la main.
    criteres: normaliserCriteres(v.criteres),
  }))

  return json({ vues }, { headers: cors })
})

const Nouvelle = z.object({
  nom: z.string().trim().min(1).max(60),
  criteres: z.unknown(),
  agentId: z.string().uuid().nullable().optional(),
})

export const POST = withAuth({ role: 'admin', body: Nouvelle }, async ({ body, user, cors }) => {
  const criteres = normaliserCriteres(body.criteres)
  if (!criteres) return jsonError('Critères illisibles.', 400, {}, cors)

  const sb = getServiceClient()
  const { data, error } = await sb
    .from('vues_taches')
    .insert({
      nom: body.nom,
      criteres,
      agent_id: body.agentId ?? null,
      cree_par: user.id,
    })
    .select('id, nom, criteres, agent_id, cree_le')
    .maybeSingle()

  if (error) {
    if (migrationAbsente(error.message)) return jsonError(ABSENTE, 503, {}, cors)
    // L'index unique porte sur (agent, nom) à la casse et aux espaces près :
    // le dire en français vaut mieux qu'un code postgres dans une alerte.
    if (/duplicate key|vues_taches_nom_unique/i.test(error.message)) {
      return jsonError(`Une vue s’appelle déjà « ${body.nom} ».`, 409, {}, cors)
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

export const PATCH = withAuth({ role: 'admin', body: Modification }, async ({ body, cors }) => {
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
    .select('id, nom, criteres, agent_id, utilise_le')
    .maybeSingle()

  if (error) {
    if (migrationAbsente(error.message)) return jsonError(ABSENTE, 503, {}, cors)
    if (/duplicate key|vues_taches_nom_unique/i.test(error.message)) {
      return jsonError(`Une vue s’appelle déjà « ${body.nom} ».`, 409, {}, cors)
    }
    return jsonError(error.message, 500, {}, cors)
  }
  if (!data) return jsonError('Vue introuvable.', 404, {}, cors)

  return json({ vue: data }, { headers: cors })
})

const Suppression = z.object({ id: z.string().uuid() })

// SUPPRIMER UNE VUE NE SUPPRIME RIEN D'AUTRE. Une vue ne contient pas de
// tâches — elle contient une question. C'est précisément ce qui rend cette
// suppression sans conséquence, là où retirer un lead d'une campagne changerait
// un dénominateur.
export const DELETE = withAuth({ role: 'admin', body: Suppression }, async ({ body, cors }) => {
  const sb = getServiceClient()
  const { error } = await sb.from('vues_taches').delete().eq('id', body.id)
  if (error) {
    return migrationAbsente(error.message)
      ? jsonError(ABSENTE, 503, {}, cors)
      : jsonError(error.message, 500, {}, cors)
  }
  return json({ ok: true }, { headers: cors })
})
