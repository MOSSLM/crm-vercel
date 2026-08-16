// week.ts — le plan hebdomadaire des envois : quel jour, dans quel ordre, à quelle heure.
//
// Les séquences décident QUOI envoyer, le régulateur décide QUAND à la minute
// près, et cette vue-ci répond à la question du milieu : « à quoi ressemble ma
// semaine ? ». Elle projette, pour chaque inscription active, la date de chacune
// de ses étapes, regroupe les inscriptions qui reçoivent la même étape le même
// jour (une « vague »), puis pose ces vagues dans les plages d'envoi comme le
// régulateur le fera réellement.
//
// Comme `regulator.ts`, ce module est PUR : ni base, ni horloge implicite. Tout
// ce qu'il sait lui est passé en paramètre, donc tout est testable.

import type { SeqStepKind, SequenceStep } from '@/components/automations/types'
import {
  DAY_MINUTES,
  MINUTE,
  localClock,
  localDayBounds,
  normalizeWindows,
  windowMinutes,
  windowsUnion,
  type RegulatorSettings,
  type SendWindow,
} from './regulator'

const DAY_MS = DAY_MINUTES * MINUTE

export const WEEK_DAY_NAMES = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'] as const
export const WEEK_MONTHS = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
] as const

/** Les étapes qui partent toutes seules ; les autres passent par une tâche à la main. */
export const AUTO_KINDS: ReadonlySet<SeqStepKind> = new Set<SeqStepKind>(['email'])

/* ── Entrées ─────────────────────────────────────────────────────────────── */

export interface WeekSequenceInput {
  id: string
  name: string
  /** `on` | `paused` | `draft` | `error` — seul `on` envoie. */
  status: string
  steps: SequenceStep[]
  /** Plages propres à la séquence ; vide → plages par défaut du régulateur. */
  windows: SendWindow[]
  priority: number
  dailyCap: number | null
  /** Nombre d'inscriptions actives, tous jours confondus (pour le panneau latéral). */
  activeEnrollments?: number
}

export interface WeekEnrollmentInput {
  id: string
  automationId: string
  /** Index de l'étape à exécuter ensuite (0-based). */
  currentStep: number
  status: string
  /** ISO — origine des J+n tant qu'aucune ancre n'a été posée. */
  enteredAt: string
  /** ISO, ou null. Fait foi pour l'étape courante. */
  nextRunAt: string | null
  contactId: string | null
  entrepriseId: number | null
  /** Pourquoi l'étape courante n'avance pas (cf. `HoldReason`), ou null. */
  holdReason: string | null
  /** Étapes annulées à la main depuis la vue semaine (index 0-based). */
  skippedSteps: number[]
  /** Décalages en jours posés à la main, par index d'étape. */
  stepShifts: Record<string, number>
  /** ISO de la dernière reprise réelle, ou null (cf. `stepStartMs`). */
  anchorAt?: string | null
  /** Étape où l'ancre a été posée, ou null. */
  anchorStep?: number | null
}

/** D'où se comptent les J+n d'une inscription. */
export interface StepAnchor {
  /** `entered_at` en ms — l'origine par défaut. */
  enteredMs: number
  /** `anchor_at` en ms, ou null quand l'inscription n'a jamais repris. */
  anchorMs: number | null
  /** `anchor_step`, ou null. Le `day` de cette étape devient le zéro. */
  anchorStep: number | null
}

/**
 * Quand une étape doit partir, en ms.
 *
 * PARTAGÉ ENTRE LE MOTEUR ET LA PRÉVISION, et c'est tout l'intérêt : le moteur
 * (`scheduleNextStep`) décide, cette vue projette. Deux formules séparées
 * dériveraient, et la semaine annoncerait des envois aux mauvais jours.
 *
 * Les J+n restent ceux du builder. Ce qui change, c'est leur origine : après une
 * tâche manuelle faite en retard ou une attente de réponse, l'inscription pose
 * une ancre, et les étapes suivantes se comptent à partir d'elle. Sans ça, une
 * accroche WhatsApp répondue au bout d'une semaine ferait partir la démo dans
 * la seconde, tous ses J+n étant déjà dans le passé.
 */
