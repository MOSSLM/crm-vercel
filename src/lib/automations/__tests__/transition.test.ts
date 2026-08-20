/**
 * @jest-environment node
 *
 * Le passage de relais, et le filet à boucles.
 *
 * Ce que ce fichier protège : découper le démarchage en plusieurs séquences
 * rend possible une faute que la séquence unique interdisait — deux fils de
 * messages en parallèle chez le même artisan, ou un aller-retour sans fin entre
 * deux séquences qui se renvoient la balle. Les deux coûtent des messages
 * réels, et ni l'un ni l'autre ne se voit sur un écran.
 */
const mockFrom = jest.fn();
jest.mock('@/app/api/_lib/service-client', () => ({
  getServiceClient: () => ({ from: (...args: unknown[]) => mockFrom(...args) }),
}));

import { processSequenceEnrollment } from '../engine';
import { MAX_TOURS } from '../branches';
import type { SequenceEnrollment } from '@/components/automations/types';

type Capture = { table: string; updates: Record<string, unknown>[]; inserts: Record<string, unknown>[] };

/** Une chaîne Supabase qui rend `result` et retient ce qu'on lui écrit. */
const chain = (result: unknown, capture: Capture) => {
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'neq', 'in', 'not', 'lte', 'gte', 'order', 'limit']) {
    c[m] = jest.fn(() => c);
  }
  c.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: result, error: null }).then(res);
  c.maybeSingle = jest.fn().mockResolvedValue({ data: result, error: null });
  c.single = jest.fn().mockResolvedValue({ data: result, error: null });
  c.update = jest.fn((u: Record<string, unknown>) => {
    capture.updates.push(u);
    return c;
  });
  c.insert = jest.fn((i: Record<string, unknown>) => {
    capture.inserts.push(i);
    return c;
  });
  return c;
};

const SEQ_SOURCE = {
  id: 'auto-1',
  name: 'Premier contact',
  kind: 'sequence',
  status: 'on',
  settings: {},
  definition: {
    steps: [{ id: 't1', kind: 'transition', day: 0, transition: { automationId: 'auto-2' } }],
  },
};

const SEQ_CIBLE = {
  id: 'auto-2',
  name: 'Prospect engagé',
  kind: 'sequence',
  status: 'paused',
  settings: {},
  definition: { steps: [{ id: 's1', kind: 'whatsapp', day: 0 }] },
};

const inscription = (vars: Record<string, unknown> = {}): SequenceEnrollment => ({
  id: 'enr-1',
  automation_id: 'auto-1',
  contact_id: null,
  opportunite_id: null,
  entreprise_id: 42,
  current_step: 0,
  status: 'active',
  next_run_at: new Date().toISOString(),
  vars,
  created_by: null,
  entered_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  finished_at: null,
});

/**
 * Le monde vu par le moteur : deux séquences, une entreprise joignable, et un
 * cahier de tout ce qui a été écrit, table par table.
 */
function monde(opts: { definitionSource?: unknown; dejaInscrit?: boolean } = {}) {
  const cahier: Record<string, Capture> = {};
  const pour = (table: string) => (cahier[table] ??= { table, updates: [], inserts: [] });
  // Le compteur vit ICI et pas dans la chaîne : `from('automations')` est
  // rappelé à chaque lecture, donc un compteur local repartirait de zéro et le
  // moteur relirait éternellement la séquence source.
  let lectureAuto = 0;

  mockFrom.mockImplementation((table: string) => {
    const capture = pour(table);
    if (table === 'automations') {
      // Le moteur relit la source, puis la destination : on rend celle qu'on
      // lui demande en se fiant à l'ordre des lectures.
      const source = opts.definitionSource
        ? { ...SEQ_SOURCE, definition: opts.definitionSource }
        : SEQ_SOURCE;
      const c = chain(source, capture) as Record<string, unknown>;
      // Première lecture : la séquence source. Ensuite : la destination.
      c.maybeSingle = jest.fn(async () => ({ data: lectureAuto++ === 0 ? source : SEQ_CIBLE, error: null }));
      return c;
    }
    if (table === 'entreprises') {
      return chain({ id: 42, nom: 'SARL Martin', email: 'contact@martin.fr', telephone: '0612345678' }, capture);
    }
    if (table === 'sequence_enrollments') {
      const c = chain(null, capture) as Record<string, unknown>;
      // La déduplication d'`enrollInSequence` : personne d'inscrit en face,
      // sauf si le test le demande.
      c.maybeSingle = jest.fn().mockResolvedValue({
        data: opts.dejaInscrit ? { id: 'enr-2' } : null,
        error: null,
      });
      c.single = jest.fn().mockResolvedValue({ data: { id: 'enr-neuve' }, error: null });
      return c;
    }
    return chain(null, capture);
  });

  return cahier;
}

