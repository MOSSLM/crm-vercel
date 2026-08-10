/**
 * @jest-environment node
 */
import { DEFAULT_REGULATOR, type RegulatorSettings } from '../regulator'
import {
  buildWeekPlan,
  placeInWindows,
  readSkippedSteps,
  readStepShifts,
  startOfLocalWeek,
  type WeekEnrollmentInput,
  type WeekSequenceInput,
} from '../week'
import type { SequenceStep } from '@/components/automations/types'

const TZ = 'Europe/Paris'
const DAY = 86_400_000

/** Lundi 4 août 2026, 10:00 heure de Paris. */
const MONDAY_10H = Date.parse('2026-08-03T08:00:00.000Z')

const settings = (over: Partial<RegulatorSettings> = {}): RegulatorSettings => ({
  ...DEFAULT_REGULATOR,
  timezone: TZ,
  gapMinMinutes: 10,
  gapMaxMinutes: 10, // écart moyen = 10 min : une vague de 6 dure une heure pile
  defaultWindows: [[540, 720]], // 09:00 → 12:00
  businessDaysOnly: true,
  ...over,
})

const step = (over: Partial<SequenceStep> & { day: number }): SequenceStep => ({
  id: `s${over.day}-${over.kind ?? 'email'}`,
  kind: 'email',
  label: 'Étape',
  template: null,
  ...over,
})

const sequence = (over: Partial<WeekSequenceInput> = {}): WeekSequenceInput => ({
  id: 'seq-1',
  name: 'Séquence de test',
  status: 'on',
  steps: [step({ day: 0, label: 'Premier email' }), step({ day: 2, label: 'Relance' })],
  windows: [],
  priority: 2,
  dailyCap: null,
  activeEnrollments: 0,
  ...over,
})

const enrollment = (over: Partial<WeekEnrollmentInput> = {}): WeekEnrollmentInput => ({
  id: 'enr-1',
  automationId: 'seq-1',
  currentStep: 0,
  status: 'active',
  enteredAt: new Date(MONDAY_10H).toISOString(),
  nextRunAt: new Date(MONDAY_10H).toISOString(),
  contactId: 'c1',
  entrepriseId: 1,
  holdReason: null,
  skippedSteps: [],
  stepShifts: {},
  ...over,
})

describe('startOfLocalWeek', () => {
  it('ramène au lundi minuit local, quel que soit le jour', () => {
    const monday = startOfLocalWeek(MONDAY_10H, TZ)
    // 00:00 heure de Paris en août = 22:00 UTC la veille.
    expect(new Date(monday).toISOString()).toBe('2026-08-02T22:00:00.000Z')

    const friday = MONDAY_10H + 4 * DAY
    expect(startOfLocalWeek(friday, TZ)).toBe(monday)
  })

  it('décale d’une semaine entière, en avant comme en arrière', () => {
    const monday = startOfLocalWeek(MONDAY_10H, TZ)
    expect(startOfLocalWeek(MONDAY_10H, TZ, 1) - monday).toBe(7 * DAY)
    expect(monday - startOfLocalWeek(MONDAY_10H, TZ, -1)).toBe(7 * DAY)
  })
})

describe('placeInWindows', () => {
  it('coupe une vague trop longue sur les deux plages du jour', () => {
    const { segments, leftover } = placeInWindows(540, 240, [
      [540, 660],
      [780, 900],
    ])
    expect(segments).toEqual([
      [540, 660],
      [780, 900],
    ])
    expect(leftover).toBe(0)
  })

  it('rend le reliquat quand les plages sont pleines', () => {
    const { segments, leftover } = placeInWindows(540, 200, [[540, 660]])
    expect(segments).toEqual([[540, 660]])
    expect(leftover).toBe(80)
  })
})