export function stepStartMs(
  steps: SequenceStep[],
  stepIndex: number,
  anchor: StepAnchor,
  shift = 0,
): number {
  const baseMs = anchor.anchorMs ?? anchor.enteredMs
  // Le `day` de l'étape d'ancrage est le nouveau zéro : sans cette soustraction,
  // une ancre posée à l'étape J+5 rejouerait cinq jours d'attente déjà écoulés.
  const baseDay = anchor.anchorStep != null ? (steps[anchor.anchorStep]?.day ?? 0) : 0
  return baseMs + ((steps[stepIndex]?.day ?? 0) - baseDay + shift) * DAY_MS
}

export interface WeekInput {
  /** Instant courant, en ms. */
  now: number
  /** 0 = semaine en cours, -1 = semaine passée, +1 = semaine prochaine. */
  offset: number
  settings: RegulatorSettings
  sequences: WeekSequenceInput[]
  enrollments: WeekEnrollmentInput[]
  /** Envois réellement partis, par jour local (`2026-08-10` → 42). */
  sentByDay?: Record<string, number>
}

/* ── Sorties ─────────────────────────────────────────────────────────────── */

export type WeekWaveStatus =
  /** L'étape est derrière l'inscription : elle est partie. */
  | 'sent'
  /** En cours d'envoi à la minute où l'on regarde. */
  | 'running'
  /** Prévue, pas encore partie. */
  | 'planned'
  /** En retard : la date est passée mais l'étape n'a pas été franchie. */
  | 'late'
  /** Annulée à la main depuis cette vue. */
  | 'cancelled'
  /** La séquence est en pause : rien ne part. */
  | 'paused'
  /** Tombe un week-end alors que le régulateur ne travaille qu'en semaine. */
  | 'weekend'
  /** Ne rentre plus dans les plages du jour : glisse au lendemain. */
  | 'spilled'

export interface WeekWave {
  /** Stable d'un rafraîchissement à l'autre : séquence + étape + jour. */
  id: string
  automationId: string
  sequenceName: string
  priority: number
  /** Index 0-based de l'étape dans la séquence. */
  stepIndex: number
  /** Rang affiché (1-based). */
  step: number
  /** Nombre total d'étapes de la séquence. */
  steps: number
  kind: SeqStepKind
  label: string
  template: string | null
  /** Première étape de la séquence : c'est un DÉPART, pas une relance. */
  first: boolean
  /** L'étape part-elle toute seule (email) ou faut-il la faire à la main ? */
  manual: boolean
  /** Index du jour dans la semaine, 0 = lundi. */
  day: number
  /** Contacts concernés. */
  count: number
  enrollmentIds: string[]
  status: WeekWaveStatus
  /** Plages effectivement utilisées, en minutes depuis minuit (heure locale). */
  segments: [number, number][]
  startMin: number | null
  endMin: number | null
  /** Temps d'envoi total de la vague, en minutes. */
  durationMin: number
  /** Contacts qui ne rentrent pas dans les plages du jour. */
  overflow: number
  /** La vague franchit le plafond quotidien. */
  capped: boolean
  /**
   * Contacts que le régulateur retient déjà (adresse manquante ou invalide,
   * phase de test, vérification en attente). Ils sont dans la vague mais ne
   * recevront rien tant que le motif tient.
   */
  held: number
  /** Motif de blocage le plus fréquent de la vague, ou null. */
  holdReason: string | null
  /** Décalage manuel appliqué, en jours. */
  shifted: number
  /** L'étape est encore devant l'inscription : on peut agir dessus. */
  actionable: boolean
}

