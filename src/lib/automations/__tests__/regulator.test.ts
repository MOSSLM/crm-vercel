/**
 * @jest-environment node
 */
import {
  DEFAULT_REGULATOR,
  MINUTE,
  formatHM,
  gapForItem,
  localClock,
  normalizeWindows,
  overlappingWindows,
  planQueue,
  readSequenceSettings,
  snapToWindow,
  sortQueue,
  toRegulatorSettings,
  windowMinutes,
  windowsUnion,
  type QueueItem,
  type RegulatorSettings,
  type SendWindow,
} from '../regulator'

const TZ = 'Europe/Paris'

/** 1er août 2026 est un samedi ; on travaille sur le lundi 3 août (jour ouvré). */
const at = (hh: number, mm = 0, day = 3): number =>
  Date.parse(`2026-08-${String(day).padStart(2, '0')}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+02:00`)

const settings = (over: Partial<RegulatorSettings> = {}): RegulatorSettings => ({
  ...DEFAULT_REGULATOR,
  ...over,
})

const item = (over: Partial<QueueItem> = {}): QueueItem => ({
  id: 'e1',
  automationId: 'a1',
  sequenceName: 'Artisans',
  priority: 1,
  windows: [
    [510, 690],
    [840, 1050],
  ],
  sequenceActive: true,
  sequenceDailyCap: null,
  sequenceSentToday: 0,
  companyKey: 'c1',
  contactId: 'k1',
  companyName: 'Clim Ouest',
  contactName: 'Nadia',
  ownerId: null,
  step: 1,
  stepLabel: 'Email 1',
  eligibleAt: at(9),
  lastEmailAt: 0,
  emailedToday: false,
  ...over,
})

describe('plages horaires', () => {
  it('ignore les plages inversées ou incomplètes et trie le reste', () => {
    expect(normalizeWindows([[690, 510], [840, 1050], 'x', [510, 690]])).toEqual([
      [510, 690],
      [840, 1050],
    ])
  })

  it('fusionne les plages qui se touchent', () => {
    const union = windowsUnion([
      [[510, 690]],
      [[600, 720], [900, 1000]],
    ])
    expect(union).toEqual([
      [510, 720],
      [900, 1000],
    ])
    expect(windowMinutes(union)).toBe(210 + 100)
  })

  it('repère les plages qui se chevauchent', () => {
    const bad = overlappingWindows([
      [510, 690],
      [600, 780],
      [900, 1000],
    ] as SendWindow[])
    expect([...bad].sort()).toEqual([0, 1])
    expect(overlappingWindows([[510, 690], [840, 1050]]).size).toBe(0)
  })

  it('formate les minutes en heure lisible', () => {
    expect(formatHM(510)).toBe('08:30')
    expect(formatHM(1050)).toBe('17:30')
  })
})

describe("horloge locale", () => {
  it('lit l’heure de Paris, heure d’été comprise', () => {
    expect(localClock(at(10, 15), TZ).minutes).toBe(10 * 60 + 15)
  })

  it('reste juste en heure d’hiver', () => {
    const janvier = Date.parse('2026-01-05T09:30:00+01:00')
    expect(localClock(janvier, TZ).minutes).toBe(9 * 60 + 30)
  })
})

