// regulator.ts — le régulateur d'envoi : un seul tuyau pour tout le CRM.
//
// Les séquences décident QUOI envoyer et dans quel ordre ; le régulateur décide
// QUAND chaque email part réellement. Toutes séquences et toutes entreprises
// confondues, les emails passent par la même file : jamais deux envois collés,
// un écart aléatoire entre deux départs, des plages horaires respectées, un
// plafond quotidien, et un espacement minimum entre deux contacts d'une même
// entreprise.
//
// Ce module est volontairement PUR (aucun accès base, aucune horloge implicite)
// pour être testable : `now` et le curseur sont passés en paramètres.

/** Plage d'envoi : [début, fin] en minutes depuis minuit, heure locale. */
export type SendWindow = [number, number]

export const MINUTE = 60_000
export const DAY_MINUTES = 1440

/** Presets d'écart proposés dans l'interface. */
export const GAP_PRESETS = [
  { name: 'Prudent', min: 18, max: 40, hint: 'boîte neuve, domaine à chauffer' },
  { name: 'Normal', min: 7, max: 14, hint: 'rythme humain — recommandé' },
  { name: 'Soutenu', min: 3, max: 7, hint: 'domaine chaud uniquement' },
] as const

export const DEFAULT_WINDOWS: SendWindow[] = [
  [510, 690],
  [840, 1050],
]

export type TaskRoutingMode = 'pref' | 'strict' | 'admin'

export interface RegulatorSettings {
  gapMinMinutes: number
  gapMaxMinutes: number
  dailyCap: number
  companyGapMinutes: number
  paused: boolean
  countAllSequences: boolean
  onePerDayPerContact: boolean
  exitOnReply: boolean
  businessDaysOnly: boolean
  defaultWindows: SendWindow[]
  timezone: string
  taskRoutingMode: TaskRoutingMode
  taskMaxPerAgent: number
  adminUserId: string | null
}

export const DEFAULT_REGULATOR: RegulatorSettings = {
  gapMinMinutes: 7,
  gapMaxMinutes: 14,
  dailyCap: 120,
  companyGapMinutes: 45,
  paused: false,
  countAllSequences: true,
  onePerDayPerContact: true,
  exitOnReply: true,
  businessDaysOnly: true,
  defaultWindows: DEFAULT_WINDOWS,
  timezone: 'Europe/Paris',
  taskRoutingMode: 'pref',
  taskMaxPerAgent: 8,
  adminUserId: null,
}

/**
 * Motif du report d'un envoi. Affiché tel quel dans la colonne Email du
 * pipeline et dans la file du régulateur — c'est ce qui rend le système lisible
 * plutôt que magique.
 */
export type HoldReason =
  | 'out_of_window' // hors plage — reprise à l'ouverture suivante
  | 'next_day' // plages fermées — départ demain
  | 'company_gap' // espacé : deux contacts de la même entreprise
  | 'daily_cap' // plafond du jour atteint
  | 'sequence_paused' // la séquence elle-même est en pause
  | 'global_pause' // le régulateur est en pause
  | 'one_per_day' // le contact a déjà reçu un email aujourd'hui

/** Une entrée de la file, telle qu'elle sort de la base. */
export interface QueueItem {
  /** Identifiant de l'inscription (`sequence_enrollments.id`). */
  id: string
  automationId: string
  sequenceName: string
  /** Priorité de la séquence dans la file : 1 passe devant 4. */
  priority: number
  /** Plages d'envoi de la séquence (vide → plages par défaut du régulateur). */
  windows: SendWindow[]
  /** La séquence est-elle active ? Une séquence en pause bloque ses items. */
  sequenceActive: boolean
  /** Plafond propre à la séquence (null = pas de limite dédiée). */
  sequenceDailyCap: number | null
  /** Nombre d'emails déjà partis aujourd'hui pour cette séquence. */
  sequenceSentToday: number
  /** Clé d'entreprise, pour l'espacement « même entreprise ». */
  companyKey: string
  contactId: string | null
  companyName: string
  contactName: string
  ownerId: string | null
  /** Index de l'étape courante (1-based, pour l'affichage). */
  step: number
  stepLabel: string
  /** Éligible à partir de cet instant (le J+n de l'étape). */
  eligibleAt: number
  /** Dernier email envoyé à ce contact, en ms (0 = jamais). */
  lastEmailAt: number
  /** Le contact a-t-il déjà reçu un email aujourd'hui ? */
  emailedToday: boolean
}