export interface WeekDay {
  /** 0 = lundi. */
  index: number
  name: string
  /** Numéro dans le mois. */
  num: number
  month: string
  /** Clé locale `2026-08-10`. */
  key: string
  /** Minuit local, en ms. */
  startMs: number
  weekend: boolean
  today: boolean
  past: boolean
  future: boolean
  /** Week-end coupé par le réglage « jours ouvrés seulement ». */
  closed: boolean
  /** Union des plages ouvertes ce jour-là. */
  windows: SendWindow[]
  openMinutes: number
  /** Emails planifiés (ou partis) ce jour-là. */
  count: number
  /** Contacts repoussés au lendemain. */
  overflow: number
  /** Contacts hérités du débordement de la veille. */
  carriedIn: number
  /** Minutes d'envoi occupées. */
  busyMinutes: number
  /** Envois réellement journalisés ce jour-là (email_logs). */
  sent: number
  /** Contacts dont l'envoi a été annulé à la main. */
  cancelled: number
  /** Étapes à faire à la main ce jour-là. */
  manualCount: number
}

export interface WeekSequenceSummary {
  id: string
  name: string
  status: string
  priority: number
  windows: SendWindow[]
  dailyCap: number | null
  activeEnrollments: number
  /** Vagues d'emails posées dans la semaine. */
  waves: number
  /** Contacts servis dans la semaine. */
  volume: number
}

export interface WeekPlan {
  offset: number
  /** ISO du lundi local. */
  weekStart: string
  label: string
  now: string
  /** Minute locale courante (pour la ligne « maintenant »). */
  nowMinutes: number
  /** Index du jour courant, ou -1 si la semaine affichée n'est pas la semaine en cours. */
  todayIndex: number
  /** Bornes de la frise horaire, en minutes depuis minuit. */
  timelineFrom: number
  timelineTo: number
  days: WeekDay[]
  waves: WeekWave[]
  sequences: WeekSequenceSummary[]
  totals: {
    /** Emails posés sur la semaine. */
    emails: number
    /** Dont premiers emails de séquence. */
    starts: number
    /** Dont relances. */
    followUps: number
    manual: number
    cancelled: number
    overflow: number
    /** Minutes d'envoi occupées sur la semaine. */
    busyMinutes: number
    /** Minutes de plages ouvertes sur la semaine. */
    openMinutes: number
    /** Envois réellement journalisés sur la semaine. */
    sent: number
  }
  /** Écart moyen entre deux envois, en minutes — la hauteur d'une vague en dépend. */
  averageGap: number
  dailyCap: number
  paused: boolean
  /** Phase de test active : la semaine est planifiée, mais presque rien ne sortira. */
  testMode: boolean
  timezone: string
}

/* ── Repères de temps ────────────────────────────────────────────────────── */

/** Minuit local du jour précédent — passe l'heure d'été sans se décaler. */
const previousLocalDay = (dayStart: number, timezone: string): number =>
  localDayBounds(dayStart - 12 * 60 * MINUTE, timezone).start

/** Minuit local du jour suivant. */
export const nextLocalDay = (dayStart: number, timezone: string): number =>
  localDayBounds(dayStart + 36 * 60 * MINUTE, timezone).start

/** Minuit local du lundi de la semaine contenant `ms`, décalé de `offset` semaines. */
export function startOfLocalWeek(ms: number, timezone: string, offset = 0): number {
  const { weekday } = localClock(ms, timezone)
  // `localClock` rend dimanche = 0 ; la semaine française commence lundi.
  const isoIndex = (weekday + 6) % 7
  let cursor = localDayBounds(ms, timezone).start
  for (let i = 0; i < isoIndex; i++) cursor = previousLocalDay(cursor, timezone)
  const step = offset >= 0 ? nextLocalDay : previousLocalDay
  for (let i = 0; i < Math.abs(offset) * 7; i++) cursor = step(cursor, timezone)
  return cursor
}

/** Les sept jours d'une semaine, à partir de son lundi. */
export function weekDayStarts(weekStart: number, timezone: string): number[] {
  const out: number[] = [weekStart]
  for (let i = 1; i < 7; i++) out.push(nextLocalDay(out[i - 1], timezone))
  return out
}

