// /api/automations/prospection/[id]/assign — remettre une tâche manuelle à
// quelqu'un d'autre.
//
// Le régulateur distribue automatiquement (cf. `task-routing.ts`), mais la
// règle ne sait pas qu'un agent part en congé cet après-midi. Sans reprise à la
// main, la seule issue était de basculer TOUTE l'attribution sur « admin » —
// on déplaçait cent tâches pour en déplacer une.
//
// Réservé à l'admin : c'est lui le filet de sécurité de la file.
import { preflight } from '@/app/api/_lib/cors'
import { json, jsonError } from '@/app/api/_lib/respond'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { withAuth } from '@/app/api/_lib/with-auth'
import { isMissingColumn } from '@/app/api/_lib/schema-gap'
import { prospectionAssignSchema, type ProspectionAssignPayload } from '@/app/api/_lib/schemas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const OPTIONS = (req: Request) => preflight(req)

type Params = { id: string }

export const PATCH = withAuth<ProspectionAssignPayload, Params>(
  { role: 'admin', body: prospectionAssignSchema },
  async ({ body, params, user, cors }) => {
    const sb = getServiceClient()

    const { data: existing } = await sb
      .from('prospection_tasks')
      .select('id, status, assignee_id')
      .eq('id', params.id)
      .maybeSingle()
    if (!existing) return jsonError('tache_introuvable', 404, { message: 'Cette tâche n’existe plus.' }, cors)
    // Redonner une tâche déjà traitée ne veut rien dire : elle ne reviendra
    // dans aucune file, et la personne croirait avoir quelque chose à faire.
    if (existing.status !== 'pending' && existing.status !== 'snoozed') {
      return jsonError(
        'tache_close',
        409,
        { message: 'Cette tâche est déjà traitée — elle ne peut plus changer de destinataire.' },
        cors,
      )
    }

    if (body.assignee_id) {
      const { data: target } = await sb
        .from('user_profiles')
        .select('id')
        .eq('id', body.assignee_id)
        .maybeSingle()
      if (!target) {
        return jsonError('destinataire_inconnu', 400, { message: 'Ce destinataire n’existe pas.' }, cors)
      }
    }

    const patch: Record<string, unknown> = {
      assignee_id: body.assignee_id,
      routing_reason: body.assignee_id ? 'réattribué à la main' : 'retiré de toutes les files',
    }
    const { error } = await sb.from('prospection_tasks').update(patch).eq('id', params.id)
    if (error) {
      // `routing_reason` arrive avec 20260801 : sans elle, on réattribue quand
      // même plutôt que d'échouer sur un champ d'affichage.
      if (isMissingColumn(error)) {
        const retry = await sb
          .from('prospection_tasks')
          .update({ assignee_id: body.assignee_id })
          .eq('id', params.id)
        if (!retry.error) return json({ ok: true, assignee_id: body.assignee_id }, { headers: cors })
      }
      return jsonError(error.message, 500, { message: error.message }, cors)
    }

    return json({ ok: true, assignee_id: body.assignee_id, by: user.id }, { headers: cors })
  },
)
