// Ce que la vérification d'adresses change dans la file du régulateur.
//
// Le moteur est pur : on lui donne une file et des réglages, on lit le plan. Pas
// de base, pas d'horloge implicite — chaque règle se teste isolément.

import {
  DEFAULT_REGULATOR,
  holdReasonLabel,
  planQueue,
  riskyCapFor,
  type QueueItem,
  type RegulatorSettings,
} from '../regulator'

const MONDAY_10H = Date.parse('2026-08-03T08:00:00Z') // 10 h à Paris, en pleine plage

const settings = (over: Partial<RegulatorSettings> = {}): RegulatorSettings => ({
  ...DEFAULT_REGULATOR,
  ...over,
})

let seq = 0
const item = (over: Partial<QueueItem> = {}): QueueItem => {
  seq++
  return {
    id: `enr-${seq}`,
    automationId: 'auto-1',
    sequenceName: 'Artisans',
    priority: 2,
    windows: [],
    sequenceActive: true,
    sequenceDailyCap: null,
    sequenceSentToday: 0,
    companyKey: `company-${seq}`,
    contactId: `c-${seq}`,
    companyName: '',
    contactName: '',
    ownerId: null,
    step: 1,
    stepLabel: 'Premier contact',
    eligibleAt: MONDAY_10H,
    lastEmailAt: 0,
    emailedToday: false,
    ...over,
  }
}

const plan = (items: QueueItem[], s: RegulatorSettings, riskySentToday = 0) =>
  planQueue(items, { now: MONDAY_10H, cursor: MONDAY_10H, settings: s, capLeft: 1000, riskySentToday })

const reasonsOf = (items: QueueItem[], s: RegulatorSettings, riskySentToday = 0) =>
  new Map(plan(items, s, riskySentToday).map((p) => [p.id, p.reason]))

beforeEach(() => {
  seq = 0
})

/* ── Le quota des adresses douteuses ─────────────────────────────────────── */

describe('riskyCapFor', () => {
  it('prend la part réglée du plafond quotidien', () => {
    expect(riskyCapFor(settings({ dailyCap: 120, riskyDailyShare: 20 }))).toBe(24)
  })

  it('laisse toujours passer au moins une adresse', () => {
    // À quota nul sur un petit plafond, une adresse douteuse ne serait jamais
    // tranchée : elle resterait douteuse pour toujours, faute d'envoi.
    expect(riskyCapFor(settings({ dailyCap: 3, riskyDailyShare: 20 }))).toBe(1)
  })

  it('respecte une part explicitement nulle', () => {
    expect(riskyCapFor(settings({ dailyCap: 120, riskyDailyShare: 0 }))).toBe(0)
  })
})

describe('file — quota des adresses douteuses', () => {
  it('ne bride PAS les adresses sans signal négatif', () => {
    // Le point important : « douteuse » ne veut pas dire « non prouvée ». Au
    // premier jour, aucune adresse n'a jamais reçu — si le quota s'appliquait à
    // toutes, plus rien ne partirait.
    const items = Array.from({ length: 50 }, () => item())
    const reasons = reasonsOf(items, settings({ dailyCap: 120, riskyDailyShare: 20 }))
    expect([...reasons.values()].filter((r) => r === 'risky_cap')).toHaveLength(0)
  })

  it('plafonne les adresses à signal négatif', () => {
    const items = Array.from({ length: 10 }, () => item({ riskyEmail: true }))
    // 20 % de 10 = 2 places.
    const reasons = reasonsOf(items, settings({ dailyCap: 10, riskyDailyShare: 20 }))
    expect([...reasons.values()].filter((r) => r === 'risky_cap')).toHaveLength(8)
  })

  it('compte le quota sur la journée, pas sur le tick', () => {
    // Sans ce report, chaque minute rouvrirait le quota entier et le plafond ne
    // vaudrait rien.
    const items = Array.from({ length: 5 }, () => item({ riskyEmail: true }))
    const reasons = reasonsOf(items, settings({ dailyCap: 10, riskyDailyShare: 20 }), 2)
    expect([...reasons.values()].every((r) => r === 'risky_cap')).toBe(true)
  })

  it('laisse partir les adresses saines même quand le quota douteux est plein', () => {
    const risky = item({ riskyEmail: true })
    const sain = item()
    const reasons = reasonsOf([risky, sain], settings({ dailyCap: 10, riskyDailyShare: 20 }), 99)
    expect(reasons.get(risky.id)).toBe('risky_cap')
    expect(reasons.get(sain.id)).not.toBe('risky_cap')
  })
})