export interface PlannedItem extends QueueItem {
  /** Instant retenu, en ms. `null` quand l'item est bloqué. */
  at: number | null
  /** Écart appliqué par rapport à l'envoi précédent, en minutes. */
  gapMinutes: number
  /** Motif du report / du blocage. */
  reason: HoldReason | null
  /** Rang dans la file des envois planifiés (0 = en tête). */
  rank: number | null
}

export interface PlanOptions {
  now: number
  /**
   * Premier créneau libre : en général `max(now, dernier envoi + écart)`.
   * C'est ce qui fait que l'écart tient d'un tick à l'autre.
   */
  cursor: number
  settings: RegulatorSettings
  /** Places restantes sous le plafond quotidien global. */
  capLeft: number
}

/* ── Plages horaires ─────────────────────────────────────────────────────── */

export function normalizeWindows(raw: unknown): SendWindow[] {
  if (!Array.isArray(raw)) return []
  const out: SendWindow[] = []
  for (const w of raw) {
    if (!Array.isArray(w) || w.length < 2) continue
    const a = Math.round(Number(w[0]))
    const b = Math.round(Number(w[1]))
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue
    const start = Math.max(0, Math.min(DAY_MINUTES, a))
    const end = Math.max(0, Math.min(DAY_MINUTES, b))
    if (end <= start) continue
    out.push([start, end])
  }
  return out.sort((x, y) => x[0] - y[0])
}

/** Fusion des plages en un seul ruban (utilisé pour la frise « file globale »). */
export function windowsUnion(list: SendWindow[][]): SendWindow[] {
  const all = list
    .flat()
    .map((w) => [w[0], w[1]] as SendWindow)
    .sort((a, b) => a[0] - b[0])
  const out: SendWindow[] = []
  for (const w of all) {
    const last = out[out.length - 1]
    if (last && w[0] <= last[1]) last[1] = Math.max(last[1], w[1])
    else out.push([w[0], w[1]])
  }
  return out
}

export function windowMinutes(windows: SendWindow[]): number {
  return windows.reduce((sum, [a, b]) => sum + (b - a), 0)
}

/** Index des plages qui se chevauchent — l'éditeur les passe en rouge. */
export function overlappingWindows(windows: SendWindow[]): Set<number> {
  const indexed = windows.map((w, i) => ({ w, i })).sort((a, b) => a.w[0] - b.w[0])
  const bad = new Set<number>()
  for (let k = 1; k < indexed.length; k++) {
    if (indexed[k].w[0] < indexed[k - 1].w[1]) {
      bad.add(indexed[k].i)
      bad.add(indexed[k - 1].i)
    }
  }
  return bad
}