/** Libellé « 4 août – 10 août ». */
export function weekLabel(days: WeekDay[]): string {
  if (days.length < 7) return ''
  const a = days[0]
  const b = days[6]
  return `${a.num} ${a.month} – ${b.num} ${b.month}`
}

/* ── Placement d'une vague dans les plages ───────────────────────────────── */

export interface Placement {
  segments: [number, number][]
  /** Minutes qui n'ont pas trouvé de place dans la journée. */
  leftover: number
}

/**
 * Pose `minutes` d'envoi à partir de `from`, en ne remplissant que les plages
 * ouvertes. Une vague coupée par la pause de midi rend deux segments.
 */
export function placeInWindows(from: number, minutes: number, windows: SendWindow[]): Placement {
  const wins = normalizeWindows(windows)
  const segments: [number, number][] = []
  let left = minutes
  let cursor = from

  for (const [a, b] of wins) {
    if (left <= 0.01) break
    const start = Math.max(cursor, a)
    if (start >= b) continue
    const take = Math.min(left, b - start)
    segments.push([start, start + take])
    left -= take
    cursor = start + take
  }

  return { segments, leftover: Math.max(0, left) }
}

/* ── Construction du plan ────────────────────────────────────────────────── */

interface RawWave {
  key: string
  automationId: string
  stepIndex: number
  day: number
  enrollmentIds: string[]
  cancelledIds: string[]
  /** Toutes les inscriptions de la vague ont déjà franchi l'étape. */
  doneIds: string[]
  /** Inscriptions retenues par le régulateur, avec leur motif. */
  holds: string[]
  shifted: number
}

/**
 * Motifs qui retiennent VRAIMENT un envoi : le contact reste dans la vague mais
 * ne recevra rien tant que rien ne bouge. Les motifs de simple report d'horaire
 * (`out_of_window`, `next_day`, `company_gap`, `daily_cap`) ne sont pas ici :
 * eux, la frise les raconte déjà.
 */
const BLOCKING_HOLDS = new Set([
  'no_email',
  'email_invalid',
  'email_pending',
  'test_hold',
  'sequence_paused',
  'global_pause',
  // Une attente de réponse retient bien la séquence, et la semaine doit le dire
  // — mais c'est le fonctionnement normal d'une étape, pas un incident.
  'awaiting_reply',
  // Le message promet un audit que l'entreprise n'a pas. Se lève tout seul dès
  // que le site est mesuré : la relecture repasse toutes les deux heures.
  'lien_manquant',
  // Idem pour la démo : le site n'est pas encore « Prêt à envoyer ».
  'demo_manquante',
  // L'étape n'a ni modèle ni texte : elle retient la séquence jusqu'à ce que
  // quelqu'un écrive le message. C'est un vrai blocage, pas un report d'horaire.
  'message_vide',
])

/**
 * Le plan de la semaine, tel que l'interface le dessine.
 *
 * Projection : une inscription entrée le lundi dans une séquence dont l'étape 3
 * est à J+4 verra cette étape le vendredi — c'est exactement la règle du moteur
 * (`entered_at + step.day`), donc la vue ne raconte pas une autre histoire que
 * ce qui partira vraiment.
 */