describe('snapToWindow', () => {
  const s = settings()

  it('laisse passer un instant déjà dans une plage', () => {
    const r = snapToWindow(at(9), [[510, 690]], s)
    expect(r.at).toBe(at(9))
    expect(r.reason).toBeNull()
  })

  it('reporte à l’ouverture de la plage suivante dans la journée', () => {
    const r = snapToWindow(at(12), [[510, 690], [840, 1050]], s)
    expect(r.at).toBe(at(14))
    expect(r.reason).toBe('out_of_window')
  })

  it('reporte au lendemain quand toutes les plages sont fermées', () => {
    const r = snapToWindow(at(19), [[510, 690], [840, 1050]], s)
    expect(r.at).toBe(at(8, 30, 4))
    expect(r.reason).toBe('next_day')
  })

  it('saute le week-end en mode jours ouvrés', () => {
    // Samedi 1er août, 09:00 → lundi 3 août 08:30.
    const r = snapToWindow(at(9, 0, 1), [[510, 690]], settings({ businessDaysOnly: true }))
    expect(r.at).toBe(at(8, 30, 3))
    expect(r.reason).toBe('next_day')
  })

  it('envoie le week-end quand la contrainte est levée', () => {
    const r = snapToWindow(at(9, 0, 1), [[510, 690]], settings({ businessDaysOnly: false }))
    expect(r.at).toBe(at(9, 0, 1))
  })

  it('sans plage définie, ne bouge rien', () => {
    expect(snapToWindow(at(3), [], s).at).toBe(at(3))
  })
})

describe('écart aléatoire', () => {
  it('reste dans la fourchette', () => {
    for (let i = 0; i < 200; i++) {
      const g = gapForItem(`seed-${i}`, 7, 14)
      expect(g).toBeGreaterThanOrEqual(7)
      expect(g).toBeLessThanOrEqual(14)
    }
  })

  it('est stable pour une même graine — la file ne danse pas entre deux ticks', () => {
    expect(gapForItem('e1:2026-08-03', 7, 14)).toBe(gapForItem('e1:2026-08-03', 7, 14))
  })

  it('varie d’un item à l’autre', () => {
    const values = new Set(Array.from({ length: 40 }, (_, i) => gapForItem(`e${i}`, 3, 40)))
    expect(values.size).toBeGreaterThan(5)
  })
})

describe('planQueue', () => {
  const base = { now: at(9), cursor: at(9), capLeft: 120 }

  it('espace les envois de l’écart tiré, dans l’ordre chronologique', () => {
    const plan = planQueue(
      [item({ id: 'a', companyKey: 'A' }), item({ id: 'b', companyKey: 'B' }), item({ id: 'c', companyKey: 'C' })],
      { ...base, settings: settings() },
    )
    expect(plan).toHaveLength(3)
    expect(plan[0].at).toBe(at(9))
    for (let i = 1; i < plan.length; i++) {
      const delta = (plan[i].at! - plan[i - 1].at!) / MINUTE
      expect(delta).toBeGreaterThanOrEqual(7)
      expect(delta).toBeLessThanOrEqual(14)
    }
  })

  it('gèle toute la file quand le régulateur est en pause', () => {
    const plan = planQueue([item()], { ...base, settings: settings({ paused: true }) })
    expect(plan[0].at).toBeNull()
    expect(plan[0].reason).toBe('global_pause')
  })

  it('bloque les items d’une séquence en pause sans toucher aux autres', () => {
    const plan = planQueue(
      [item({ id: 'off', sequenceActive: false }), item({ id: 'on', companyKey: 'B' })],
      { ...base, settings: settings() },
    )
    const byId = Object.fromEntries(plan.map((p) => [p.id, p]))
    expect(byId.off.at).toBeNull()
    expect(byId.off.reason).toBe('sequence_paused')
    expect(byId.on.at).not.toBeNull()
  })

  it('respecte le plafond quotidien global', () => {
    const plan = planQueue(
      [item({ id: 'a', companyKey: 'A' }), item({ id: 'b', companyKey: 'B' })],
      { ...base, capLeft: 1, settings: settings() },
    )
    expect(plan.filter((p) => p.at != null)).toHaveLength(1)
    expect(plan.find((p) => p.at == null)?.reason).toBe('daily_cap')
  })

  it('respecte le plafond propre à une séquence', () => {
    const plan = planQueue(
      [
        item({ id: 'a', companyKey: 'A', sequenceDailyCap: 2, sequenceSentToday: 1 }),
        item({ id: 'b', companyKey: 'B', sequenceDailyCap: 2, sequenceSentToday: 1 }),
      ],
      { ...base, settings: settings() },
    )
    expect(plan.filter((p) => p.at != null)).toHaveLength(1)
  })

  it('espace deux contacts de la même entreprise', () => {
    const plan = planQueue(
      [item({ id: 'a', companyKey: 'SAME' }), item({ id: 'b', companyKey: 'SAME' })],
      { ...base, settings: settings({ companyGapMinutes: 45 }) },
    )
    const [first, second] = plan
    expect((second.at! - first.at!) / MINUTE).toBeGreaterThanOrEqual(45)
    expect(second.reason).toBe('company_gap')
  })

  it('reporte hors plage à l’ouverture suivante', () => {
    const plan = planQueue([item({ eligibleAt: at(12) })], {
      now: at(12),
      cursor: at(12),
      capLeft: 120,
      settings: settings(),
    })
    expect(plan[0].at).toBe(at(14))
    expect(plan[0].reason).toBe('out_of_window')
  })

  it('écarte un contact déjà servi aujourd’hui quand la règle est active', () => {
    const plan = planQueue([item({ emailedToday: true })], { ...base, settings: settings() })
    expect(plan[0].reason).toBe('one_per_day')
    const relaxed = planQueue([item({ emailedToday: true })], {
      ...base,
      settings: settings({ onePerDayPerContact: false }),
    })
    expect(relaxed[0].at).not.toBeNull()
  })

  it('ne planifie jamais avant que l’étape soit due', () => {
    const plan = planQueue([item({ eligibleAt: at(10, 30) })], { ...base, settings: settings() })
    expect(plan[0].at).toBeGreaterThanOrEqual(at(10, 30))
  })

  it('donne le même plan à deux appels identiques', () => {
    const items = [item({ id: 'a', companyKey: 'A' }), item({ id: 'b', companyKey: 'B' })]
    const opts = { ...base, settings: settings() }
    expect(planQueue(items, opts).map((p) => p.at)).toEqual(planQueue(items, opts).map((p) => p.at))
  })
})