export function formatHM(minutes: number): string {
  const m = ((Math.floor(minutes) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export function parseHM(value: string): number {
  const [h, m] = String(value).split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/* ── Horloge locale (fuseau du régulateur, DST compris) ──────────────────── */

type LocalClock = { minutes: number; weekday: number; dayKey: string }

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

const formatterCache = new Map<string, Intl.DateTimeFormat>()

function formatterFor(timezone: string): Intl.DateTimeFormat {
  let fmt = formatterCache.get(timezone)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour12: false,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
    formatterCache.set(timezone, fmt)
  }
  return fmt
}

/**
 * Heure locale d'un instant, dans le fuseau du régulateur. On passe par
 * `Intl` plutôt que par un décalage fixe : Europe/Paris change deux fois par an,
 * et une plage « 08:30–11:30 » doit rester 08:30–11:30 en heure d'été comme en
 * heure d'hiver.
 */
export function localClock(ms: number, timezone: string): LocalClock {
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = formatterFor(timezone).formatToParts(new Date(ms))
  } catch {
    parts = formatterFor('UTC').formatToParts(new Date(ms))
  }
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  const hour = Number(get('hour'))
  const minute = Number(get('minute'))
  // Intl rend parfois « 24 » pour minuit selon le runtime : on ramène à 0.
  const hours = Number.isFinite(hour) ? hour % 24 : 0
  return {
    minutes: hours * 60 + (Number.isFinite(minute) ? minute : 0),
    weekday: WEEKDAY_INDEX[get('weekday')] ?? 1,
    dayKey: `${get('year')}-${get('month')}-${get('day')}`,
  }
}

/** Jour local (`2026-08-01`) d'un instant — sert de clé de plafond quotidien. */
export function localDayKey(ms: number, timezone: string): string {
  return localClock(ms, timezone).dayKey
}

/** Bornes UTC du jour local courant — utilisées pour compter les envois du jour. */
export function localDayBounds(ms: number, timezone: string): { start: number; end: number } {
  const { minutes } = localClock(ms, timezone)
  const start = ms - minutes * MINUTE
  return { start, end: start + DAY_MINUTES * MINUTE }
}

const isWeekend = (weekday: number) => weekday === 0 || weekday === 6

/**
 * Premier instant >= `ms` qui tombe dans une plage ouverte.
 *
 * Renvoie aussi POURQUOI on a bougé : `out_of_window` (on attend l'ouverture de
 * la plage suivante dans la journée) ou `next_day` (toutes les plages du jour
 * sont fermées — départ demain). `null` quand l'instant était déjà bon.
 */
export function snapToWindow(
  ms: number,
  windows: SendWindow[],
  settings: Pick<RegulatorSettings, 'timezone' | 'businessDaysOnly'>,
): { at: number; reason: HoldReason | null } {
  const wins = normalizeWindows(windows)
  if (wins.length === 0) return { at: ms, reason: null }

  let cursor = ms
  let reason: HoldReason | null = null

  // 21 sauts couvrent trois semaines : largement assez pour retomber sur une
  // plage ouverte même avec « lundi-vendredi » et des créneaux étroits.
  for (let guard = 0; guard < 21; guard++) {
    const { minutes, weekday } = localClock(cursor, settings.timezone)

    if (settings.businessDaysOnly && isWeekend(weekday)) {
      cursor += (DAY_MINUTES - minutes + wins[0][0]) * MINUTE
      reason = 'next_day'
      continue
    }

    const open = wins.find(([a, b]) => minutes >= a && minutes < b)
    if (open) return { at: cursor, reason }

    const upcoming = wins.find(([a]) => minutes < a)
    if (upcoming) {
      cursor += (upcoming[0] - minutes) * MINUTE
      // Un saut à l'intérieur du jour courant reste un « hors plage » ; on ne
      // dégrade jamais un `next_day` déjà posé.
      reason = reason === 'next_day' ? 'next_day' : 'out_of_window'
      // On revalide (le passage à l'heure d'été peut décaler la minute locale).
      continue
    }

    cursor += (DAY_MINUTES - minutes + wins[0][0]) * MINUTE
    reason = 'next_day'
  }

  return { at: cursor, reason: reason ?? 'next_day' }
}

/* ── Aléatoire déterministe ──────────────────────────────────────────────── */

/** Hash 32 bits stable (FNV-1a) — même entrée, même écart, d'un tick à l'autre. */
export function stableHash(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/**
 * Écart tiré « au hasard » entre deux emails, mais reproductible : le ticker
 * repasse toutes les minutes et doit retomber sur la même file, sinon l'heure
 * annoncée dans l'interface danserait à chaque rafraîchissement.
 */
export function gapForItem(seed: string, min: number, max: number): number {
  const lo = Math.max(1, Math.min(min, max))
  const hi = Math.max(lo, max)
  if (hi === lo) return lo
  return lo + (stableHash(seed) % (hi - lo + 1))
}

/* ── Plan de la file ─────────────────────────────────────────────────────── */

/**
 * Ordre de passage : priorité de séquence d'abord, puis ancienneté d'éligibilité.
 * Un tri stable suffit — pas de round-robin : la priorité est explicite et
 * réglable séquence par séquence.
 */
export function sortQueue(items: QueueItem[]): QueueItem[] {
  return [...items].sort(
    (a, b) => a.priority - b.priority || a.eligibleAt - b.eligibleAt || a.id.localeCompare(b.id),
  )
}

/**
 * Plan de la file : un seul tuyau, écart aléatoire entre deux envois, plages
 * respectées, plafond quotidien, espacement « même entreprise ».
 *
 * Chaque item ressort avec l'heure retenue (`at`), l'écart appliqué et le motif
 * du report. Les items bloqués ressortent avec `at = null` — ils ne sont pas
 * perdus, ils repasseront au tick suivant.
 */
export function planQueue(items: QueueItem[], options: PlanOptions): PlannedItem[] {
  const { settings, now } = options
  const sorted = sortQueue(items)
  const out: PlannedItem[] = []

  const blocked = (item: QueueItem, reason: HoldReason): PlannedItem => ({
    ...item,
    at: null,
    gapMinutes: 0,
    reason,
    rank: null,
  })

  if (settings.paused) return sorted.map((it) => blocked(it, 'global_pause'))

  let cursor = Math.max(options.cursor, now)
  let placed = 0
  const lastByCompany = new Map<string, number>()
  const sequenceUsed = new Map<string, number>()

  for (const item of sorted) {
    if (!item.sequenceActive) {
      out.push(blocked(item, 'sequence_paused'))
      continue
    }
    if (settings.onePerDayPerContact && item.emailedToday) {
      out.push(blocked(item, 'one_per_day'))
      continue
    }
    if (placed >= options.capLeft) {
      out.push(blocked(item, 'daily_cap'))
      continue
    }
    if (item.sequenceDailyCap != null) {
      const used = item.sequenceSentToday + (sequenceUsed.get(item.automationId) ?? 0)
      if (used >= item.sequenceDailyCap) {
        out.push(blocked(item, 'daily_cap'))
        continue
      }
    }

    // Le premier de la file part au curseur ; les suivants s'espacent.
    const gap =
      placed === 0
        ? 0
        : gapForItem(`${item.id}:${localDayKey(cursor, settings.timezone)}`, settings.gapMinMinutes, settings.gapMaxMinutes)

    let want = Math.max(cursor + gap * MINUTE, item.eligibleAt, now)
    let reason: HoldReason | null = null

    // Deux contacts de la même entreprise ne reçoivent jamais coup sur coup.
    if (settings.companyGapMinutes > 0) {
      const last = lastByCompany.get(item.companyKey)
      const floor = Math.max(last ?? 0, item.lastEmailAt)
      if (floor > 0 && want - floor < settings.companyGapMinutes * MINUTE) {
        want = floor + settings.companyGapMinutes * MINUTE
        reason = 'company_gap'
      }
    }

    const windows = item.windows.length > 0 ? item.windows : settings.defaultWindows
    const snapped = snapToWindow(want, windows, settings)
    if (snapped.reason) reason = snapped.reason

    out.push({ ...item, at: snapped.at, gapMinutes: gap, reason, rank: placed })
    lastByCompany.set(item.companyKey, snapped.at)
    sequenceUsed.set(item.automationId, (sequenceUsed.get(item.automationId) ?? 0) + 1)
    cursor = snapped.at
    placed++
  }

  // On rend la file dans l'ordre chronologique : c'est celui que l'œil attend.
  return out.sort((a, b) => {
    if (a.at == null && b.at == null) return 0
    if (a.at == null) return 1
    if (b.at == null) return -1
    return a.at - b.at
  })
}

/* ── Lecture / écriture des réglages ─────────────────────────────────────── */

type RegulatorRow = Record<string, unknown>

const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)
const int = (v: unknown, fallback: number) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n) : fallback
}

