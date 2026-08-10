// /api/automations/week — le plan hebdomadaire des envois.
//
// GET  ?offset=0 : la semaine (départs, relances, tâches à la main, charge du tuyau).
// POST           : une action sur une vague — annuler, rétablir, décaler.
import { json, jsonError } from '@/app/api/_lib/respond'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { withAuth } from '@/app/api/_lib/with-auth'
import { preflight } from '@/app/api/_lib/cors'
import { weekWaveActionSchema, type WeekWaveActionPayload } from '@/app/api/_lib/schemas'
import { buildWeekView, readSkippedSteps, readStepShifts } from './_view'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const OPTIONS = (req: Request) => preflight(req)

const DAY_MS = 86_400_000

export const GET = withAuth({ role: 'admin' }, async ({ req, cors }) => {
  const raw = Number(new URL(req.url).searchParams.get('offset') ?? 0)
  // Une semaine à ±52 : au-delà, la projection ne dit plus rien d'utile et la
  // requête ramènerait un an d'inscriptions pour rien.
  const offset = Number.isFinite(raw) ? Math.max(-52, Math.min(52, Math.trunc(raw))) : 0
  const view = await buildWeekView(offset)
  return json(view, { headers: cors })
})

export const POST = withAuth<WeekWaveActionPayload>(
  { role: 'admin', body: weekWaveActionSchema },
  async ({ body, cors }) => {
    const sb = getServiceClient()

    const { data: auto } = await sb
      .from('automations')
      .select('id, kind')
      .eq('id', body.automation_id)
      .maybeSingle()
    if (!auto || auto.kind !== 'sequence') return jsonError('sequence_introuvable', 404, {}, cors)

    const { data: rows, error } = await sb
      .from('sequence_enrollments')
      .select('id, automation_id, current_step, status, next_run_at, vars')
      .eq('automation_id', body.automation_id)
      .in('id', body.enrollment_ids)
    if (error) return jsonError(error.message, 500, { message: error.message }, cors)

    type Row = {
      id: string
      current_step: number
      status: string
      next_run_at: string | null
      vars: Record<string, unknown> | null
    }
    const enrollments = ((rows ?? []) as Row[]).filter((r) => r.status === 'active' || r.status === 'paused')
    if (enrollments.length === 0) return jsonError('rien_a_modifier', 409, { message: 'Ces inscriptions ne sont plus actives.' }, cors)

    const now = Date.now()

    // Les vagues font quelques dizaines de contacts : une mise à jour par ligne
    // reste raisonnable, et chaque ligne a ses propres `vars`.
    const updates = enrollments.map((row) => {
      const vars = { ...((row.vars as Record<string, unknown>) ?? {}) }
      const skipped = new Set(readSkippedSteps(row.vars))
      const shifts = { ...readStepShifts(row.vars) }
      const patch: Record<string, unknown> = {}

      if (body.action === 'cancel') {
        // Une étape déjà franchie n'est plus annulable : l'email est parti.
        if (row.current_step > body.step_index) return null
        skipped.add(body.step_index)
        vars.skippedSteps = [...skipped].sort((a, b) => a - b)
        patch.vars = vars
      } else if (body.action === 'restore') {
        if (!skipped.delete(body.step_index)) return null
        vars.skippedSteps = [...skipped].sort((a, b) => a - b)
        patch.vars = vars
      } else {
        if (row.current_step > body.step_index) return null
        const days = body.days ?? 0
        shifts[String(body.step_index)] = (shifts[String(body.step_index)] ?? 0) + days
        if (shifts[String(body.step_index)] === 0) delete shifts[String(body.step_index)]
        vars.stepShifts = shifts
        patch.vars = vars
        // L'étape courante porte sa date dans `next_run_at` : c'est elle que le
        // moteur lit. Les étapes suivantes se recalculent depuis `entered_at`,
        // donc la marque dans `vars` suffit.
        if (row.current_step === body.step_index && row.next_run_at) {
          const at = Date.parse(row.next_run_at)
          if (Number.isFinite(at)) {
            patch.next_run_at = new Date(Math.max(now, at + days * DAY_MS)).toISOString()
          }
        }
      }

      return { id: row.id, patch }
    })

    const pending = updates.filter((u): u is { id: string; patch: Record<string, unknown> } => u != null)
    if (pending.length === 0) {
      return jsonError('rien_a_modifier', 409, { message: 'Ces envois sont déjà partis.' }, cors)
    }

    const CHUNK = 20
    for (let i = 0; i < pending.length; i += CHUNK) {
      const slice = pending.slice(i, i + CHUNK)
      const results = await Promise.all(
        slice.map((u) => sb.from('sequence_enrollments').update(u.patch).eq('id', u.id)),
      )
      const failed = results.find((r) => r.error)
      if (failed?.error) return jsonError(failed.error.message, 500, { message: failed.error.message }, cors)
    }

    return json(
      { ok: true, updated: pending.length, skipped: enrollments.length - pending.length },
      { headers: cors },
    )
  },
)