export function buildWeekPlan(input: WeekInput): WeekPlan {
  const { now, offset, settings } = input
  const tz = settings.timezone
  const averageGap = Math.max(0.5, (settings.gapMinMinutes + settings.gapMaxMinutes) / 2)

  const weekStart = startOfLocalWeek(now, tz, offset)
  const starts = weekDayStarts(weekStart, tz)
  const todayKey = localClock(now, tz).dayKey
  const nowMinutes = localClock(now, tz).minutes

  const seqById = new Map(input.sequences.map((s) => [s.id, s]))
  const defaultWindows = normalizeWindows(settings.defaultWindows)
  const windowsOf = (seq: WeekSequenceInput): SendWindow[] => {
    const own = normalizeWindows(seq.windows)
    return own.length ? own : defaultWindows
  }

  const days: WeekDay[] = starts.map((startMs, index) => {
    const { dayKey, weekday } = localClock(startMs + 12 * 60 * MINUTE, tz)
    const date = new Date(startMs + 12 * 60 * MINUTE)
    const parts = dayKey.split('-')
    const weekend = weekday === 0 || weekday === 6
    const today = dayKey === todayKey
    return {
      index,
      name: WEEK_DAY_NAMES[index],
      num: Number(parts[2]) || date.getUTCDate(),
      month: WEEK_MONTHS[(Number(parts[1]) || 1) - 1],
      key: dayKey,
      startMs,
      weekend,
      today,
      past: !today && startMs < now,
      future: !today && startMs > now,
      closed: weekend && settings.businessDaysOnly,
      windows: [],
      openMinutes: 0,
      count: 0,
      overflow: 0,
      carriedIn: 0,
      busyMinutes: 0,
      sent: input.sentByDay?.[dayKey] ?? 0,
      cancelled: 0,
      manualCount: 0,
    }
  })

  const dayIndexOf = new Map(days.map((d) => [d.key, d.index]))

  /* ── 1. Projection : chaque inscription pose ses étapes sur le calendrier ── */

  const rawByKey = new Map<string, RawWave>()

  for (const enrollment of input.enrollments) {
    const seq = seqById.get(enrollment.automationId)
    if (!seq) continue
    const steps = seq.steps
    if (!steps.length) continue

    const entered = Date.parse(enrollment.enteredAt)
    if (!Number.isFinite(entered)) continue
    const nextRun = enrollment.nextRunAt ? Date.parse(enrollment.nextRunAt) : NaN
    const stopped = enrollment.status !== 'active' && enrollment.status !== 'paused'
    const anchorParsed = enrollment.anchorAt ? Date.parse(enrollment.anchorAt) : NaN
    const anchor: StepAnchor = {
      enteredMs: entered,
      anchorMs: Number.isFinite(anchorParsed) ? anchorParsed : null,
      anchorStep: enrollment.anchorStep ?? null,
    }

    for (let j = 0; j < steps.length; j++) {
      const step = steps[j]
      if (step.kind === 'wait') continue

      const done = j < enrollment.currentStep
      // Une inscription arrêtée (répondu, sortie, terminée) n'a plus d'avenir :
      // afficher ses étapes suivantes ferait miroiter des envois qui ne
      // partiront jamais.
      if (!done && stopped) break

      const shift = Number(enrollment.stepShifts?.[String(j)] ?? 0) || 0
      const at =
        !done && j === enrollment.currentStep && Number.isFinite(nextRun)
          ? nextRun
          : stepStartMs(steps, j, anchor, shift)

      const key = localClock(at, tz).dayKey
      const dayIndex = dayIndexOf.get(key)
      if (dayIndex == null) continue

      const waveKey = `${seq.id}|${j}|${dayIndex}`
      let wave = rawByKey.get(waveKey)
      if (!wave) {
        wave = {
          key: waveKey,
          automationId: seq.id,
          stepIndex: j,
          day: dayIndex,
          enrollmentIds: [],
          cancelledIds: [],
          doneIds: [],
          holds: [],
          shifted: shift,
        }
        rawByKey.set(waveKey, wave)
      }
      if (done) wave.doneIds.push(enrollment.id)
      else if (enrollment.skippedSteps?.includes(j)) wave.cancelledIds.push(enrollment.id)
      else {
        wave.enrollmentIds.push(enrollment.id)
        if (j === enrollment.currentStep && enrollment.holdReason && BLOCKING_HOLDS.has(enrollment.holdReason)) {
          wave.holds.push(enrollment.holdReason)
        }
      }
      if (shift) wave.shifted = shift
    }
  }

  /* ── 2. Des vagues brutes aux vagues affichables ─────────────────────────── */

  const waves: WeekWave[] = []
  for (const raw of rawByKey.values()) {
    const seq = seqById.get(raw.automationId)
    if (!seq) continue
    const step = seq.steps[raw.stepIndex]
    if (!step) continue
    const day = days[raw.day]
    const manual = !AUTO_KINDS.has(step.kind) || step.mode === 'manual'

    const live = raw.enrollmentIds.length
    const cancelled = raw.cancelledIds.length
    const done = raw.doneIds.length
    const count = live + cancelled + done
    if (count === 0) continue

    let status: WeekWaveStatus
    if (live === 0 && cancelled > 0 && done === 0) status = 'cancelled'
    else if (live === 0 && done > 0) status = 'sent'
    else if (seq.status !== 'on') status = 'paused'
    else if (day.closed) status = 'weekend'
    else if (day.past) status = 'late'
    else status = 'planned'

    waves.push({
      id: raw.key,
      automationId: seq.id,
      sequenceName: seq.name,
      priority: seq.priority,
      stepIndex: raw.stepIndex,
      step: raw.stepIndex + 1,
      steps: seq.steps.length,
      kind: step.kind,
      label: step.label || stepFallbackLabel(step, raw.stepIndex),
      template: step.template ?? null,
      first: raw.stepIndex === 0,
      manual,
      day: raw.day,
      count: live + cancelled,
      enrollmentIds: raw.enrollmentIds,
      status,
      segments: [],
      startMin: null,
      endMin: null,
      durationMin: 0,
      overflow: 0,
      capped: false,
      held: raw.holds.length,
      holdReason: dominantHold(raw.holds),
      shifted: raw.shifted,
      actionable: live > 0 && !day.past && status !== 'sent',
    })

    if (done > 0 && live === 0 && cancelled === 0) {
      // Vague entièrement partie : le compte affiché est celui des envois réels.
      waves[waves.length - 1].count = done
    } else if (done > 0) {
      waves[waves.length - 1].count = live + cancelled + done
    }
    if (cancelled > 0) day.cancelled += cancelled
  }

  /* ── 3. Placement : les vagues d'un jour s'enchaînent dans un seul tuyau ─── */

  // Ce qui n'est pas rentré hier part aujourd'hui : sans ce report, un mardi
  // saturé afficherait « 40 en débordement » et un mercredi vide, alors que ces
  // 40 partiront bel et bien le mercredi.
  let carry = 0
  for (const day of days) {
    const dayWaves = waves.filter((w) => w.day === day.index)
    const emailWaves = dayWaves.filter((w) => !w.manual)
    const liveSeqIds = new Set(
      emailWaves.filter((w) => w.status !== 'cancelled' && w.status !== 'paused').map((w) => w.automationId),
    )
    const sources = liveSeqIds.size
      ? [...liveSeqIds].map((id) => windowsOf(seqById.get(id)!))
      : input.sequences.filter((s) => s.status === 'on').map((s) => windowsOf(s))
    day.windows = day.closed ? [] : windowsUnion(sources.length ? sources : [defaultWindows])
    day.openMinutes = windowMinutes(day.windows)
    day.manualCount = dayWaves.filter((w) => w.manual && w.status !== 'cancelled').reduce((n, w) => n + w.count, 0)

    if (day.closed) continue

    day.carriedIn = carry
    carry = 0

    // Les relances passent devant les départs à priorité égale : un contact déjà
    // engagé mérite mieux qu'un premier email envoyé au même moment.
    emailWaves.sort(
      (a, b) =>
        weight(a) - weight(b) || a.priority - b.priority || b.step - a.step || a.sequenceName.localeCompare(b.sequenceName),
    )

    // Le report de la veille occupe le tuyau AVANT les vagues du jour.
    const carriedPlacement = day.carriedIn
      ? placeInWindows(day.windows[0]?.[0] ?? 0, day.carriedIn * averageGap, day.windows)
      : { segments: [] as [number, number][], leftover: 0 }
    let cursor = carriedPlacement.segments.length
      ? carriedPlacement.segments[carriedPlacement.segments.length - 1][1]
      : 0
    if (day.carriedIn) {
      const done = Math.max(0, Math.round((day.carriedIn * averageGap - carriedPlacement.leftover) / averageGap))
      day.count += done
      day.busyMinutes += day.carriedIn * averageGap - carriedPlacement.leftover
      carry += day.carriedIn - done
    }
    let placed = day.carriedIn - carry
    for (const wave of emailWaves) {
      if (wave.status === 'cancelled' || wave.status === 'paused') continue
      const wins = windowsOf(seqById.get(wave.automationId)!)
      if (!wins.length) {
        wave.status = 'spilled'
        wave.overflow = wave.count
        continue
      }
      const minutes = wave.count * averageGap
      const from = Math.max(cursor, wins[0][0])
      const { segments, leftover } = placeInWindows(from, minutes, wins)

      if (!segments.length) {
        wave.status = 'spilled'
        wave.overflow = wave.count
        day.overflow += wave.count
        carry += wave.count
        continue
      }

      const sentCount = Math.max(0, Math.round((minutes - leftover) / averageGap))
      wave.segments = segments
      wave.startMin = segments[0][0]
      wave.endMin = segments[segments.length - 1][1]
      wave.durationMin = minutes - leftover
      wave.overflow = Math.max(0, wave.count - sentCount)
      cursor = wave.endMin

      placed += sentCount
      wave.capped = placed > (seqById.get(wave.automationId)?.dailyCap ?? settings.dailyCap)
      day.count += sentCount
      day.overflow += wave.overflow
      day.busyMinutes += wave.durationMin
      carry += wave.overflow

      if (day.today && wave.status === 'planned') {
        if (nowMinutes >= wave.endMin) wave.status = 'sent'
        else if (nowMinutes >= wave.startMin) wave.status = 'running'
      }
    }
  }

  /* ── 4. Totaux et résumés ────────────────────────────────────────────────── */

  const emailWaves = waves.filter((w) => !w.manual && w.segments.length > 0)
  const timeline = timelineBounds(days, waves)

  const sequences: WeekSequenceSummary[] = input.sequences.map((s) => {
    const mine = emailWaves.filter((w) => w.automationId === s.id)
    return {
      id: s.id,
      name: s.name,
      status: s.status,
      priority: s.priority,
      windows: windowsOf(s),
      dailyCap: s.dailyCap,
      activeEnrollments: s.activeEnrollments ?? 0,
      waves: mine.length,
      volume: mine.reduce((n, w) => n + w.count - w.overflow, 0),
    }
  })

  return {
    offset,
    weekStart: new Date(weekStart).toISOString(),
    label: weekLabel(days),
    now: new Date(now).toISOString(),
    nowMinutes,
    todayIndex: days.findIndex((d) => d.today),
    timelineFrom: timeline[0],
    timelineTo: timeline[1],
    days,
    waves: waves.sort((a, b) => a.day - b.day || (a.startMin ?? 1e9) - (b.startMin ?? 1e9)),
    sequences,
    totals: {
      emails: days.reduce((n, d) => n + d.count, 0),
      starts: emailWaves.filter((w) => w.first).reduce((n, w) => n + w.count - w.overflow, 0),
      followUps: emailWaves.filter((w) => !w.first).reduce((n, w) => n + w.count - w.overflow, 0),
      manual: days.reduce((n, d) => n + d.manualCount, 0),
      cancelled: days.reduce((n, d) => n + d.cancelled, 0),
      overflow: days.reduce((n, d) => n + d.overflow, 0),
      busyMinutes: days.reduce((n, d) => n + d.busyMinutes, 0),
      openMinutes: days.filter((d) => !d.closed).reduce((n, d) => n + d.openMinutes, 0),
      sent: days.reduce((n, d) => n + d.sent, 0),
    },
    averageGap,
    dailyCap: settings.dailyCap,
    paused: settings.paused,
    testMode: settings.testMode,
    timezone: tz,
  }
}

