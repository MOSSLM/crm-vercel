// actions.ts — ce qui se passe quand on agit sur une ligne du pipeline commercial.
//
// Côté serveur uniquement (service-role). Partagé entre les routes admin et les
// routes agent : une seule implémentation, donc pas de dérive entre les deux.
//
// Le point critique, c'est l'ANNULATION. Retirer une entreprise d'une séquence
// ne suffit pas : sans annuler les jobs déjà planifiés et les tâches en
// attente, un email part quand même après que le prospect a pris rendez-vous.

import type { SupabaseClient } from '@supabase/supabase-js'
import { cancelEnrollmentWork, processSequenceEnrollment } from '@/lib/automations/engine'
import { cleanEmail } from '@/lib/automations/regulator-db'
import { verifyEmail, type VerifyResult } from '@/lib/email/verify/service'
import type { VerificationStatus } from '@/lib/email/verify/score'
import type { SequenceDefinition, SequenceEnrollment, SequenceStep } from '@/components/automations/types'
import { declarerReponse } from '@/lib/automations/reply'
import {
  isLostStage,
  isRoleColumn,
  parseColumnId,
  stepColumnId,
  stepOutcome,
  type SalesReactionId,
  type SalesRowState,
} from './stages'
import { findStageByRole, type StageRole } from '@/lib/opportunites/stage-roles'
import type { MessageVariant } from '@/lib/automations/variables'

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

/* ── Ce que le prospect a dit ────────────────────────────────────────────── */

export interface OutcomeResult {
  /** L'issue a-t-elle stoppé la ligne ? */
  stopped: boolean
  /** Une attente-réponse a été libérée : la séquence est repartie. */
  released: boolean
  noteId: string | null
  state: SalesRowState
}

/**
 * Enregistre l'issue d'une étape et ce que la personne a dit.
 *
 * LA NOTE VA DANS `email_logs`, PAS DANS UNE TABLE À PART.
 * `email_logs` est le fil d'échanges d'une entreprise depuis qu'il porte un
 * `channel` : c'est lui que lisent la fiche entreprise, la messagerie et le
 * dernier échange du pipeline. Une table séparée aurait obligé chacun de ces
 * écrans à fusionner deux sources dans le bon ordre — trois occasions de
 * diverger pour un fil qui se lit d'une traite. « Il m'a dit de rappeler en
 * septembre » se range donc juste après le WhatsApp qui l'a provoqué.
 *
 * TROIS EFFETS POSSIBLES, ET ILS NE S'EXCLUENT PAS :
 *   · la note est écrite — toujours, quelle que soit l'issue ;
 *   · une attente-réponse est libérée (`releasesWait`), donc la séquence repart ;
 *   · la ligne change d'état (`reaction`), et si l'issue STOPPE, tous les envois
 *     encore planifiés sont annulés — sans quoi un e-mail partirait après que le
 *     prospect a dit non.
 */
