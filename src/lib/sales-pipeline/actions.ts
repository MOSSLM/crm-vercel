// actions.ts — ce qui se passe quand on agit sur une ligne du pipeline commercial.
//
// Côté serveur uniquement (service-role). Partagé entre les routes admin et les
// routes agent : une seule implémentation, donc pas de dérive entre les deux.
//
// Le point critique, c'est l'ANNULATION. Retirer une entreprise d'une séquence
// ne suffit pas : sans annuler les jobs déjà planifiés et les tâches en
// attente, un email part quand même après que le prospect a pris rendez-vous.

import type { SupabaseClient } from '@supabase/supabase-js'
import { cancelEnrollmentWork } from '@/lib/automations/engine'
import { isLostStage, parseColumnId, type SalesReactionId, type SalesRowState } from './stages'

type StatePatch = {
  skipped?: string[]
  skip_reason?: string | null
  state?: SalesRowState
  state_reason?: string | null
  nurture_at?: string | null
  replied?: boolean
  rdv_at?: string | null
  propo_amount?: number | null
  objection?: string | null
  stage_dates?: Record<string, string>
}

type StoredState = {
  opportunite_id: string
  skipped: string[] | null
  state: string
  stage_dates: Record<string, string> | null
  replied: boolean | null
}

async function readState(sb: SupabaseClient, opportuniteId: string): Promise<StoredState | null> {
  const { data } = await sb
    .from('sales_pipeline_state')
    .select('opportunite_id, skipped, state, stage_dates, replied')
    .eq('opportunite_id', opportuniteId)
    .maybeSingle()
  return (data as StoredState | null) ?? null
}

/** Écrit l'état de la ligne, en créant la ligne si elle n'existe pas encore. */
async function writeState(sb: SupabaseClient, opportuniteId: string, patch: StatePatch): Promise<void> {
  await sb
    .from('sales_pipeline_state')
    .upsert({ opportunite_id: opportuniteId, ...patch }, { onConflict: 'opportunite_id' })
}

const today = () => new Date().toISOString().slice(0, 10)

const withDate = (dates: Record<string, string> | null | undefined, columnId: string) => ({
  ...(dates ?? {}),
  [columnId]: today(),
})

/** Les étapes du pipeline choisi, triées, sans l'étape « Perdu ». */
async function pipelineStages(
  sb: SupabaseClient,
  opportuniteId: string,
): Promise<{ pipelineId: string | null; stageId: number | null; stages: { id: number; nom: string; ordre: number }[] }> {
  const { data: opp } = await sb
    .from('opportunites')
    .select('id, stage_id, pipeline_id')
    .eq('id', opportuniteId)
    .maybeSingle()
  if (!opp?.pipeline_id) return { pipelineId: null, stageId: (opp?.stage_id as number | null) ?? null, stages: [] }

  const { data } = await sb
    .from('etapes_pipeline')
    .select('id, nom, ordre')
    .eq('pipeline_id', opp.pipeline_id)
    .order('ordre', { ascending: true })
  return {
    pipelineId: opp.pipeline_id as string,
    stageId: (opp.stage_id as number | null) ?? null,
    stages: (data ?? []) as { id: number; nom: string; ordre: number }[],
  }
}

/**
 * Déplace l'opportunité sur une étape, en avant seulement — un prospect ne
 * recule jamais. « Perdu » fait exception : c'est un état terminal, on l'accepte
 * même s'il est en arrière.
 */
async function moveToStage(sb: SupabaseClient, opportuniteId: string, targetId: number): Promise<void> {
  const { stageId, stages } = await pipelineStages(sb, opportuniteId)
  const target = stages.find((s) => s.id === targetId)
  if (!target) return
  const current = stages.find((s) => s.id === stageId)
  if (!isLostStage(target.nom) && current && current.ordre >= target.ordre) return
  await sb.from('opportunites').update({ stage_id: target.id }).eq('id', opportuniteId)
}

/** Étape du pipeline dont le nom correspond, la première qui matche. */
async function stageMatching(
  sb: SupabaseClient,
  opportuniteId: string,
  patterns: RegExp[],
): Promise<number | null> {
  const { stages } = await pipelineStages(sb, opportuniteId)
  for (const pattern of patterns) {
    const found = stages.find((s) => pattern.test(s.nom))
    if (found) return found.id
  }
  return null
}

