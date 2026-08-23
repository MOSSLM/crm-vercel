// /api/prospection/sequences/etat — où en sont les inscrits, bloc par bloc.
//
// CETTE ROUTE NE CALCULE RIEN. Elle pose trois requêtes et laisse
// `@/lib/prospection/etat-sequences` faire l'arithmétique — l'idiome de
// `/api/agent/entonnoir` et pour la même raison : la mesure se teste sans base,
// et l'écran ne peut afficher que ce qui a été compté.
//
// ON LIT LES SÉQUENCES `on` **ET** `off`, jamais les archivées. Une séquence
// mise en pause avec cinq cents inscrits dedans est exactement le cas qu'on
// cherche à voir ; la masquer parce qu'elle est en pause reproduirait le trou
// qu'on bouche.
//
// PAS DE PAGINATION, ET C'EST MESURÉ : 677 inscriptions et 129 tâches ouvertes
// en production le 23/08/2026. Le jour où ça ne tient plus, c'est un `count`
// groupé côté base qu'il faudra — pas une page de plus.
import { json, jsonError } from '@/app/api/_lib/respond'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { withAuth } from '@/app/api/_lib/with-auth'
import { preflight } from '@/app/api/_lib/cors'
import { etatDesSequences, type SequenceBrute } from '@/lib/prospection/etat-sequences'
import type { SequenceDefinition, SequenceStep } from '@/components/automations/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const OPTIONS = (req: Request) => preflight(req)

type LigneSequence = {
  id: string
  name: string | null
  status: string | null
  definition: SequenceDefinition | null
}

const etapesDe = (def: SequenceDefinition | null): SequenceBrute['steps'] =>
  (Array.isArray(def?.steps) ? (def.steps as SequenceStep[]) : []).map((s) => ({
    id: s.id,
    kind: s.kind,
    day: s.day ?? 0,
    label: s.label ?? null,
  }))

export const GET = withAuth({ role: 'admin' }, async ({ cors }) => {
  const sb = getServiceClient()

  const seqRes = await sb
    .from('automations')
    .select('id, name, status, definition')
    .eq('kind', 'sequence')
    .in('status', ['on', 'off'])
    .order('name')
  if (seqRes.error) return jsonError(seqRes.error.message, 500, {}, cors)

  const sequences: SequenceBrute[] = ((seqRes.data ?? []) as LigneSequence[]).map((s) => ({
    id: s.id,
    name: s.name,
    status: s.status,
    steps: etapesDe(s.definition),
  }))
  if (sequences.length === 0) return json({ sequences: [], genereLe: new Date().toISOString() }, { headers: cors })

  const ids = sequences.map((s) => s.id)
  const [inscRes, tachesRes] = await Promise.all([
    sb
      .from('sequence_enrollments')
      .select('id, automation_id, current_step, status, next_run_at, send_at, hold_reason, entered_at, updated_at')
      .in('automation_id', ids),
    sb
      .from('prospection_tasks')
      .select('enrollment_id, status, due_at, kind')
      .in('status', ['pending', 'snoozed'])
      .not('enrollment_id', 'is', null),
  ])
  if (inscRes.error) return jsonError(inscRes.error.message, 500, {}, cors)
  if (tachesRes.error) return jsonError(tachesRes.error.message, 500, {}, cors)

  const etat = etatDesSequences({
    sequences,
    inscriptions: inscRes.data ?? [],
    taches: tachesRes.data ?? [],
  })

  return json({ sequences: etat, genereLe: new Date().toISOString() }, { headers: cors })
})