/** Le motif de blocage le plus fréquent de la vague — celui qu'on affichera. */
function dominantHold(holds: string[]): string | null {
  if (!holds.length) return null
  const tally = new Map<string, number>()
  for (const h of holds) tally.set(h, (tally.get(h) ?? 0) + 1)
  return [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0]
}

/** Les vagues gelées passent en fin de file : elles n'occupent pas le tuyau. */
function weight(w: WeekWave): number {
  if (w.status === 'cancelled') return 3
  if (w.status === 'paused') return 2
  return 0
}

/** Bornes de la frise : les plages du jour, arrondies à l'heure, avec un peu d'air. */
function timelineBounds(days: WeekDay[], waves: WeekWave[]): [number, number] {
  let from = Number.POSITIVE_INFINITY
  let to = Number.NEGATIVE_INFINITY
  for (const day of days) {
    for (const [a, b] of day.windows) {
      from = Math.min(from, a)
      to = Math.max(to, b)
    }
  }
  for (const wave of waves) {
    if (wave.startMin != null) from = Math.min(from, wave.startMin)
    if (wave.endMin != null) to = Math.max(to, wave.endMin)
  }
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return [480, 1140]
  return [Math.max(0, Math.floor(from / 60) * 60 - 30), Math.min(DAY_MINUTES, Math.ceil(to / 60) * 60 + 30)]
}

