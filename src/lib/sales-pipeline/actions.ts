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
import {
  SALES_STAGE_IDS,
  stageIndex,
  type SalesReactionId,
  type SalesStageId,
  type SalesRowState,
} from './stages'

type StatePatch = {
  reached?: SalesStageId
  passed?: SalesStageId[]
  skipped?: SalesStageId[]
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
  reached: string
  passed: string[] | null
  skipped: string[] | null
  state: string
  stage_dates: Record<string, string> | null
  replied: boolean | null
}

async function readState(sb: SupabaseClient, opportuniteId: string): Promise<StoredState | null> {
  const { data } = await sb
    .from('sales_pipeline_state')
    .select('opportunite_id, reached, passed, skipped, state, stage_dates, replied')
    .eq('opportunite_id', opportuniteId)
    .maybeSingle()
  return (data as StoredState | null) ?? null
}

/** Écrit l'état de la ligne, en créant la ligne si elle n'existe pas encore. */
async function writeState(sb: SupabaseClient, opportuniteId: string, patch: StatePatch): Promise<void> {
  await sb.from('sales_pipeline_state').upsert(
    { opportunite_id: opportuniteId, ...patch },
    { onConflict: 'opportunite_id' },
  )
}

const today = () => new Date().toISOString().slice(0, 10)

const withDate = (dates: Record<string, string> | null | undefined, stage: SalesStageId) => ({
  ...(dates ?? {}),
  [stage]: today(),
})

const uniqueStages = (values: (string | undefined | null)[]): SalesStageId[] =>
  [...new Set(values.filter((v): v is string => !!v && stageIndex(v) >= 0))] as SalesStageId[]

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

/**
 * Avancement d'étape du deal sous-jacent, en avant seulement. Le pipeline
 * « Agent SAMA » garde ses propres étapes : on ne les remplace pas, on les
 * synchronise sur les jalons commerciaux qui ont un équivalent.
 */
async function syncOpportunityStage(sb: SupabaseClient, opportuniteId: string, wanted: string[]): Promise<void> {
  const { data: opp } = await sb
    .from('opportunites')
    .select('id, stage_id, pipeline_id')
    .eq('id', opportuniteId)
    .maybeSingle()
  if (!opp?.pipeline_id) return

  const { data: stages } = await sb
    .from('etapes_pipeline')
    .select('id, nom, ordre')
    .eq('pipeline_id', opp.pipeline_id)
    .order('ordre', { ascending: true })
  const list = (stages ?? []) as { id: number; nom: string; ordre: number }[]
  if (list.length === 0) return

  const target = list.find((s) => wanted.some((w) => s.nom.toLowerCase().includes(w.toLowerCase())))
  if (!target) return

  const current = list.find((s) => s.id === opp.stage_id)
  // « Perdu » est un état terminal : on l'accepte même s'il est en arrière.
  const terminal = /perdu/i.test(target.nom)
  if (!terminal && current && current.ordre >= target.ordre) return

  await sb.from('opportunites').update({ stage_id: target.id }).eq('id', opportuniteId)
}

export interface ReactionResult {
  state: SalesRowState
  reached: SalesStageId
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
  opts: { reason?: string; nurtureAt?: string; userId?: string | null } = {},
): Promise<ReactionResult> {
  const stored = await readState(sb, opportuniteId)
  const reached = (stored?.reached ?? 'seq') as SalesStageId
  const reachedIdx = stageIndex(reached)

  // Les étapes non faites avant le point d'arrivée sont marquées « sautées » —
  // elles ne disparaissent pas, on garde la trace de ce qui n'a pas été fait.
  const skipUpTo = (target: SalesStageId, reason: string) => {
    const targetIdx = stageIndex(target)
    const skipped = uniqueStages([
      ...(stored?.skipped ?? []),
      ...SALES_STAGE_IDS.filter((id, i) => i >= reachedIdx && i < targetIdx),
    ])
    return { skipped, skip_reason: reason }
  }

  // « Paused » reste reprenable, « exited » est définitif.
  const mode: 'exited' | 'paused' = reaction === 'reply' ? 'paused' : 'exited'
  const cancelled = await stopOutreach(sb, opportuniteId, mode)

  let patch: StatePatch
  let stageWords: string[] = []

  switch (reaction) {
    case 'rdv': {
      patch = {
        reached: 'rdv',
        passed: uniqueStages([...(stored?.passed ?? []), 'seq', 'email']),
        ...skipUpTo('rdv', opts.reason || 'a pris RDV lui-même'),
        state: 'progress',
        replied: true,
        stage_dates: withDate(stored?.stage_dates, 'rdv'),
      }
      stageWords = ['RDV']
      break
    }
    case 'reply': {
      patch = {
        reached: 'rdv',
        // Il a rappelé : l'étape Appel compte comme faite.
        passed: uniqueStages([...(stored?.passed ?? []), 'seq', 'email', 'call']),
        ...skipUpTo('call', opts.reason || 'a rappelé de lui-même'),
        state: 'progress',
        replied: true,
        stage_dates: withDate(stored?.stage_dates, 'call'),
      }
      stageWords = ['RDV']
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
      patch = {
        state: 'lost',
        state_reason: opts.reason || 'Pas intéressé',
        replied: true,
      }
      stageWords = ['Perdu']
      break
    }
    case 'bad':
    default: {
      patch = {
        state: 'black',
        state_reason: opts.reason || 'Mauvais numéro / établissement fermé',
      }
      stageWords = ['Perdu']
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
          await sb
            .from('phone_blacklist')
            .upsert(
              { e164: phone, reason: opts.reason || 'Pipeline commercial — mauvais numéro / fermé', created_by: opts.userId ?? null },
              { onConflict: 'e164' },
            )
            .then(
              () => undefined,
              () => undefined,
            )
        }
      }
      break
    }
  }

  await writeState(sb, opportuniteId, patch)
  if (stageWords.length > 0) await syncOpportunityStage(sb, opportuniteId, stageWords).catch(() => {})

  return {
    state: patch.state ?? 'progress',
    reached: patch.reached ?? reached,
    cancelled,
  }
}

