/**
 * @jest-environment node
 */
jest.mock('@/env', () => ({
  SUPABASE_URL: 'http://localhost',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role',
}));

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn(() => ({ from: jest.fn() })) }));

import { dealsByEntreprise, type OppRow, type PipelineRow, type StageRow } from './_agent-pool';

const PIPELINES = new Map<string, PipelineRow>([
  ['p-web', { id: 'p-web', nom: 'Entreprises sans site web', ordre: 1 }],
  ['p-reseaux', { id: 'p-reseaux', nom: 'Réseaux sociaux', ordre: 2 }],
  ['p-agent', { id: 'p-agent', nom: 'Agent SAMA', ordre: 9 }],
]);

const STAGES = new Map<number, StageRow>([
  [1, { id: 1, nom: 'Nouveau lead', pipeline_id: 'p-web', ordre: 1 }],
  [2, { id: 2, nom: 'Contacté', pipeline_id: 'p-web', ordre: 2 }],
]);

const opp = (o: Partial<OppRow>): OppRow => ({
  entreprise_id: 1,
  pipeline_id: 'p-web',
  stage_id: null,
  updated_at: null,
  ...o,
});

describe('dealsByEntreprise', () => {
  it('rattache une entreprise à chacun de ses pipelines, dans leur ordre', () => {
    const deals = dealsByEntreprise(
      [opp({ pipeline_id: 'p-reseaux' }), opp({ pipeline_id: 'p-web', stage_id: 1 })],
      PIPELINES,
      STAGES,
    );

    expect(deals.get(1)).toEqual([
      { pipeline_id: 'p-web', pipeline_nom: 'Entreprises sans site web', stage_id: 1, stage_nom: 'Nouveau lead' },
      { pipeline_id: 'p-reseaux', pipeline_nom: 'Réseaux sociaux', stage_id: null, stage_nom: null },
    ]);
  });

  // Deux affaires dans le même pipeline ne doivent pas produire deux badges :
  // c'est la plus fraîche qui décrit où en est l'entreprise.
  it('ne garde que l\'affaire la plus récente par pipeline', () => {
    const deals = dealsByEntreprise(
      [
        opp({ stage_id: 1, updated_at: '2026-01-01T00:00:00Z' }),
        opp({ stage_id: 2, updated_at: '2026-06-01T00:00:00Z' }),
      ],
      PIPELINES,
      STAGES,
    );

    expect(deals.get(1)).toEqual([
      { pipeline_id: 'p-web', pipeline_nom: 'Entreprises sans site web', stage_id: 2, stage_nom: 'Contacté' },
    ]);
  });

  it('écarte le pipeline demandé — celui de l\'agent, commun à tous ses prospects', () => {
    const deals = dealsByEntreprise(
      [opp({ pipeline_id: 'p-agent' }), opp({ pipeline_id: 'p-web' })],
      PIPELINES,
      STAGES,
      'p-agent',
    );

    expect(deals.get(1)?.map((d) => d.pipeline_id)).toEqual(['p-web']);
  });

  it('ignore les affaires sans entreprise ou sur un pipeline inconnu', () => {
    const deals = dealsByEntreprise(
      [opp({ entreprise_id: null }), opp({ entreprise_id: 2, pipeline_id: 'p-supprimé' })],
      PIPELINES,
      STAGES,
    );

    expect(deals.size).toBe(0);
  });
});