const KIND_LABEL: Record<string, string> = {
  email: 'Email',
  whatsapp: 'WhatsApp',
  linkedin: 'LinkedIn',
  call: 'Appel',
  task: 'Tâche',
  wait: 'Attente',
}

function stepFallbackLabel(step: SequenceStep, index: number): string {
  return `${KIND_LABEL[step.kind] ?? 'Étape'} · étape ${index + 1}`
}

/* ── Marques posées à la main depuis la vue semaine ───────────────────────── */

/**
 * Étapes annulées à la main. Elles vivent dans `sequence_enrollments.vars`
 * plutôt que dans une table dédiée : c'est une décision par inscription, pas un
 * objet du domaine, et `vars` est déjà le sac de contexte de l'inscription.
 */
export function readSkippedSteps(vars: unknown): number[] {
  const raw = (vars as Record<string, unknown> | null)?.skippedSteps
  if (!Array.isArray(raw)) return []
  return raw.map((v) => Number(v)).filter((v) => Number.isInteger(v) && v >= 0)
}

/** Décalages en jours posés à la main, par index d'étape (`{"2": 1}`). */
export function readStepShifts(vars: unknown): Record<string, number> {
  const raw = (vars as Record<string, unknown> | null)?.stepShifts
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const days = Number(v)
    if (!Number.isInteger(Number(k)) || !Number.isFinite(days) || days === 0) continue
    out[k] = Math.max(-30, Math.min(30, Math.round(days)))
  }
  return out
}