describe('buildWeekPlan', () => {
  it('pose le premier email le jour d’entrée et la relance à J+2', () => {
    const plan = buildWeekPlan({
      now: MONDAY_10H,
      offset: 0,
      settings: settings(),
      sequences: [sequence()],
      enrollments: [enrollment()],
    })

    const waves = plan.waves.filter((w) => !w.manual)
    expect(waves).toHaveLength(2)
    expect(waves[0]).toMatchObject({ day: 0, step: 1, first: true, count: 1 })
    expect(waves[1]).toMatchObject({ day: 2, step: 2, first: false, count: 1 })
  })

  it('empile les vagues d’un même jour : elles ne se chevauchent jamais', () => {
    const many = Array.from({ length: 6 }, (_, i) => enrollment({ id: `e${i}`, contactId: `c${i}` }))
    const other = Array.from({ length: 3 }, (_, i) =>
      enrollment({ id: `o${i}`, automationId: 'seq-2', contactId: `d${i}` }),
    )
    const plan = buildWeekPlan({
      now: MONDAY_10H,
      offset: 0,
      settings: settings(),
      sequences: [sequence(), sequence({ id: 'seq-2', name: 'Autre', steps: [step({ day: 0 })] })],
      enrollments: [...many, ...other],
    })

    const monday = plan.waves.filter((w) => w.day === 0 && w.segments.length)
    expect(monday).toHaveLength(2)
    const [first, second] = monday.sort((a, b) => a.startMin! - b.startMin!)
    expect(first.endMin).toBeLessThanOrEqual(second.startMin!)
    // 6 contacts × 10 min = 1 h, à partir de 09:00.
    expect(first.startMin).toBe(540)
  })

  it('reporte au jour suivant ce qui ne rentre pas dans les plages', () => {
    // 30 contacts × 10 min = 5 h, pour 3 h de plage : 12 partent, 18 débordent.
    const crowd = Array.from({ length: 30 }, (_, i) => enrollment({ id: `e${i}`, contactId: `c${i}` }))
    const plan = buildWeekPlan({
      now: MONDAY_10H,
      offset: 0,
      settings: settings(),
      sequences: [sequence({ steps: [step({ day: 0 })] })],
      enrollments: crowd,
    })

    expect(plan.days[0].count).toBe(18)
    expect(plan.days[0].overflow).toBe(12)
    // Le reliquat n'est pas perdu : il occupe le mardi.
    expect(plan.days[1].carriedIn).toBe(12)
    expect(plan.days[1].count).toBe(12)
  })

  it('coupe le week-end quand le régulateur ne travaille qu’en semaine', () => {
    const plan = buildWeekPlan({
      now: MONDAY_10H,
      offset: 0,
      settings: settings(),
      // L'étape à venir tombe samedi : le régulateur ne l'enverra pas ce jour-là.
      sequences: [sequence({ steps: [step({ day: 0 }), step({ day: 5, label: 'Relance du samedi' })] })],
      enrollments: [enrollment()],
    })

    const saturday = plan.waves.find((w) => w.day === 5)
    expect(saturday?.status).toBe('weekend')
    expect(saturday?.segments).toHaveLength(0)
    expect(plan.days[5].closed).toBe(true)
  })

  it('marque comme annulée une étape sautée à la main', () => {
    const plan = buildWeekPlan({
      now: MONDAY_10H,
      offset: 0,
      settings: settings(),
      sequences: [sequence()],
      enrollments: [enrollment({ skippedSteps: [1] })],
    })

    const relance = plan.waves.find((w) => w.step === 2)
    expect(relance?.status).toBe('cancelled')
    expect(relance?.segments).toHaveLength(0)
  })

  it('décale une étape future du nombre de jours demandé', () => {
    const plan = buildWeekPlan({
      now: MONDAY_10H,
      offset: 0,
      settings: settings(),
      sequences: [sequence()],
      enrollments: [enrollment({ stepShifts: { '1': 1 } })],
    })

    expect(plan.waves.find((w) => w.step === 2)?.day).toBe(3)
  })

  it('ne projette plus rien après une inscription sortie de séquence', () => {
    const plan = buildWeekPlan({
      now: MONDAY_10H,
      offset: 0,
      settings: settings(),
      sequences: [sequence()],
      enrollments: [enrollment({ status: 'replied', currentStep: 1 })],
    })

    expect(plan.waves.map((w) => w.step)).toEqual([1])
    expect(plan.waves[0].status).toBe('sent')
  })

  it('gèle les vagues d’une séquence en pause sans occuper le tuyau', () => {
    const plan = buildWeekPlan({
      now: MONDAY_10H,
      offset: 0,
      settings: settings(),
      sequences: [sequence({ status: 'paused' })],
      enrollments: [enrollment()],
    })

    expect(plan.waves[0].status).toBe('paused')
    expect(plan.days[0].count).toBe(0)
  })

  it('compte les contacts retenus par le régulateur', () => {
    const plan = buildWeekPlan({
      now: MONDAY_10H,
      offset: 0,
      settings: settings(),
      sequences: [sequence()],
      enrollments: [enrollment({ holdReason: 'no_email' }), enrollment({ id: 'e2', contactId: 'c2' })],
    })

    const first = plan.waves.find((w) => w.step === 1)
    expect(first?.count).toBe(2)
    expect(first?.held).toBe(1)
    expect(first?.holdReason).toBe('no_email')
  })
})

describe('marques posées à la main', () => {
  it('lit les étapes annulées et ignore les valeurs douteuses', () => {
    expect(readSkippedSteps({ skippedSteps: [0, 2, -1, 'x'] })).toEqual([0, 2])
    expect(readSkippedSteps(null)).toEqual([])
    expect(readSkippedSteps({ skippedSteps: 'nope' })).toEqual([])
  })

  it('lit les décalages, borne les valeurs et jette les clés non numériques', () => {
    expect(readStepShifts({ stepShifts: { '1': 2, '2': 0, abc: 3, '3': 99 } })).toEqual({ '1': 2, '3': 30 })
    expect(readStepShifts(undefined)).toEqual({})
  })
})
