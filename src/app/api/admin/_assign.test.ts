/**
 * @jest-environment node
 */
const mockFrom = jest.fn();

jest.mock('@/env', () => ({
  SUPABASE_URL: 'http://localhost',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role',
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ from: (...args: unknown[]) => mockFrom(...args) })),
}));

import {
  assignProspectToAgent,
  assignProspectsToAgent,
  unassignProspectFromAgent,
  unassignProspectsFromAgent,
} from './_assign';
import { __resetServiceClientForTests } from '@/app/api/_lib/service-client';

type Op = 'select' | 'insert' | 'update' | 'delete';
type Result = { data?: unknown; error?: unknown };

/** Requêtes émises, dans l'ordre, pour pouvoir assertion sur les écritures. */
let calls: { table: string; op: Op; payload?: unknown }[] = [];
/**
 * Réponses par `table` ou `table.op`, défaut `{ data: null, error: null }`.
 * Un tableau est consommé requête après requête : c'est ce qui permet de
 * donner un sort différent à chaque entreprise d'un même lot.
 */
let results: Record<string, Result | Result[]> = {};

const resultFor = (table: string, op: Op): Result => {
  const entry = results[`${table}.${op}`] ?? results[table];
  const value = Array.isArray(entry) ? (entry.shift() ?? {}) : (entry ?? {});
  return { data: null, error: null, ...value };
};

/** Chaîne Supabase minimale : tous les filtres renvoient la chaîne elle-même. */
const makeChain = (table: string) => {
  let op: Op = 'select';
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'neq', 'in', 'is', 'not', 'or', 'order', 'limit']) {
    chain[m] = () => chain;
  }
  const record = (next: Op, payload?: unknown) => {
    op = next;
    calls.push({ table, op: next, payload });
    return chain;
  };
  chain.update = (payload: unknown) => record('update', payload);
  chain.insert = (payload: unknown) => record('insert', payload);
  chain.delete = () => record('delete');
  chain.maybeSingle = async () => resultFor(table, op);
  chain.single = async () => resultFor(table, op);
  chain.then = (resolve: (v: Result) => unknown) => resolve(resultFor(table, op));
  return chain;
};

const AGENT = 'agent-1';
const ENT = 42;

const updatesOn = (table: string) =>
  calls.filter((c) => c.table === table && c.op === 'update').map((c) => c.payload);

beforeEach(() => {
  __resetServiceClientForTests();
  calls = [];
  results = {
    // getAgentPipeline
    pipelines: { data: { id: 'pipe-1' } },
    etapes_pipeline: { data: [{ id: 1, nom: 'Nouveau lead', ordre: 10 }] },
  };
  mockFrom.mockImplementation((table: string) => makeChain(table));
});

afterEach(() => jest.clearAllMocks());

describe('unassignProspectFromAgent', () => {
  it("libère l'entreprise, ses affaires, ses tâches et ses séquences", async () => {
    results['entreprises.select'] = { data: { id: ENT, owner_id: AGENT } };
    results['opportunites.select'] = { data: [{ id: 'opp-1', owner_id: AGENT }] };

    const res = await unassignProspectFromAgent(ENT, AGENT);

    expect(res).toEqual({ ok: true, entrepriseId: ENT, agentId: AGENT });
    expect(updatesOn('entreprises')).toEqual([{ owner_id: null }]);
    expect(updatesOn('opportunites')).toEqual([{ owner_id: null }]);
    expect(calls).toContainEqual({ table: 'prospection_tasks', op: 'delete', payload: undefined });
    expect(updatesOn('sequence_enrollments')).toEqual([
      { status: 'exited', next_run_at: null },
    ]);
  });

  // La régression : l'entreprise était déjà repassée owner_id NULL mais son
  // affaire restait attribuée — l'agent voyait le prospect dans son pipeline
  // alors que l'admin en comptait zéro, et re-cliquer « Retirer » ne faisait
  // plus rien. Rejouer le retrait doit réconcilier.
  it('libère quand même les affaires si l\'entreprise est déjà dans le pool', async () => {
    results['entreprises.select'] = { data: { id: ENT, owner_id: null } };
    results['opportunites.select'] = { data: [{ id: 'opp-1', owner_id: AGENT }] };

    const res = await unassignProspectFromAgent(ENT, AGENT);

    expect(res).toEqual({ ok: true, entrepriseId: ENT, agentId: null });
    expect(updatesOn('entreprises')).toEqual([]);
    expect(updatesOn('opportunites')).toEqual([{ owner_id: null }]);
  });

  it("remonte l'erreur au lieu d'annoncer un retrait réussi", async () => {
    results['entreprises.select'] = { data: { id: ENT, owner_id: AGENT } };
    results['opportunites.select'] = { data: [{ id: 'opp-1', owner_id: AGENT }] };
    results['opportunites.update'] = { error: { message: 'boom' } };

    expect(await unassignProspectFromAgent(ENT, AGENT)).toEqual({ ok: false, error: 'boom' });
  });

  it('refuse de retirer une entreprise attribuée à un autre agent', async () => {
    results['entreprises.select'] = { data: { id: ENT, owner_id: 'agent-2' } };

    const res = await unassignProspectFromAgent(ENT, AGENT);

    expect(res).toEqual({ ok: false, error: 'entreprise_attribuee_a_un_autre_agent' });
    expect(updatesOn('entreprises')).toEqual([]);
    expect(updatesOn('opportunites')).toEqual([]);
  });
});

