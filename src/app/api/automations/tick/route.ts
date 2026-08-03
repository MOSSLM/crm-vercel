// /api/automations/tick — ticker triggered by Vercel cron OR pg_cron.
// Processes the automation_jobs queue + due sequence enrollments.
//
// Les étapes de séquence ne partent plus « dès que next_run_at est passé » :
// les emails passent par LE RÉGULATEUR (une seule file pour tout le CRM, écart
// aléatoire, plages horaires, plafond quotidien, espacement même entreprise).
// Le ticker se contente d'exécuter ce que le régulateur a décidé pour cette
// minute, et d'écrire dans la base l'heure retenue pour tous les autres — c'est
// ce qui permet à l'interface d'afficher un compte à rebours et un motif.
import { json } from '@/app/api/_lib/respond'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { dispatchEvent } from '@/lib/automations/dispatch'
import {
  runWorkflowAutomation,
  processSequenceEnrollment,
  holdForMissingEmail,
  holdForInvalidEmail,
  holdForPendingVerification,
} from '@/lib/automations/engine'
import {
  buildQueueItems,
  loadDueEnrollments,
  loadQueueEmailContext,
  loadRegulatorSettings,
  loadSendHistory,
  planFromContext,
} from '@/lib/automations/regulator-db'
import { enqueueVerification } from '@/lib/email/verify/service'
import { tripBounceGuard } from '@/lib/email/bounce-guard'
import type { Automation, AutomationJob, SequenceEnrollment } from '@/components/automations/types'
import type { RunContext as EngineContext } from '@/lib/automations/engine'

export const runtime = 'nodejs'
export const maxDuration = 60

/** After this many failed attempts the job is terminal (status='error'). */
const MAX_ATTEMPTS = 3

/**
 * Combien d'emails de séquence au maximum sur un même tick. Le régulateur
 * espace déjà les départs de plusieurs minutes : en pratique un seul est dû par
 * minute. La borne protège d'un rattrapage massif après une longue coupure.
 */
const MAX_SENDS_PER_TICK = 5

/**
 * Verifies the tick request:
 *   - prod: at least one of CRON_SECRET / PG_CRON_SECRET MUST be set AND match → fail-closed
 *   - dev/test: when neither secret is configured, allow (local cron testing)
 */
const verifyTick = (req: Request): boolean => {
  const cronSecret = process.env.CRON_SECRET
  const pgCronSecret = process.env.PG_CRON_SECRET

  if (process.env.NODE_ENV === 'production' && !cronSecret && !pgCronSecret) {
    return false
  }

  if (!cronSecret && !pgCronSecret) return true

  const auth = req.headers.get('authorization')
  const pgHeader = req.headers.get('x-pg-cron-secret')
  const validVercel = !!cronSecret && auth === `Bearer ${cronSecret}`
  const validPgCron = !!pgCronSecret && pgHeader === pgCronSecret
  return validVercel || validPgCron
}