export async function recordOutcome(
  sb: SupabaseClient,
  opportuniteId: string,
  outcomeId: string,
  opts: {
    note?: string
    stepId?: string | null
    columnId?: string | null
    channel?: string | null
    nurtureAt?: string | null
    userId?: string | null
    skipColumns?: string[]
  } = {},
): Promise<OutcomeResult> {
  const outcome = stepOutcome(outcomeId)
  if (!outcome) throw new Error('issue inconnue')

  const note = (opts.note ?? '').trim()
  if (outcome.needsNote && !note) throw new Error('note requise')

  const { data: opp } = await sb
    .from('opportunites')
    .select('id, contact_id, entreprise_id')
    .eq('id', opportuniteId)
    .maybeSingle()

  // L'inscription vivante, pour rattacher la note à SA séquence — et pour
  // savoir s'il y a une attente à libérer.
  const { data: enr } = await sb
    .from('sequence_enrollments')
    .select('id, automation_id, hold_reason')
    .eq('opportunite_id', opportuniteId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()
  const enrollment = enr as { id: string; automation_id: string; hold_reason: string | null } | null

  // `to_email` est `not null` sur la table : une note n'a pas de destinataire,
  // elle rapporte ce qu'on a ENTENDU. On pose une chaîne vide plutôt que de
  // relâcher la contrainte, dont les vrais envois dépendent.
  const { data: inserted } = await sb
    .from('email_logs')
    .insert({
      channel: 'note',
      outcome: outcome.id,
      step_id: opts.stepId ?? null,
      contact_id: opp?.contact_id ?? null,
      entreprise_id: opp?.entreprise_id ?? null,
      opportunite_id: opportuniteId,
      automation_id: enrollment?.automation_id ?? null,
      enrollment_id: enrollment?.id ?? null,
      to_email: '',
      subject: outcome.label,
      body_text: note || null,
      status: 'sent',
      type: 'note',
    })
    .select('id')
    .maybeSingle()

  // Une attente-réponse ne se libère que si l'inscription en attend vraiment
  // une : `declarerReponse` refuse sinon, et c'est voulu — avancer à l'aveugle
  // ferait sauter une étape au prospect.
  let released = false
  if (outcome.releasesWait && enrollment && enrollment.hold_reason === 'awaiting_reply') {
    const r = await declarerReponse(sb, enrollment.id).catch(() => ({ ok: false }))
    released = r.ok
  }

  let state: SalesRowState = 'progress'
  if (outcome.reaction) {
    const applied = await applyReaction(sb, opportuniteId, outcome.reaction, {
      // Le motif affiché sur la carte, c'est ce que la personne a dit — pas le
      // libellé générique de l'issue, qui n'apprend rien à celui qui relit.
      reason: note || outcome.label,
      nurtureAt: opts.nurtureAt ?? undefined,
      userId: opts.userId,
      skipColumns: outcome.flow === 'stop' ? opts.skipColumns : undefined,
    })
    state = applied.state
  }

  return { stopped: outcome.flow === 'stop', released, noteId: inserted?.id ?? null, state }
}

/**
 * Épingle la version de message à employer pour ce prospect.
 *
 * Vit dans `sequence_enrollments.vars` — une décision par inscription, pas un
 * objet du domaine. C'est le SEUL moyen de la faire respecter par un e-mail :
 * il part par le régulateur, sans personne devant l'écran, donc le choix doit
 * être posé avant l'envoi et non au moment du clic.
 */
export async function pinVariant(
  sb: SupabaseClient,
  opportuniteId: string,
  variant: MessageVariant | null,
): Promise<{ enrollments: number }> {
  const { data } = await sb
    .from('sequence_enrollments')
    .select('id, vars')
    .eq('opportunite_id', opportuniteId)
    .in('status', ['active', 'paused'])

  const rows = (data ?? []) as { id: string; vars: Record<string, unknown> | null }[]
  for (const row of rows) {
    const vars = { ...(row.vars ?? {}) }
    // `null` retire l'épingle et rend la main à la règle automatique — on
    // supprime la clé au lieu d'écrire `null`, pour que `readVariant` n'ait
    // qu'un cas à traiter.
    if (variant) vars.variant = variant
    else delete vars.variant
    await sb.from('sequence_enrollments').update({ vars }).eq('id', row.id)
  }
  return { enrollments: rows.length }
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
    const { stages } = await pipelineStages(sb, opportuniteId)
    const usable = stages.filter((s) => !isLostStage(s.nom))
    // En vue fondue, la colonne ne désigne pas une étape mais un RÔLE : les
    // pipelines ne partagent pas leurs identifiants, seulement leur sens. On
    // retrouve donc l'étape correspondante DANS le pipeline de cette affaire —
    // écrire l'étape d'un autre pipeline la déplacerait de pipeline, ce que
    // `trg_sync_opportunity_pipeline_from_stage` fait sans rien dire.
    const stageId = isRoleColumn(columnId)
      ? (findStageByRole(usable, parsed.ref as StageRole)?.id ?? -1)
      : Number(parsed.ref)
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

/* ── L'étape email quand il n'y a pas d'adresse ──────────────────────────── */

/** Les étapes d'une inscription, `wait` compris (le pointeur les compte). */
async function stepsOfEnrollment(sb: SupabaseClient, automationId: string): Promise<SequenceStep[]> {
  const { data } = await sb.from('automations').select('definition').eq('id', automationId).maybeSingle()
  const def = (data?.definition as SequenceDefinition) || { steps: [] }
  return Array.isArray(def.steps) ? def.steps : []
}

export interface SkipEmailResult {
  /** Colonnes marquées « sautée » (identifiants de colonne du tableau). */
  skipped: string[]
  /** Inscriptions avancées jusqu'à l'étape suivante. */
  advanced: number
  /** Libellé du canal repris (« WhatsApp », « Appel »…), pour le retour utilisateur. */
  nextKind: string | null
}

/**
 * Saute l'étape email d'un prospect et enchaîne sur l'étape suivante — en
 * pratique WhatsApp, puisque c'est le canal qui suit l'email dans les séquences
 * de démarchage.
 *
 * Le geste sert surtout aux entreprises sans adresse : plutôt que de les laisser
 * gelées à une étape impossible, on passe au canal qui, lui, est joignable. Les
 * étapes d'attente intercalées sautent avec l'email — attendre trois jours un
 * email qui ne partira jamais n'a aucun sens.
 */
export async function skipEmailStep(
  sb: SupabaseClient,
  opportuniteId: string,
  extraColumns: string[] = [],
): Promise<SkipEmailResult> {
  const stored = await readState(sb, opportuniteId)
  const skippedColumns = new Set<string>(extraColumns)
  let advanced = 0
  let nextKind: string | null = null

  const { data } = await sb
    .from('sequence_enrollments')
    .select('*')
    .eq('opportunite_id', opportuniteId)
    .eq('status', 'active')
  const enrollments = (data ?? []) as SequenceEnrollment[]

  for (const enrollment of enrollments) {
    const steps = await stepsOfEnrollment(sb, enrollment.automation_id)
    let index = enrollment.current_step
    let moved = false
    // On avance tant qu'on tombe sur un email (ou sur l'attente qui le précède).
    while (index < steps.length && (steps[index].kind === 'email' || (moved && steps[index].kind === 'wait'))) {
      if (steps[index].kind === 'email') skippedColumns.add(stepColumnId(steps[index].id))
      index++
      moved = true
    }
    if (!moved) continue

    if (index >= steps.length) {
      await sb
        .from('sequence_enrollments')
        .update({
          current_step: index,
          status: 'finished',
          next_run_at: null,
          send_at: null,
          hold_reason: null,
          finished_at: new Date().toISOString(),
        })
        .eq('id', enrollment.id)
      advanced++
      continue
    }

    nextKind = nextKind ?? steps[index].kind
    await sb
      .from('sequence_enrollments')
      .update({
        current_step: index,
        next_run_at: new Date().toISOString(),
        send_at: null,
        hold_reason: null,
      })
      .eq('id', enrollment.id)
    advanced++

    // L'étape suivante est manuelle : sa tâche est créée tout de suite, sinon le
    // commercial devrait attendre le prochain tick pour voir apparaître le geste.
    const { data: fresh } = await sb.from('sequence_enrollments').select('*').eq('id', enrollment.id).maybeSingle()
    if (fresh) await processSequenceEnrollment(fresh as SequenceEnrollment).catch(() => {})
  }

  const skipped = [...new Set([...(stored?.skipped ?? []), ...skippedColumns])]
  if (skipped.length > 0) {
    await writeState(sb, opportuniteId, {
      skipped,
      skip_reason: 'Étape email sautée — passage au canal suivant',
    })
  }
  return { skipped: [...skippedColumns], advanced, nextKind }
}

export interface SetEmailResult {
  email: string
  /** Où l'adresse a été enregistrée. */
  target: 'entreprise' | 'contact'
  /** Inscriptions dégelées et remises dans la file. */
  resumed: number
  /**
   * Verdict de la vérification, faite dans la foulée. `null` quand le
   * vérificateur n'est pas disponible — l'adresse est alors simplement
   * enregistrée, et le tick de vérification s'en occupera.
   */
  verification: {
    status: VerificationStatus
    /** Phrase française affichable telle quelle. */
    reason: string
    /** Correction proposée si le domaine ressemble à une faute de frappe. */
    suggestion: string | null
  } | null
}

/**
 * Enregistre à la main l'adresse d'un prospect.
 *
 * Elle va dans `entreprises.email` — la colonne où vivent déjà toutes les autres
 * adresses d'entreprise du CRM (saisie manuelle ou synchronisation depuis
 * `lead_magnet_projects.override_email`). Le moteur de séquence s'en sert comme
 * destinataire de repli quand le contact n'a pas d'adresse propre, donc l'envoi
 * redevient possible immédiatement : les inscriptions gelées faute d'adresse
 * repassent dans la file au tick suivant.
 */
export async function setProspectEmail(
  sb: SupabaseClient,
  target: { opportuniteId?: string | null; entrepriseId?: number | null },
  rawEmail: string,
): Promise<{ ok: true; result: SetEmailResult } | { ok: false; error: string }> {
  const email = cleanEmail(rawEmail)
  if (!email) return { ok: false, error: 'email_invalide' }

  let entrepriseId = target.entrepriseId ?? null
  let contactId: string | null = null
  if (target.opportuniteId) {
    const { data: opp } = await sb
      .from('opportunites')
      .select('id, entreprise_id, contact_id')
      .eq('id', target.opportuniteId)
      .maybeSingle()
    if (!opp) return { ok: false, error: 'introuvable' }
    entrepriseId = entrepriseId ?? (opp.entreprise_id as number | null)
    contactId = (opp.contact_id as string | null) ?? null
  }

  let where: SetEmailResult['target']
  if (entrepriseId != null) {
    const { error } = await sb
      .from('entreprises')
      .update({ email, updated_at: new Date().toISOString() })
      .eq('id', entrepriseId)
    if (error) return { ok: false, error: error.message }
    where = 'entreprise'
  } else if (contactId) {
    const { error } = await sb.from('contacts').update({ email }).eq('id', contactId)
    if (error) return { ok: false, error: error.message }
    where = 'contact'
  } else {
    return { ok: false, error: 'aucune_fiche' }
  }

  // On vérifie l'adresse TOUT DE SUITE, avant de dégeler quoi que ce soit :
  // corriger une adresse morte par une autre adresse morte ne doit pas relancer
  // une séquence. Quelques centaines de millisecondes, et l'utilisateur sait
  // immédiatement à quoi s'en tenir plutôt que de le découvrir au prochain tick.
  let verdict: VerifyResult | null = null
  try {
    verdict = await verifyEmail(sb, email, { force: true })
  } catch {
    // Le vérificateur n'est pas une dépendance dure : sans lui, l'adresse est
    // simplement enregistrée et le tick de vérification s'en occupera.
  }

  // Dégel : les inscriptions bloquées repartent tout de suite, sans attendre la
  // relecture différée posée par le ticker. Les trois motifs liés à l'adresse
  // sont concernés — c'est précisément ce que la saisie vient de corriger.
  let resume = sb
    .from('sequence_enrollments')
    .update({ hold_reason: null, send_at: null, next_run_at: new Date().toISOString() })
    .eq('status', 'active')
    .in('hold_reason', ['no_email', 'email_invalid', 'email_pending'])
  resume = target.opportuniteId
    ? resume.eq('opportunite_id', target.opportuniteId)
    : resume.eq('entreprise_id', entrepriseId as number)
  const { data: resumed } = await resume.select('id')

  return {
    ok: true,
    result: {
      email,
      target: where,
      resumed: (resumed ?? []).length,
      verification: verdict
        ? { status: verdict.status, reason: verdict.reason, suggestion: verdict.details.suggestion }
        : null,
    },
  }
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