/**
 * Réponses déclarées à la main, par index d'étape d'attente (`{"2": "2026-08-13T…"}`).
 *
 * Vit dans `vars` pour la même raison que les deux lectures ci-dessus : c'est
 * une décision portée par une inscription, pas un objet du domaine. La valeur
 * est l'instant du clic — utile pour dire « répondu il y a 3 jours » sans
 * ajouter une table.
 */
export function readReplies(vars: unknown): Record<string, string> {
  const raw = (vars as Record<string, unknown> | null)?.replies
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!Number.isInteger(Number(k)) || typeof v !== 'string' || !v) continue
    out[k] = v
  }
  return out
}

/**
 * La version de message épinglée sur cette inscription, s'il y en a une.
 *
 * Même logement que les trois lectures ci-dessus, et pour la même raison : c'est
 * une décision prise sur UNE inscription — « pour ce prospect-là, écris à
 * l'entreprise » —, pas un objet du domaine. Absente, le moteur choisit seul
 * (`pickVariant`).
 */
export function readVariant(vars: unknown): 'company' | 'contact' | null {
  const raw = (vars as Record<string, unknown> | null)?.variant
  return raw === 'company' || raw === 'contact' ? raw : null
}

/** `08:30` à partir de minutes depuis minuit. */
export function weekHM(minutes: number): string {
  const m = ((Math.floor(minutes) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** `2 h 05` ou `35 min`. */
export function weekDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`
}
