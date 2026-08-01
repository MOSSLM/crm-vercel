// /api/automations/regulator/sequence — les réglages de file d'UNE séquence :
// ses plages d'envoi, sa priorité dans la file, son plafond quotidien.
//
// Ils vivent dans `automations.settings` (jsonb déjà lu par l'éditeur de
// séquence) : trois champs ne justifiaient pas une table de jointure.
import { json, jsonError } from '@/app/api/_lib/respond'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { withAuth } from '@/app/api/_lib/with-auth'
import { preflight } from '@/app/api/_lib/cors'
import { sequenceRegulatorSchema, type SequenceRegulatorPayload } from '@/app/api/_lib/schemas'
import { normalizeWindows, overlappingWindows } from '@/lib/automations/regulator'
import { buildRegulatorView } from '../_view'

export const runtime = 'nodejs'
export const OPTIONS = (req: Request) => preflight(req)

export const PATCH = withAuth<SequenceRegulatorPayload>(
  { role: 'admin', body: sequenceRegulatorSchema },
  async ({ body, cors }) => {
    const sc = getServiceClient()
    const { data: row } = await sc
      .from('automations')
      .select('id, kind, settings')
      .eq('id', body.automation_id)
      .maybeSingle()
    if (!row || row.kind !== 'sequence') return jsonError('sequence_introuvable', 404, {}, cors)

    const settings = { ...((row.settings as Record<string, unknown>) ?? {}) }

    if (body.send_windows != null) {
      const windows = normalizeWindows(body.send_windows)
      if (overlappingWindows(windows).size > 0) {
        return jsonError('plages_chevauchantes', 400, { message: 'Deux plages se chevauchent.' }, cors)
      }
      settings.sendWindows = windows
    }
    if (body.queue_priority != null) settings.queuePriority = body.queue_priority
    if (body.daily_cap !== undefined) settings.dailyCap = body.daily_cap

    const patch: Record<string, unknown> = { settings }
    if (body.status) patch.status = body.status

    const { error } = await sc.from('automations').update(patch).eq('id', body.automation_id)
    if (error) return jsonError(error.message, 500, {}, cors)

    return json(await buildRegulatorView(), { headers: cors })
  },
)