/**
 * Validation manuelle d'une étape (« Fait », « Étape faite », « Signé »).
 * L'étape passe en « faite », la ligne avance d'un cran. Une tâche manuelle
 * validée rend la main à la séquence, qui reprend là où elle en était.
 */
export async function advanceStage(
  sb: SupabaseClient,
  opportuniteId: string,
  stage: SalesStageId,
  extra: { amount?: number; objection?: string; rdvAt?: string } = {},
): Promise<{ reached: SalesStageId; state: SalesRowState }> {
  const stored = await readState(sb, opportuniteId)
  const passed = uniqueStages([...(stored?.passed ?? []), stage])
  const stageDates = withDate(stored?.stage_dates, stage)

  if (stage === 'signe') {
    await writeState(sb, opportuniteId, { reached: 'signe', passed, state: 'won', stage_dates: stageDates })
    await syncOpportunityStage(sb, opportuniteId, ['signé', 'gagn']).catch(() => {})
    return { reached: 'signe', state: 'won' }
  }

  const patch: StatePatch = { passed, stage_dates: stageDates }
  if (extra.amount != null) patch.propo_amount = extra.amount
  if (extra.objection != null) patch.objection = extra.objection
  if (extra.rdvAt != null) patch.rdv_at = extra.rdvAt

  // Une étape manuelle terminée relance la séquence : le pointeur avance et
  // l'étape suivante est planifiée (l'email repassera par le régulateur).
  const isManual = stage === 'wa' || stage === 'call'
  let resumed = false
  if (isManual) {
    // Seule une inscription ACTIVE reprend la main : une séquence en pause ne
    // repart pas toute seule, sinon la ligne resterait bloquée sur sa cellule.
    const ids = await liveEnrollments(sb, opportuniteId, ['active'])
    for (const id of ids) {
      const { advanceEnrollmentAfterTask } = await import('@/lib/automations/engine')
      await advanceEnrollmentAfterTask(id).catch(() => {})
      resumed = true
    }
    // Les tâches encore ouvertes de cette étape sont closes.
    await sb
      .from('prospection_tasks')
      .update({ status: 'done', done_at: new Date().toISOString() })
      .eq('opportunite_id', opportuniteId)
      .eq('status', 'pending')
      .in('kind', stage === 'wa' ? ['whatsapp', 'linkedin'] : ['call'])
  }

  // Sans séquence pour prendre le relais, on avance nous-mêmes d'un cran.
  const currentIdx = stageIndex(stored?.reached ?? 'seq')
  const stageIdx = stageIndex(stage)
  if (!resumed && stageIdx >= currentIdx) {
    patch.reached = SALES_STAGE_IDS[Math.min(stageIdx + 1, SALES_STAGE_IDS.length - 1)]
  }

  await writeState(sb, opportuniteId, patch)
  if (stage === 'rdv') await syncOpportunityStage(sb, opportuniteId, ['RDV']).catch(() => {})
  if (stage === 'call') await syncOpportunityStage(sb, opportuniteId, ['Contacté']).catch(() => {})

  return {
    reached: (patch.reached ?? stored?.reached ?? 'seq') as SalesStageId,
    state: (stored?.state ?? 'progress') as SalesRowState,
  }
}

/**
 * Réactivation : soit on rouvre une étape sautée (elle redevient l'étape en
 * cours), soit on remet toute la ligne en jeu depuis Perdu / Nurturing.
 */
export async function reviveRow(
  sb: SupabaseClient,
  opportuniteId: string,
  stage?: SalesStageId,
): Promise<void> {
  const stored = await readState(sb, opportuniteId)
  if (stage) {
    const skipped = (stored?.skipped ?? []).filter((s) => s !== stage) as SalesStageId[]
    await writeState(sb, opportuniteId, {
      skipped,
      reached: stage,
      skip_reason: skipped.length > 0 ? undefined : null,
    })
    return
  }
  await writeState(sb, opportuniteId, {
    state: 'progress',
    state_reason: null,
    nurture_at: null,
  })
}