/* ── Première touche par domaine ─────────────────────────────────────────── */

describe('file — première touche par domaine', () => {
  it('n’envoie qu’une adresse par domaine d’entreprise non éprouvé', () => {
    // Trois adresses du même garage : la première part, les deux autres
    // attendent son verdict. Si elle rebondit, elles sont gelées AVANT de
    // partir — c'est tout l'intérêt.
    const items = [
      item({ probeDomain: 'garage-dupont.fr' }),
      item({ probeDomain: 'garage-dupont.fr' }),
      item({ probeDomain: 'garage-dupont.fr' }),
    ]
    const reasons = reasonsOf(items, settings())
    const held = [...reasons.values()].filter((r) => r === 'domain_probe')
    expect(held).toHaveLength(2)
  })

  it('ne gêne pas deux domaines différents', () => {
    const items = [item({ probeDomain: 'garage-a.fr' }), item({ probeDomain: 'garage-b.fr' })]
    const reasons = reasonsOf(items, settings())
    expect([...reasons.values()].filter((r) => r === 'domain_probe')).toHaveLength(0)
  })

  it('ne s’applique pas sans domaine à éprouver', () => {
    // Cas des providers grand public : `gmail.com` héberge des milliers de
    // boîtes indépendantes, éprouver le domaine n'aurait aucun sens.
    const items = [item({ probeDomain: null }), item({ probeDomain: null }), item({ probeDomain: null })]
    const reasons = reasonsOf(items, settings())
    expect([...reasons.values()].filter((r) => r === 'domain_probe')).toHaveLength(0)
  })

  it('se désactive avec le réglage', () => {
    const items = [item({ probeDomain: 'garage-dupont.fr' }), item({ probeDomain: 'garage-dupont.fr' })]
    const reasons = reasonsOf(items, settings({ domainFirstTouch: false }))
    expect([...reasons.values()].filter((r) => r === 'domain_probe')).toHaveLength(0)
  })
})

/* ── Non-régression ──────────────────────────────────────────────────────── */

describe('file — ce qui ne devait pas changer', () => {
  it('planifie normalement une file sans information de vérification', () => {
    // Migration non appliquée : `riskyEmail` et `probeDomain` sont absents, la
    // file doit se comporter exactement comme avant.
    const items = Array.from({ length: 3 }, () => item())
    const planned = plan(items, settings())
    expect(planned.every((p) => p.at != null)).toBe(true)
  })

  it('garde la priorité de la pause globale sur tout le reste', () => {
    const items = [item({ riskyEmail: true, probeDomain: 'garage.fr' })]
    expect(reasonsOf(items, settings({ paused: true })).get(items[0].id)).toBe('global_pause')
  })
})

/* ── Libellés ────────────────────────────────────────────────────────────── */

describe('holdReasonLabel', () => {
  it('explique les nouveaux motifs en français, sans jargon', () => {
    expect(holdReasonLabel('email_invalid')).toBe('adresse invalide — à corriger')
    expect(holdReasonLabel('email_pending')).toBe('vérification de l’adresse en cours')
    expect(holdReasonLabel('risky_cap')).toBe('quota du jour atteint pour les adresses douteuses')
    expect(holdReasonLabel('domain_probe')).toBe('domaine à éprouver — une adresse part, les autres suivent')
  })
})
