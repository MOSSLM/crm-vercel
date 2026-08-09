/**
 * @jest-environment node
 */
import type { Opportunity, PipelineStage } from '@/types'
import type { JournalKpiTotals } from '@/utils/journalApi'

import { calculateDashboardMetrics } from '../calculations'

const emptyPeriod = {
  total_appels: 0,
  total_relances: 0,
  total_rdvs: 0,
  total_devis: 0,
  total_signatures: 0,
  total_acomptes: 0,
  total_lead_magnets: 0,
}

const KPIS: JournalKpiTotals = {
  ...emptyPeriod,
  week: { ...emptyPeriod },
  month: { ...emptyPeriod },
  quarter: { ...emptyPeriod },
  year: { ...emptyPeriod },
}

const STAGES: PipelineStage[] = [
  { id: 1, nom: 'Qualifié', ordre: 10 },
  { id: 2, nom: 'Signature', ordre: 50 },
  { id: 3, nom: 'Acompte', ordre: 60 },
] as unknown as PipelineStage[]

const opp = (over: Partial<Opportunity> & { id: string }): Opportunity =>
  ({
    priorite: 'moyenne',
    lead_magnet: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    stage_id: 1,
    ...over,
  }) as Opportunity

const run = (opportunities: Opportunity[]) =>
  calculateDashboardMetrics(
    KPIS,
    'total',
    opportunities,
    STAGES,
    (stageId) => opportunities.filter((o) => String(o.stage_id) === stageId),
    [],
    10,
    4,
  )

describe('calculateDashboardMetrics — les archivées ne comptent plus', () => {
  // Le cœur du sujet : archiver une piste morte doit faire baisser le pipeline.
  // Sans ça, l'archivage était purement cosmétique côté chiffres.
  it('exclut la valeur des opportunités archivées du pipeline', () => {
    const vivantes = run([opp({ id: 'a', montant: 1000 }), opp({ id: 'b', montant: 500 })])
    expect(vivantes.totalPipelineValue).toBe(1500)

    const avecArchivee = run([
      opp({ id: 'a', montant: 1000 }),
      opp({ id: 'b', montant: 500 }),
      opp({ id: 'c', montant: 9000, archived_at: '2026-08-09T10:00:00Z' }),
    ])
    expect(avecArchivee.totalPipelineValue).toBe(1500)
  })

  it('ne compte pas les archivées dans le ticket moyen', () => {
    const { averageDealValue } = run([
      opp({ id: 'a', montant: 1000 }),
      opp({ id: 'b', montant: 9000, archived_at: '2026-08-09T10:00:00Z' }),
    ])
    // 1000 / 1, et non 1000 / 2 ni 10000 / 2.
    expect(averageDealValue).toBe(1000)
  })

  it('sort les archivées du CA signé et des acomptes', () => {
    const { totalSigned, totalCollected } = run([
      opp({ id: 'a', montant: 2000, stage_id: 2 }),
      opp({ id: 'b', montant: 8000, stage_id: 2, archived_at: '2026-08-09T10:00:00Z' }),
      opp({ id: 'c', montant: 1000, stage_id: 3 }),
    ])
    expect(totalSigned).toBe(3000)
    expect(totalCollected).toBe(500)
  })

  it('sort les archivées de la répartition par étape', () => {
    const { pipelineBreakdown } = run([
      opp({ id: 'a', montant: 1000, stage_id: 1 }),
      opp({ id: 'b', montant: 7000, stage_id: 1, archived_at: '2026-08-09T10:00:00Z' }),
    ])
    const qualifie = pipelineBreakdown.find((p) => p.name.toLowerCase().includes('qualifié'))
    expect(qualifie?.opportunities).toBe(1)
    expect(qualifie?.value).toBe(1000)
  })

  // La garde qui compte : le calcul refiltre lui-même, donc un appelant qui lui
  // passerait la liste brute d'`AppDataContext` obtient quand même des chiffres
  // justes.
  it('refiltre lui-même, sans faire confiance à l’appelant', () => {
    const brut = [
      opp({ id: 'a', montant: 1000 }),
      opp({ id: 'archivee', montant: 50_000, archived_at: '2026-08-09T10:00:00Z' }),
    ]
    expect(run(brut).totalPipelineValue).toBe(1000)
  })
})