describe('ordre de la file', () => {
  it('classe par priorité de séquence puis par ancienneté', () => {
    const sorted = sortQueue([
      item({ id: 'c', priority: 3, eligibleAt: at(8) }),
      item({ id: 'a', priority: 1, eligibleAt: at(10) }),
      item({ id: 'b', priority: 1, eligibleAt: at(9) }),
    ])
    expect(sorted.map((s) => s.id)).toEqual(['b', 'a', 'c'])
  })
})

describe('lecture des réglages', () => {
  it('retombe sur les valeurs par défaut quand la ligne manque', () => {
    expect(toRegulatorSettings(null)).toEqual(DEFAULT_REGULATOR)
  })

  it('mappe une ligne Supabase', () => {
    const s = toRegulatorSettings({
      gap_min_minutes: 18,
      gap_max_minutes: 40,
      daily_cap: 60,
      company_gap_minutes: 0,
      paused: true,
      count_all_sequences: false,
      one_per_day_per_contact: false,
      exit_on_reply: false,
      business_days_only: false,
      default_windows: [[600, 700]],
      timezone: 'Europe/Lisbon',
      task_routing_mode: 'strict',
      task_max_per_agent: 3,
      admin_user_id: 'u1',
    })
    expect(s.gapMinMinutes).toBe(18)
    expect(s.defaultWindows).toEqual([[600, 700]])
    expect(s.taskRoutingMode).toBe('strict')
    expect(s.adminUserId).toBe('u1')
  })

  it('lit les réglages de séquence, avec des défauts sains', () => {
    expect(readSequenceSettings({})).toEqual({ windows: [], priority: 2, dailyCap: null })
    expect(readSequenceSettings({ sendWindows: [[510, 690]], queuePriority: 1, dailyCap: 30 })).toEqual({
      windows: [[510, 690]],
      priority: 1,
      dailyCap: 30,
    })
  })
})