/** Mappe une ligne `regulator_settings` (ou rien) vers des réglages utilisables. */
export function toRegulatorSettings(row: RegulatorRow | null | undefined): RegulatorSettings {
  if (!row) return { ...DEFAULT_REGULATOR }
  const windows = normalizeWindows(row.default_windows)
  const mode = row.task_routing_mode
  return {
    gapMinMinutes: Math.max(1, int(row.gap_min_minutes, DEFAULT_REGULATOR.gapMinMinutes)),
    gapMaxMinutes: Math.max(1, int(row.gap_max_minutes, DEFAULT_REGULATOR.gapMaxMinutes)),
    dailyCap: Math.max(0, int(row.daily_cap, DEFAULT_REGULATOR.dailyCap)),
    companyGapMinutes: Math.max(0, int(row.company_gap_minutes, DEFAULT_REGULATOR.companyGapMinutes)),
    paused: bool(row.paused, DEFAULT_REGULATOR.paused),
    countAllSequences: bool(row.count_all_sequences, DEFAULT_REGULATOR.countAllSequences),
    onePerDayPerContact: bool(row.one_per_day_per_contact, DEFAULT_REGULATOR.onePerDayPerContact),
    exitOnReply: bool(row.exit_on_reply, DEFAULT_REGULATOR.exitOnReply),
    businessDaysOnly: bool(row.business_days_only, DEFAULT_REGULATOR.businessDaysOnly),
    defaultWindows: windows.length > 0 ? windows : DEFAULT_WINDOWS,
    timezone: typeof row.timezone === 'string' && row.timezone ? row.timezone : DEFAULT_REGULATOR.timezone,
    taskRoutingMode:
      mode === 'strict' || mode === 'admin' || mode === 'pref' ? mode : DEFAULT_REGULATOR.taskRoutingMode,
    taskMaxPerAgent: Math.max(1, int(row.task_max_per_agent, DEFAULT_REGULATOR.taskMaxPerAgent)),
    adminUserId: typeof row.admin_user_id === 'string' ? row.admin_user_id : null,
  }
}