/**
 * Inscriptions encore vivantes d'une opportunité. `statuses` restreint au
 * besoin : une reprise après tâche ne concerne que les inscriptions actives,
 * une annulation touche aussi celles en pause.
 */
async function liveEnrollments(
  sb: SupabaseClient,
  opportuniteId: string,
  statuses: string[] = ['active', 'paused'],
): Promise<string[]> {
  const { data } = await sb
    .from('sequence_enrollments')
    .select('id')
    .eq('opportunite_id', opportuniteId)
    .in('status', statuses)
  return ((data ?? []) as { id: string }[]).map((e) => e.id)
}

/**
 * Coupe tout ce qui est encore en vol pour une opportunité : inscriptions,
 * jobs planifiés et tâches manuelles en attente.
 *
 * `mode = 'exited'` est définitif ; `'paused'` reste reprenable.
 */
export async function stopOutreach(
  sb: SupabaseClient,
  opportuniteId: string,
  mode: 'exited' | 'paused',
): Promise<{ enrollments: number; jobs: number; tasks: number }> {
  const ids = await liveEnrollments(sb, opportuniteId)
  let jobs = 0
  let tasks = 0
  for (const id of ids) {
    const cancelled = await cancelEnrollmentWork(sb, id)
    jobs += cancelled.jobs
    tasks += cancelled.tasks
  }
  if (ids.length > 0) {
    await sb
      .from('sequence_enrollments')
      .update({
        status: mode,
        next_run_at: null,
        send_at: null,
        hold_reason: null,
        ...(mode === 'exited' ? { finished_at: new Date().toISOString() } : {}),
      })
      .in('id', ids)
  }
  return { enrollments: ids.length, jobs, tasks }
}

export interface ReactionResult {
  state: SalesRowState
  cancelled: { enrollments: number; jobs: number; tasks: number }
}

/**
 * Les cinq issues du bouton « le prospect a réagi ». C'est le seul endroit où
 * l'utilisateur court-circuite le pipeline — et donc le seul endroit où l'on
 * annule des envois déjà planifiés.
 */
export async function applyReaction(
  sb: SupabaseClient,
  opportuniteId: string,
  reaction: SalesReactionId,
  opts: { reason?: string; nurtureAt?: string; userId?: string | null; skipColumns?: string[] } = {},
): Promise<ReactionResult> {
  const stored = await readState(sb, opportuniteId)

  // « Paused » reste reprenable, « exited » est définitif.
  const mode: 'exited' | 'paused' = reaction === 'reply' ? 'paused' : 'exited'
  const cancelled = await stopOutreach(sb, opportuniteId, mode)

  // Les colonnes non faites que le raccourci fait sauter — l'appelant les
  // connaît (il a les colonnes affichées), on ne les devine pas ici.
  const skipped = [...new Set([...(stored?.skipped ?? []), ...(opts.skipColumns ?? [])])]

  let patch: StatePatch
  let targetStage: number | null = null

  switch (reaction) {
    case 'rdv': {
      patch = {
        skipped,
        skip_reason: opts.reason || 'a pris RDV lui-même',
        state: 'progress',
        replied: true,
      }
      targetStage = await stageMatching(sb, opportuniteId, [/rdv|rendez/i])
      break
    }
    case 'reply': {
      patch = {
        skipped,
        skip_reason: opts.reason || 'a rappelé de lui-même',
        state: 'progress',
        replied: true,
      }
      targetStage = await stageMatching(sb, opportuniteId, [/rdv|rendez/i, /contact/i])
      break
    }
    case 'later': {
      patch = {
        state: 'nurt',
        state_reason: opts.reason || 'Intéressé, mais plus tard',
        nurture_at: opts.nurtureAt ?? null,
        replied: true,
      }
      break
    }
    case 'no': {
      patch = { state: 'lost', state_reason: opts.reason || 'Pas intéressé', replied: true }
      targetStage = await stageMatching(sb, opportuniteId, [/perdu|abandon/i])
      break
    }
    case 'bad':
    default: {
      patch = { state: 'black', state_reason: opts.reason || 'Mauvais numéro / établissement fermé' }
      targetStage = await stageMatching(sb, opportuniteId, [/perdu|abandon/i])
      // Le numéro part en blacklist téléphonie : on ne rappellera plus.
      const { data: opp } = await sb
        .from('opportunites')
        .select('entreprise_id')
        .eq('id', opportuniteId)
        .maybeSingle()
      if (opp?.entreprise_id != null) {
        const { data: ent } = await sb
          .from('entreprises')
          .select('telephone')
          .eq('id', opp.entreprise_id)
          .maybeSingle()
        const phone = (ent?.telephone as string | null)?.replace(/[^\d+]/g, '')
        if (phone) {
          try {
            await sb.from('phone_blacklist').upsert(
              {
                e164: phone,
                reason: opts.reason || 'Pipeline commercial — mauvais numéro / fermé',
                created_by: opts.userId ?? null,
              },
              { onConflict: 'e164' },
            )
          } catch {
            /* la blacklist ne doit pas faire échouer la réaction */
          }
        }
      }
      break
    }
  }

  await writeState(sb, opportuniteId, patch)
  if (targetStage != null) await moveToStage(sb, opportuniteId, targetStage).catch(() => {})

  return { state: patch.state ?? 'progress', cancelled }
}

