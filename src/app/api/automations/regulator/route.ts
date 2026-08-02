// /api/automations/regulator — lecture et réglage du régulateur d'envoi.
//
// GET   : l'état complet (file planifiée, envois du jour, séquences, équipe).
// PATCH : les réglages globaux — débit, plafond, plages par défaut, garde-fous,
//         règle d'attribution des tâches manuelles.
import { json, jsonError } from '@/app/api/_lib/respond'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { withAuth } from '@/app/api/_lib/with-auth'
import { preflight } from '@/app/api/_lib/cors'
import { regulatorSettingsSchema, type RegulatorSettingsPayload } from '@/app/api/_lib/schemas'
import { normalizeWindows, overlappingWindows } from '@/lib/automations/regulator'
import { resetTestGuardCache } from '@/lib/email/test-guard'
import { buildRegulatorView } from './_view'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const OPTIONS = (req: Request) => preflight(req)

export const GET = withAuth({ role: 'admin' }, async ({ cors }) => {
  const view = await buildRegulatorView()
  return json(view, { headers: cors })
})

export const PATCH = withAuth<RegulatorSettingsPayload>(
  { role: 'admin', body: regulatorSettingsSchema },
  async ({ body, cors }) => {
    const patch: Record<string, unknown> = {}

    if (body.gap_min_minutes != null) patch.gap_min_minutes = body.gap_min_minutes
    if (body.gap_max_minutes != null) patch.gap_max_minutes = body.gap_max_minutes
    // La borne haute ne peut pas passer sous la borne basse : la contrainte
    // existe en base, autant renvoyer une erreur lisible plutôt qu'un 500.
    const lo = body.gap_min_minutes
    const hi = body.gap_max_minutes
    if (lo != null && hi != null && hi < lo) {
      return jsonError('ecart_incoherent', 400, { message: 'L’écart maximum doit être ≥ à l’écart minimum.' }, cors)
    }

    if (body.daily_cap != null) patch.daily_cap = body.daily_cap
    if (body.company_gap_minutes != null) patch.company_gap_minutes = body.company_gap_minutes
    if (body.paused != null) patch.paused = body.paused
    if (body.count_all_sequences != null) patch.count_all_sequences = body.count_all_sequences
    if (body.one_per_day_per_contact != null) patch.one_per_day_per_contact = body.one_per_day_per_contact
    if (body.exit_on_reply != null) patch.exit_on_reply = body.exit_on_reply
    if (body.business_days_only != null) patch.business_days_only = body.business_days_only
    if (body.timezone != null) patch.timezone = body.timezone
    if (body.task_routing_mode != null) patch.task_routing_mode = body.task_routing_mode
    if (body.task_max_per_agent != null) patch.task_max_per_agent = body.task_max_per_agent
    if (body.admin_user_id !== undefined) patch.admin_user_id = body.admin_user_id
    if (body.test_mode != null) patch.test_mode = body.test_mode

    if (body.default_windows != null) {
      const windows = normalizeWindows(body.default_windows)
      if (overlappingWindows(windows).size > 0) {
        return jsonError('plages_chevauchantes', 400, { message: 'Deux plages se chevauchent.' }, cors)
      }
      patch.default_windows = windows
    }

    if (Object.keys(patch).length === 0) {
      return jsonError('rien_a_modifier', 400, {}, cors)
    }

    const sc = getServiceClient()
    // La ligne « global » est créée par la migration ; on la recrée au besoin
    // pour qu'un CRM neuf ne reste pas coincé sur un 404.
    const { error } = await sc
      .from('regulator_settings')
      .upsert({ id: 'global', ...patch }, { onConflict: 'id' })
    if (error) return jsonError(error.message, 500, {}, cors)

    // Le garde-fou d'envoi met les réglages en cache quelques secondes :
    // activer ou couper la phase de test doit prendre effet immédiatement.
    resetTestGuardCache()

    const view = await buildRegulatorView()
    return json(view, { headers: cors })
  },
)