/** Réglages propres à une séquence, lus dans `automations.settings`. */
export interface SequenceRegulatorSettings {
  windows: SendWindow[]
  priority: number
  dailyCap: number | null
}

export function readSequenceSettings(settings: unknown): SequenceRegulatorSettings {
  const s = (settings ?? {}) as Record<string, unknown>
  const windows = normalizeWindows(s.sendWindows)
  const priority = Number(s.queuePriority)
  const cap = Number(s.dailyCap)
  return {
    windows,
    priority: Number.isFinite(priority) ? Math.min(9, Math.max(1, Math.round(priority))) : 2,
    dailyCap: Number.isFinite(cap) && cap > 0 ? Math.round(cap) : null,
  }
}

/** Libellé français du motif de report, partagé par la file et le pipeline. */
export function holdReasonLabel(reason: HoldReason | null, at?: number | null, timezone?: string): string {
  switch (reason) {
    case 'out_of_window':
      return at != null && timezone
        ? `hors plage — reprise à ${formatHM(localClock(at, timezone).minutes)}`
        : 'hors plage'
    case 'next_day':
      return 'plages fermées — départ demain'
    case 'company_gap':
      return 'espacé · 2 contacts même entreprise'
    case 'daily_cap':
      return 'plafond du jour atteint'
    case 'sequence_paused':
      return 'séquence en pause'
    case 'global_pause':
      return 'régulateur en pause'
    case 'one_per_day':
      return 'déjà un email aujourd’hui'
    default:
      return ''
  }
}