/**
 * Validation manuelle d'une colonne (« Fait », « Étape faite », « Signé »).
 *
 * Une colonne de SÉQUENCE rend la main à la séquence : la tâche est close et
 * l'inscription avance d'une étape. Une colonne de PIPELINE déplace
 * l'opportunité à l'étape suivante, en avant seulement.
 */
export async function advanceStage(
  sb: SupabaseClient,
  opportuniteId: string,
  columnId: string,
  extra: { amount?: number; objection?: string; rdvAt?: string; nextColumnId?: string } = {},
): Promise<{ state: SalesRowState }> {
  const parsed = parseColumnId(columnId)
  const stored = await readState(sb, opportuniteId)

  const patch: StatePatch = { stage_dates: withDate(stored?.stage_dates, columnId) }
  if (extra.amount != null) patch.propo_amount = extra.amount
  if (extra.objection != null) patch.objection = extra.objection
  if (extra.rdvAt != null) patch.rdv_at = extra.rdvAt

  if (parsed?.group === 'sequence') {
    // Clore les tâches encore ouvertes de cette étape, puis rendre la main.
    await sb
      .from('prospection_tasks')
      .update({ status: 'done', done_at: new Date().toISOString() })
      .eq('opportunite_id', opportuniteId)
      .eq('status', 'pending')
      .eq('step_id', parsed.ref)

    const ids = await liveEnrollments(sb, opportuniteId, ['active'])
    const { advanceEnrollmentAfterTask } = await import('@/lib/automations/engine')
    for (const id of ids) await advanceEnrollmentAfterTask(id).catch(() => {})
  } else if (parsed?.group === 'pipeline') {
    const stageId = Number(parsed.ref)
    const { stages } = await pipelineStages(sb, opportuniteId)
    const usable = stages.filter((s) => !isLostStage(s.nom))
    const at = usable.findIndex((s) => s.id === stageId)

    // Valider la dernière étape du pipeline, c'est signer.
    if (at >= 0 && at === usable.length - 1) {
      await writeState(sb, opportuniteId, { ...patch, state: 'won' })
      await moveToStage(sb, opportuniteId, usable[at].id).catch(() => {})
      return { state: 'won' }
    }
    const next = at >= 0 ? usable[at + 1] : null
    if (next) await moveToStage(sb, opportuniteId, next.id).catch(() => {})
  }

  await writeState(sb, opportuniteId, patch)
  return { state: (stored?.state ?? 'progress') as SalesRowState }
}

/**
 * Réactivation : soit on rouvre une étape sautée (elle cesse d'être barrée),
 * soit on remet toute la ligne en jeu depuis Perdu / Nurturing.
 */
export async function reviveRow(sb: SupabaseClient, opportuniteId: string, columnId?: string): Promise<void> {
  const stored = await readState(sb, opportuniteId)
  if (columnId) {
    const skipped = (stored?.skipped ?? []).filter((s) => s !== columnId)
    await writeState(sb, opportuniteId, {
      skipped,
      skip_reason: skipped.length > 0 ? undefined : null,
    })
    return
  }
  await writeState(sb, opportuniteId, { state: 'progress', state_reason: null, nurture_at: null })
}
