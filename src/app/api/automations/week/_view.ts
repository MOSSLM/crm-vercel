// _view.ts — la semaine d'envoi, telle que l'interface la consomme.
//
// La page Régulateur montre la file de la journée à la minute près. Cette
// vue-ci prend de la hauteur : sur sept jours, quels départs de séquence et
// quelles relances tombent quel jour, dans quel ordre, et combien de temps le
// tuyau met à les écouler.

import { getServiceClient } from '@/app/api/_lib/service-client'
import { isSchemaGap } from '@/app/api/_lib/schema-gap'
import type { Automation, SequenceDefinition, SequenceStep } from '@/components/automations/types'
import { loadRegulatorSettings } from '@/lib/automations/regulator-db'
import { localClock, readSequenceSettings, type RegulatorSettings } from '@/lib/automations/regulator'
import {
  buildWeekPlan,
  nextLocalDay,
  readSkippedSteps,
  readStepShifts,
  startOfLocalWeek,
  type WeekEnrollmentInput,
  type WeekSequenceInput,
} from '@/lib/automations/week'
import type { WeekContactRow, WeekView } from '@/components/automations/week/types'

export { readSkippedSteps, readStepShifts }

const DAY_MS = 86_400_000

// La forme de la réponse est définie une seule fois, du côté de l'interface qui
// la consomme — c'est elle qui a le plus à perdre si les deux divergent.
export type { WeekContactRow, WeekView } from '@/components/automations/week/types'

/** Contacts remontés par vague : de quoi mettre des noms sur une vague, pas la liste entière. */
const SAMPLE = 5

/**
 * Les inscriptions qui peuvent poser une étape dans la semaine affichée.
 *
 * On remonte loin en arrière : une séquence de six semaines entrée il y a un
 * mois pose encore des relances aujourd'hui. 180 jours couvre tout ce que le
 * CRM sait faire, sans ramener l'historique entier.
 */
const LOOKBACK_DAYS = 180

