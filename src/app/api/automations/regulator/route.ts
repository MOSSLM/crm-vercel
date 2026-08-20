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
import { isSchemaGap, migrationMessage } from '@/app/api/_lib/schema-gap'
import { normalizeWindows, overlappingWindows } from '@/lib/automations/regulator'
import { resetSendGuardCache } from '@/lib/email/send-guard'
import { resetTestGuardCache } from '@/lib/email/test-guard'
import { TEST_GUARD_MIGRATION, VERIFY_MIGRATION, buildRegulatorView } from './_view'

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
    // Le tableau vide est une valeur : « plus rien n'est suspendu ». D'où
    // `!= null` et pas un test de longueur — rouvrir tous les canaux d'un coup
    // doit pouvoir se dire.
    if (body.canaux_suspendus != null) patch.canaux_suspendus = body.canaux_suspendus

    if (body.verify_before_send != null) patch.verify_before_send = body.verify_before_send
    if (body.verify_ttl_days != null) patch.verify_ttl_days = body.verify_ttl_days
    if (body.risky_daily_share != null) patch.risky_daily_share = body.risky_daily_share
    if (body.domain_first_touch != null) patch.domain_first_touch = body.domain_first_touch
    if (body.bounce_guard != null) patch.bounce_guard = body.bounce_guard
    if (body.bounce_guard_threshold != null) patch.bounce_guard_threshold = body.bounce_guard_threshold

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
    if (error) {
      // Une colonne absente n'est pas une panne : c'est une migration qu'on n'a
      // pas jouée. Le dire, plutôt que renvoyer un 500 muet que l'interface
      // traduisait en « Enregistrement impossible ».
      if (isSchemaGap(error)) {
        const verifyKeys = [
          'verify_before_send',
          'verify_ttl_days',
          'risky_daily_share',
          'domain_first_touch',
          'bounce_guard',
          'bounce_guard_threshold',
        ]
        const file = verifyKeys.some((key) => key in patch)
          ? VERIFY_MIGRATION
          : 'test_mode' in patch
            ? TEST_GUARD_MIGRATION
            : 'la migration du dossier sql/ correspondante'
        return jsonError(
          'migration_non_appliquee',
          503,
          {
            sql_file: file,
            detail: error.message,
            message: migrationMessage(file, 'Ce réglage n’existe pas encore en base'),
          },
          cors,
        )
      }
      return jsonError(error.message, 500, { message: error.message }, cors)
    }

    // Le garde-fou d'envoi met les réglages en cache quelques secondes :
    // activer ou couper la phase de test doit prendre effet immédiatement.
    resetTestGuardCache()
    resetSendGuardCache()

    const view = await buildRegulatorView()
    return json(view, { headers: cors })
  },
)