async function handle(req: Request): Promise<Response> {
  if (!verifyTick(req)) return json({ error: 'Unauthorized' }, { status: 401 })

  const sb = getServiceClient()
  const now = new Date().toISOString()
  const result = {
    events: 0,
    workflowJobs: 0,
    sequenceSteps: 0,
    emailsSent: 0,
    emailsQueued: 0,
    emailsBlocked: 0,
    emailsNoAddress: 0,
    /** Retenus par la phase de test : rien préparé, rien avancé. */
    emailsTestHeld: 0,
    /** Adresse qui ne recevra pas : gelée en attendant une correction. */
    emailsInvalid: 0,
    /** Adresse sans verdict frais : gelée le temps de la vérifier. */
    emailsUnverified: 0,
    /** Le disjoncteur a-t-il coupé la file sur ce tick ? */
    bounceGuardTripped: false as boolean | string,
    errors: 0,
  }

  // 1. Événements CRM en attente
  const { data: eventJobs } = await sb
    .from('automation_jobs')
    .select('*')
    .eq('job_type', 'scheduled_trigger')
    .eq('status', 'pending')
    .lte('run_at', now)
    .limit(50)
  for (const job of (eventJobs ?? []) as AutomationJob[]) {
    await sb.from('automation_jobs').update({ status: 'processing' }).eq('id', job.id)
    try {
      await dispatchEvent(job.payload)
      await sb.from('automation_jobs').update({ status: 'done' }).eq('id', job.id)
      result.events++
    } catch (e) {
      result.errors++
      const nextAttempts = (job.attempts ?? 0) + 1
      const terminal = nextAttempts >= MAX_ATTEMPTS
      await sb
        .from('automation_jobs')
        .update({
          status: terminal ? 'error' : 'pending',
          attempts: nextAttempts,
          last_error: String(e),
        })
        .eq('id', job.id)
    }
  }

  // 2. Reprise de workflows après un délai
  const { data: wfJobs } = await sb
    .from('automation_jobs')
    .select('*')
    .eq('job_type', 'workflow_node')
    .eq('status', 'pending')
    .lte('run_at', now)
    .limit(50)
  for (const job of (wfJobs ?? []) as AutomationJob[]) {
    await sb.from('automation_jobs').update({ status: 'processing' }).eq('id', job.id)
    try {
      const { data: auto } = await sb.from('automations').select('*').eq('id', job.automation_id).maybeSingle()
      if (auto) {
        const payload = job.payload as { node_id: string; context: EngineContext }
        await runWorkflowAutomation(auto as Automation, payload.context, {
          runId: job.run_id ?? undefined,
          startNodeId: payload.node_id,
        })
      }
      await sb.from('automation_jobs').update({ status: 'done' }).eq('id', job.id)
      result.workflowJobs++
    } catch (e) {
      result.errors++
      const nextAttempts = (job.attempts ?? 0) + 1
      const terminal = nextAttempts >= MAX_ATTEMPTS
      await sb
        .from('automation_jobs')
        .update({
          status: terminal ? 'error' : 'pending',
          attempts: nextAttempts,
          last_error: String(e),
        })
        .eq('id', job.id)
    }
  }

  // 3. Étapes de séquence dues
  const nowMs = Date.parse(now)
  const settings = await loadRegulatorSettings(sb)
  const { emails, noEmail, testHeld, invalidEmail, unverified, others, addressOf } =
    await loadDueEnrollments(sb, nowMs)

  // 3a. Les étapes non-email (WhatsApp, appel, LinkedIn, attente) ne passent pas
  //     par la file : elles créent une tâche ou avancent le pointeur tout de suite.
  for (const { enrollment } of others) {
    try {
      await processSequenceEnrollment(enrollment)
      result.sequenceSteps++
    } catch {
      result.errors++
    }
  }

  // 3a bis. Étape email sans destinataire : on ne prépare aucun envoi et la
  //         séquence n'avance pas. Le motif est écrit dans l'inscription pour
  //         que le pipeline commercial affiche le drapeau « sans email ».
  for (const { enrollment } of noEmail) {
    try {
      await holdForMissingEmail(sb, enrollment.id)
      result.emailsNoAddress++
    } catch {
      result.errors++
    }
  }

  // 3a ter. Phase de test, destinataire hors liste blanche : on ne prépare rien
  //         et l'inscription n'avance pas. `next_run_at` reste tel quel — dès
  //         qu'on coupe la phase de test ou qu'on ajoute l'adresse à la liste,
  //         le tick suivant envoie sans qu'on ait à réveiller quoi que ce soit.
  for (const { enrollment } of testHeld) {
    try {
      if (enrollment.hold_reason === 'test_hold') {
        // Déjà gelée : rien à préparer, rien à re-journaliser.
        if (enrollment.send_at) {
          await sb.from('sequence_enrollments').update({ send_at: null }).eq('id', enrollment.id)
        }
      } else {
        // Premier passage : le moteur prépare l'envoi, le journalise avec son
        // motif — on veut lire ce qui SERAIT parti — puis gèle l'inscription.
        await processSequenceEnrollment(enrollment)
      }
      result.emailsTestHeld++
    } catch {
      result.errors++
    }
  }

  // 3a quater. L'adresse ne recevra pas (domaine mort, syntaxe cassée, rebond
  //            dur déjà encaissé). L'inscription gèle avec son motif : elle
  //            n'est pas perdue, elle attend une correction. Saisir une nouvelle
  //            adresse depuis le pipeline la dégèle toute seule.
  for (const { enrollment } of invalidEmail) {
    try {
      await holdForInvalidEmail(sb, enrollment.id)
      result.emailsInvalid++
    } catch {
      result.errors++
    }
  }

  // 3a quinquies. Pas de verdict frais : blocage PROVISOIRE. On inscrit
  //               l'adresse en file de vérification et on gèle sans repousser
  //               `next_run_at` — le tick de vérification lève l'attente tout
  //               seul, en général en quelques minutes.
  for (const { enrollment } of unverified) {
    try {
      await enqueueVerification(sb, addressOf.get(enrollment.id))
      await holdForPendingVerification(sb, enrollment.id)
      result.emailsUnverified++
    } catch {
      result.errors++
    }
  }

  // 3b. Les emails passent par le régulateur.
  if (emails.length > 0) {
    // Le disjoncteur, AVANT toute planification. Si le taux de rebond réel a
    // dérapé sur les dernières vingt-quatre heures, la file se gèle d'elle-même
    // et l'admin est prévenu. C'est la seule protection qui ne repose sur aucune
    // prédiction : peu importe comment les adresses ont été classées, si la
    // réalité dérape, tout s'arrête.
    //
    // Consulté ici et pas plus haut : un tick sans rien à envoyer n'a rien à
    // couper, et doit rester gratuit — il repasse toutes les minutes.
    const guard = await tripBounceGuard(sb, settings)
    const planSettings = guard.tripped ? { ...settings, paused: true } : settings
    if (guard.tripped) result.bounceGuardTripped = guard.detail ?? true

    const history = await loadSendHistory(sb, planSettings, nowMs)
    // Ce que la file doit savoir des adresses : lesquelles portent un signal
    // négatif (quota), et quels domaines d'entreprise restent à éprouver.
    const emailContext = await loadQueueEmailContext(sb, addressOf, planSettings, history.emailsToday)
    // `planSettings` et pas `settings` : c'est ce qui fait que la coupure vaut
    // pour le tick courant. Avec les réglages d'origine, les emails de CETTE
    // minute partiraient malgré le disjoncteur.
    const ctx = { settings: planSettings, history, now: nowMs, emailContext }
    const plan = planFromContext(buildQueueItems(emails, ctx), ctx)
    const byId = new Map(emails.map((e) => [e.enrollment.id, e.enrollment]))

    let sent = 0
    for (const slot of plan) {
      const enrollment = byId.get(slot.id) as SequenceEnrollment | undefined
      if (!enrollment) continue

      // Bloqué (pause, plafond, séquence arrêtée) : on garde la trace du motif et
      // on repassera au tick suivant. Rien n'est perdu.
      if (slot.at == null) {
        result.emailsBlocked++
        await sb
          .from('sequence_enrollments')
          .update({ send_at: null, hold_reason: slot.reason })
          .eq('id', enrollment.id)
        continue
      }

      // L'heure retenue n'est pas encore là : on l'inscrit pour que l'interface
      // affiche le compte à rebours et le motif du report.
      if (slot.at > nowMs || sent >= MAX_SENDS_PER_TICK) {
        result.emailsQueued++
        await sb
          .from('sequence_enrollments')
          .update({ send_at: new Date(slot.at).toISOString(), hold_reason: slot.reason })
          .eq('id', enrollment.id)
        continue
      }

      try {
        await processSequenceEnrollment(enrollment)
        result.sequenceSteps++
        result.emailsSent++
        sent++
      } catch {
        result.errors++
      }
    }
  }

  return json({ ok: true, at: now, regulatorPaused: settings.paused, ...result })
}

export async function GET(req: Request) {
  return handle(req)
}
export async function POST(req: Request) {
  return handle(req)
}