export async function buildWeekView(offset: number, now = Date.now()): Promise<WeekView> {
  const sb = getServiceClient()
  const settings = await loadRegulatorSettings(sb)
  const tz = settings.timezone

  const weekStart = startOfLocalWeek(now, tz, offset)
  let weekEnd = weekStart
  for (let i = 0; i < 7; i++) weekEnd = nextLocalDay(weekEnd, tz)

  const { data: autoRows } = await sb
    .from('automations')
    .select('id, name, status, definition, settings')
    .eq('kind', 'sequence')
    .order('name', { ascending: true })

  const automations = (autoRows ?? []) as Pick<Automation, 'id' | 'name' | 'status' | 'definition' | 'settings'>[]

  // Une séquence archivée n'a rien à faire dans la semaine à venir : elle
  // n'envoie plus rien, et ses vagues passées se lisent dans le journal.
  const sequences: WeekSequenceInput[] = automations
    .filter((a) => a.status !== 'archived')
    .map((a) => {
      const def = (a.definition as SequenceDefinition) || { steps: [] }
      const reg = readSequenceSettings(a.settings)
      return {
        id: a.id,
        name: a.name,
        status: a.status,
        steps: (Array.isArray(def.steps) ? def.steps : []) as SequenceStep[],
        windows: reg.windows,
        priority: reg.priority,
        dailyCap: reg.dailyCap,
        activeEnrollments: 0,
      }
    })

  if (sequences.length === 0) {
    return {
      ...buildWeekPlan({ now, offset, settings, sequences: [], enrollments: [] }),
      contacts: {},
      contactsSampleSize: SAMPLE,
    }
  }

  const ids = sequences.map((s) => s.id)
  const BASE_COLUMNS = 'id, automation_id, contact_id, entreprise_id, current_step, status, next_run_at, entered_at, vars'
  const selectEnrollments = (columns: string) =>
    sb
      .from('sequence_enrollments')
      .select(columns)
      .in('automation_id', ids)
      .gte('entered_at', new Date(weekStart - LOOKBACK_DAYS * DAY_MS).toISOString())
      .lte('entered_at', new Date(weekEnd).toISOString())
      .limit(20000)

  // `hold_reason` (sql/20260801…) et l'ancre (sql/20260813…) viennent de
  // migrations. Sur une base qui ne les a pas encore jouées, la semaine doit
  // rester lisible : on retire les colonnes une strate à la fois plutôt que
  // d'afficher une semaine vide.
  let enrollRes = await selectEnrollments(`${BASE_COLUMNS}, hold_reason, anchor_at, anchor_step`)
  if (enrollRes.error && isSchemaGap(enrollRes.error)) {
    enrollRes = await selectEnrollments(`${BASE_COLUMNS}, hold_reason`)
  }
  if (enrollRes.error && isSchemaGap(enrollRes.error)) enrollRes = await selectEnrollments(BASE_COLUMNS)
  const enrollRows = enrollRes.data

  type Row = {
    id: string
    automation_id: string
    contact_id: string | null
    entreprise_id: number | null
    current_step: number
    status: string
    next_run_at: string | null
    hold_reason?: string | null
    entered_at: string
    anchor_at?: string | null
    anchor_step?: number | null
    vars: Record<string, unknown> | null
  }
  const rows = (enrollRows ?? []) as unknown as Row[]

  const enrollments: WeekEnrollmentInput[] = rows.map((r) => ({
    id: r.id,
    automationId: r.automation_id,
    currentStep: Number(r.current_step) || 0,
    status: r.status,
    enteredAt: r.entered_at,
    nextRunAt: r.next_run_at,
    contactId: r.contact_id,
    entrepriseId: r.entreprise_id,
    holdReason: r.hold_reason ?? null,
    skippedSteps: readSkippedSteps(r.vars),
    stepShifts: readStepShifts(r.vars),
    anchorAt: r.anchor_at ?? null,
    anchorStep: r.anchor_step ?? null,
  }))

  const activeBySeq = new Map<string, number>()
  for (const r of rows) {
    if (r.status !== 'active') continue
    activeBySeq.set(r.automation_id, (activeBySeq.get(r.automation_id) ?? 0) + 1)
  }
  for (const s of sequences) s.activeEnrollments = activeBySeq.get(s.id) ?? 0

  const sentByDay = await loadSentByDay(sb, settings, weekStart, weekEnd)

  const plan = buildWeekPlan({ now, offset, settings, sequences, enrollments, sentByDay })

  /* ── Échantillon de contacts par vague ──────────────────────────────────── */

  const byEnrollment = new Map(rows.map((r) => [r.id, r]))
  const wanted = new Map<string, Row[]>()
  const contactIds = new Set<string>()
  const entrepriseIds = new Set<number>()

  for (const wave of plan.waves) {
    const sample = wave.enrollmentIds
      .slice(0, SAMPLE)
      .map((id) => byEnrollment.get(id))
      .filter((r): r is Row => !!r)
    if (!sample.length) continue
    wanted.set(wave.id, sample)
    for (const r of sample) {
      if (r.contact_id) contactIds.add(r.contact_id)
      if (r.entreprise_id != null) entrepriseIds.add(r.entreprise_id)
    }
  }

  const [contactRes, entRes] = await Promise.all([
    contactIds.size
      ? sb.from('contacts').select('id, first_name, last_name').in('id', [...contactIds])
      : Promise.resolve({ data: [] }),
    entrepriseIds.size
      ? sb.from('entreprises').select('id, name').in('id', [...entrepriseIds])
      : Promise.resolve({ data: [] }),
  ])

  const contactName = new Map(
    ((contactRes.data ?? []) as { id: string; first_name: string | null; last_name: string | null }[]).map((c) => [
      c.id,
      [c.first_name, c.last_name].filter(Boolean).join(' ').trim(),
    ]),
  )
  const companyName = new Map(
    ((entRes.data ?? []) as { id: number; name: string | null }[]).map((e) => [e.id, e.name ?? '']),
  )

  const contacts: Record<string, WeekContactRow[]> = {}
  for (const [waveId, sample] of wanted) {
    contacts[waveId] = sample.map((r) => ({
      enrollmentId: r.id,
      contactId: r.contact_id,
      entrepriseId: r.entreprise_id,
      name: (r.contact_id ? contactName.get(r.contact_id) : '') || 'Contact sans nom',
      company: (r.entreprise_id != null ? companyName.get(r.entreprise_id) : '') || '',
    }))
  }

  return { ...plan, contacts, contactsSampleSize: SAMPLE }
}

/** Envois de séquence réellement journalisés, par jour local. */
async function loadSentByDay(
  sb: ReturnType<typeof getServiceClient>,
  settings: RegulatorSettings,
  weekStart: number,
  weekEnd: number,
): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  try {
    const { data, error } = await sb
      .from('email_logs')
      .select('sent_at')
      .eq('status', 'sent')
      .eq('type', 'sequence')
      .gte('sent_at', new Date(weekStart).toISOString())
      .lt('sent_at', new Date(weekEnd).toISOString())
      .limit(20000)
    if (error) return out
    for (const row of (data ?? []) as { sent_at: string }[]) {
      const at = Date.parse(row.sent_at)
      if (!Number.isFinite(at)) continue
      const key = localClock(at, settings.timezone).dayKey
      out[key] = (out[key] ?? 0) + 1
    }
  } catch {
    /* le journal d'emails n'est pas indispensable à la lecture de la semaine */
  }
  return out
}

