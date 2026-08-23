// /api/agent/sequences/etat — la même vue, cadrée sur l'agent.
//
// DEUX ROUTES POUR LA MÊME MÉCANIQUE, comme partout ici : `requireRole` exige
// un rôle EXACT, un admin n'est pas un freelance à qui on aurait ajouté des
// droits. Ce qui change n'est pas le calcul — il est partagé — mais le
// PÉRIMÈTRE : l'agent ne voit que les inscriptions qu'il a lancées.
//
// LE CADRAGE SE FAIT SUR `created_by`, ET NON SUR L'ASSIGNATION DES TÂCHES.
// C'est celui qui a inscrit le prospect qui doit voir où il est garé : une
// inscription sans tâche ouverte — le cas qu'on cherche justement à montrer —
// n'a par définition aucun assigné à qui la rattacher.
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

export const GET = withAuth({ role: 'freelance' }, async ({ user, cors }) => {
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

  const inscRes = await sb
    .from('sequence_enrollments')
    .select('id, automation_id, current_step, status, next_run_at, send_at, hold_reason, entered_at, updated_at')
    .in('automation_id', sequences.map((s) => s.id))
    .eq('created_by', user.id)
  if (inscRes.error) return jsonError(inscRes.error.message, 500, {}, cors)

  const inscriptions = inscRes.data ?? []
  // Les tâches se lisent PAR INSCRIPTION, pas par assigné : une tâche routée
  // vers quelqu'un d'autre porte quand même l'inscription, et l'ignorer
  // compterait comme « garée » une inscription qui ne l'est pas.
  const ids = inscriptions.map((i) => i.id)
  const tachesRes = ids.length
    ? await sb
        .from('prospection_tasks')
        .select('enrollment_id, status, due_at, kind')
        .in('status', ['pending', 'snoozed'])
        .in('enrollment_id', ids)
    : { data: [], error: null }
  if (tachesRes.error) return jsonError(tachesRes.error.message, 500, {}, cors)

  const etat = etatDesSequences({
    sequences,
    inscriptions,
    taches: tachesRes.data ?? [],
  })

  return json({ sequences: etat, genereLe: new Date().toISOString() }, { headers: cors })
})
