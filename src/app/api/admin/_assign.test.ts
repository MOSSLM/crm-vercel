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
    // Le motif compte autant que la sortie : « reattribution » veut dire que le
    // prospect reste à démarcher, il rejoint le stock au lieu des démarchés.
    expect(updatesOn('sequence_enrollments')).toEqual([
      { status: 'exited', next_run_at: null, exit_reason: 'reattribution' },
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

/** L'entreprise telle que la lit `assignProspectToAgent`, avant réattribution. */
const entreprise = (ownerId: string | null, qualifie = false) => ({
  data: { id: ENT, name: 'ACME', telephone: null, owner_id: ownerId, qualifie },
});

const insertsOn = (table: string) =>
  calls.filter((c) => c.table === table && c.op === 'insert').map((c) => c.payload);

describe('assignProspectToAgent', () => {
  // LA régression : l'entreprise avait déjà une affaire, mais dans un autre
  // pipeline que « Agent SAMA ». L'ancienne recherche, bornée à ce pipeline, ne
  // trouvait rien et ouvrait une SECONDE affaire. 47 entreprises attribuées le
  // 3 août ont produit 47 doublons de cette façon.
  it("reprend l'affaire d'un autre pipeline au lieu d'en créer une seconde", async () => {
    results['entreprises.select'] = entreprise(null);
    results['opportunites.select'] = {
      data: [
        {
          id: 'opp-streak',
          owner_id: null,
          pipeline_id: 'p-streak',
          stage_id: 42,
          created_at: '2026-03-06T01:07:30Z',
          is_test: false,
        },
      ],
    };

    const res = await assignProspectToAgent(ENT, AGENT);

    expect(res).toEqual({ ok: true, entrepriseId: ENT, agentId: AGENT, opportuniteId: 'opp-streak' });
    expect(insertsOn('opportunites')).toEqual([]);
  });

  // L'INVARIANT : une affaire implique une entreprise qualifiée.
  // 501 fiches des deux cohortes d'août l'ont violé — attribuées, démarchées, et
  // absentes de l'onglet « Qualifiés », parce que l'attribution n'écrivait que
  // `owner_id`. Le CRM annonçait 882 opportunités pour 361 entreprises qualifiées.
  it('qualifie l’entreprise en même temps qu’elle est attribuée', async () => {
    results['entreprises.select'] = entreprise(null, false);
    results['opportunites.select'] = { data: [{ id: 'opp-1', owner_id: null, is_test: false }] };

    await assignProspectToAgent(ENT, AGENT);

    expect(updatesOn('entreprises')).toEqual([{ owner_id: AGENT, qualifie: true }]);
  });

  // Déjà qualifiée : on ne réécrit pas `qualifie`. L'update inutile toucherait
  // `updated_at` et ferait passer la fiche pour modifiée alors que rien n'a bougé.
  it('ne réécrit pas qualifie sur une entreprise déjà qualifiée', async () => {
    results['entreprises.select'] = entreprise(null, true);
    results['opportunites.select'] = { data: [{ id: 'opp-1', owner_id: null, is_test: false }] };

    await assignProspectToAgent(ENT, AGENT);

    expect(updatesOn('entreprises')).toEqual([{ owner_id: AGENT }]);
  });

  // « L'affaire ne change pas de pipeline » : l'attribution n'écrit QUE
  // `owner_id`. Écrire `stage_id` déclencherait
  // `trg_sync_opportunity_pipeline_from_stage`, qui dérive `pipeline_id` de
  // l'étape et déplacerait l'affaire.
  it("n'écrit jamais ni pipeline_id ni stage_id sur l'affaire reprise", async () => {
    results['entreprises.select'] = entreprise(null);
    results['opportunites.select'] = {
      data: [{ id: 'opp-streak', owner_id: null, pipeline_id: 'p-streak', stage_id: 42, is_test: false }],
    };

    await assignProspectToAgent(ENT, AGENT);

    for (const patch of updatesOn('opportunites')) {
      expect(patch).not.toHaveProperty('pipeline_id');
      expect(patch).not.toHaveProperty('stage_id');
    }
  });

  // Réattribuer de l'agent B à l'agent A reprend l'affaire de B : l'attribution
  // admin est autoritaire. L'ancien filtre `owner_id === agent || null` l'écartait
  // et forgeait un doublon, que `syncOpportuniteOwners` donnait ensuite à A —
  // deux affaires pour A sur la même entreprise.
  it("reprend l'affaire d'un autre agent au lieu d'en créer une seconde", async () => {
    results['entreprises.select'] = entreprise('agent-2');
    results['opportunites.select'] = {
      data: [{ id: 'opp-1', owner_id: 'agent-2', pipeline_id: 'p-streak', is_test: false }],
    };

    const res = await assignProspectToAgent(ENT, AGENT);

    expect(res).toEqual({ ok: true, entrepriseId: ENT, agentId: AGENT, opportuniteId: 'opp-1' });
    expect(insertsOn('opportunites')).toEqual([]);
    expect(updatesOn('opportunites')).toEqual([{ owner_id: AGENT }]);
  });

  it("ne crée une affaire que si l'entreprise n'en a aucune", async () => {
    results['entreprises.select'] = entreprise(null);
    results['opportunites.select'] = { data: [] };
    results['opportunites.insert'] = { data: { id: 'opp-neuve' } };

    const res = await assignProspectToAgent(ENT, AGENT);

    expect(res).toEqual({ ok: true, entrepriseId: ENT, agentId: AGENT, opportuniteId: 'opp-neuve' });
    expect(insertsOn('opportunites')).toEqual([
      {
        entreprise_id: ENT,
        owner_id: AGENT,
        pipeline_id: 'pipe-1',
        stage_id: 1,
        name: 'ACME',
      },
    ]);
  });

  // Une affaire de test porte sa propre entreprise fictive : elle ne compte pas
  // comme « cette entreprise a déjà une affaire ».
  it('ignore les affaires de test', async () => {
    results['entreprises.select'] = entreprise(null);
    results['opportunites.select'] = { data: [{ id: 'opp-test', owner_id: null, is_test: true }] };
    results['opportunites.insert'] = { data: { id: 'opp-neuve' } };

    const res = await assignProspectToAgent(ENT, AGENT);

    expect(res.ok && res.opportuniteId).toBe('opp-neuve');
  });

  // Le trigger `entreprises_sync_opportunite_owner` propage `owner_id` sur les
  // affaires dès que l'entreprise change de main. Si on jugeait « déjà attribué »
  // d'après l'affaire, il serait toujours vrai et l'appel à froid ne serait
  // jamais semé. C'est l'ancien propriétaire de l'ENTREPRISE qui fait foi.
  it("sème l'appel à froid même si l'affaire porte déjà le bon propriétaire", async () => {
    results['entreprises.select'] = entreprise(null);
    results['opportunites.select'] = {
      data: [{ id: 'opp-1', owner_id: AGENT, pipeline_id: 'p-streak', is_test: false }],
    };

    await assignProspectToAgent(ENT, AGENT);

    expect(calls.some((c) => c.table === 'prospection_tasks' && c.op === 'insert')).toBe(true);
  });

  it("ne réamorce pas l'appel à froid quand l'agent avait déjà l'entreprise", async () => {
    results['entreprises.select'] = entreprise(AGENT);
    results['opportunites.select'] = {
      data: [{ id: 'opp-1', owner_id: AGENT, pipeline_id: 'p-streak', is_test: false }],
    };

    const res = await assignProspectToAgent(ENT, AGENT);

    expect(res).toEqual({ ok: true, entrepriseId: ENT, agentId: AGENT, opportuniteId: 'opp-1' });
    expect(calls.some((c) => c.table === 'prospection_tasks' && c.op === 'insert')).toBe(false);
  });

  it("échoue proprement sur une entreprise inconnue", async () => {
    results['entreprises.select'] = { data: null };

    expect(await assignProspectToAgent(ENT, AGENT)).toEqual({
      ok: false,
      error: 'entreprise_introuvable',
    });
  });
});

describe('attributions en masse', () => {
  it('attribue tout le lot en ne résolvant le pipeline agent qu\'une fois', async () => {
    results['entreprises.select'] = { data: { id: ENT, name: 'ACME', telephone: null, owner_id: null } };
    results['opportunites.select'] = {
      data: [{ id: 'opp-1', owner_id: null, pipeline_id: 'p-streak', is_test: false }],
    };

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