beforeEach(() => mockFrom.mockReset());

describe('le passage de relais', () => {
  it('ouvre l’inscription en face et FERME celle d’ici', async () => {
    const cahier = monde();
    await processSequenceEnrollment(inscription());

    const inscriptions = cahier['sequence_enrollments'];
    // Une inscription neuve dans la séquence visée…
    expect(inscriptions.inserts).toHaveLength(1);
    expect(inscriptions.inserts[0]).toMatchObject({ automation_id: 'auto-2', entreprise_id: 42 });
    // …qui emporte la chaîne, sans quoi le garde-fou de boucle repartirait de
    // zéro à chaque saut.
    expect((inscriptions.inserts[0].vars as Record<string, unknown>).transitions).toEqual(['auto-1']);

    // …et la sortie d'ici, avec un motif qui ne renvoie PAS le prospect au
    // stock : une inscription est déjà ouverte en face, le remettre à démarcher
    // l'inscrirait une seconde fois.
    const sortie = inscriptions.updates.find((u) => u.status === 'exited');
    expect(sortie).toMatchObject({ status: 'exited', exit_reason: 'transfert' });
  });

  /** Une séquence en pause gèle ce qu'elle reçoit avec un motif visible plutôt
   *  que de le perdre : on peut donc poser le relais avant de l'avoir lancée. */
  it('accepte une destination en pause', async () => {
    const cahier = monde();
    await processSequenceEnrollment(inscription());
    expect(cahier['sequence_enrollments'].inserts).toHaveLength(1);
  });

  it('refuse d’entrer deux fois dans la même séquence, et le dit', async () => {
    const cahier = monde();
    await processSequenceEnrollment(inscription({ transitions: ['auto-2'] }));

    expect(cahier['sequence_enrollments'].inserts).toHaveLength(0);
    const fin = cahier['sequence_enrollments'].updates.find((u) => u.status === 'finished');
    expect((fin?.vars as { fin?: { motif?: string } })?.fin?.motif).toMatch(/déjà traversée/);
  });

  it('refuse une destination absente, sans geler', async () => {
    const cahier = monde({
      definitionSource: { steps: [{ id: 't1', kind: 'transition', day: 0 }] },
    });
    await processSequenceEnrollment(inscription());

    const fin = cahier['sequence_enrollments'].updates.find((u) => u.status === 'finished');
    // TERMINÉE, pas garée : un gel sans réveil est exactement ce qui a laissé
    // 59 inscriptions dormir des semaines.
    expect(fin).toBeTruthy();
    expect(fin?.next_run_at).toBeNull();
    expect((fin?.vars as { fin?: { motif?: string } })?.fin?.motif).toMatch(/sans destination/);
  });
});

describe('le filet à boucles', () => {
  it('arrête une inscription qui repasse trop souvent par la même étape', async () => {
    const cahier = monde({
      definitionSource: {
        steps: [
          { id: 's1', kind: 'whatsapp', day: 0, mode: 'manual' },
          // Une condition : elle tranche et enchaîne dans la foulée, donc c'est
          // elle qui exerce le renvoi. Une carte manuelle poserait une tâche et
          // attendrait un humain — la boucle ne tournerait pas toute seule.
          { id: 's2', kind: 'condition', day: 0, suite: { type: 'aller_a', cible: 's1' } },
        ],
      },
    });

    // L'inscription a déjà fait ses douze tours : le treizième doit s'arrêter.
    await processSequenceEnrollment({
      ...inscription({ tours: { s1: MAX_TOURS } }),
      current_step: 1,
    });

    const fin = cahier['sequence_enrollments'].updates.find((u) => u.status === 'finished');
    expect((fin?.vars as { fin?: { motif?: string } })?.fin?.motif).toMatch(
      new RegExp(`${MAX_TOURS} tours`),
    );
  });
});