describe('assignProspectToAgent', () => {
  it('recolle les affaires sur le nouveau propriétaire', async () => {
    results['entreprises.update'] = { data: { id: ENT, name: 'ACME', telephone: null } };
    results['opportunites.select'] = { data: [{ id: 'opp-1', owner_id: null }] };

    const res = await assignProspectToAgent(ENT, AGENT);

    expect(res).toEqual({ ok: true, entrepriseId: ENT, agentId: AGENT, opportuniteId: 'opp-1' });
    expect(updatesOn('opportunites')).toEqual([{ owner_id: AGENT }]);
    // Affaire récupérée du pool → l'appel à froid est réamorcé.
    expect(calls.some((c) => c.table === 'prospection_tasks' && c.op === 'insert')).toBe(true);
  });

  it("ne réamorce pas l'appel à froid quand l'agent a déjà l'affaire", async () => {
    results['entreprises.update'] = { data: { id: ENT, name: 'ACME', telephone: null } };
    results['opportunites.select'] = { data: [{ id: 'opp-1', owner_id: AGENT }] };

    const res = await assignProspectToAgent(ENT, AGENT);

    expect(res).toEqual({ ok: true, entrepriseId: ENT, agentId: AGENT, opportuniteId: 'opp-1' });
    expect(calls.some((c) => c.table === 'prospection_tasks' && c.op === 'insert')).toBe(false);
  });
});

describe('attributions en masse', () => {
  it('attribue tout le lot en ne résolvant le pipeline agent qu\'une fois', async () => {
    results['entreprises.update'] = { data: { id: ENT, name: 'ACME', telephone: null } };
    results['opportunites.select'] = { data: [{ id: 'opp-1', owner_id: null }] };

    const res = await assignProspectsToAgent([ENT, ENT + 1, ENT], AGENT);

    // Le doublon est écarté avant l'écriture.
    expect(res).toEqual({
      ok: true,
      assigned: [
        { entreprise_id: ENT, opportunite_id: 'opp-1' },
        { entreprise_id: ENT + 1, opportunite_id: 'opp-1' },
      ],
      failed: [],
    });
    const pipelineLookups = mockFrom.mock.calls.filter(([table]) => table === 'pipelines');
    expect(pipelineLookups).toHaveLength(1);
  });

  it("retire le lot et rend compte des échecs entreprise par entreprise", async () => {
    // La 2e appartient à un autre agent : elle doit échouer seule.
    results['entreprises.select'] = [
      { data: { id: ENT, owner_id: AGENT } },
      { data: { id: ENT + 1, owner_id: 'agent-2' } },
    ];
    results['opportunites.select'] = { data: [{ id: 'opp-1', owner_id: AGENT }] };

    const res = await unassignProspectsFromAgent([ENT, ENT + 1], AGENT);

    expect(res).toEqual({
      released: [ENT],
      failed: [{ entreprise_id: ENT + 1, error: 'entreprise_attribuee_a_un_autre_agent' }],
    });
  });
});
