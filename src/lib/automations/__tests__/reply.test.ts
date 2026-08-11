/**
 * @jest-environment node
 */

const mockAdvance = jest.fn();
jest.mock('../engine', () => ({
  advanceEnrollmentAfterReply: (...args: unknown[]) => mockAdvance(...args),
}));

import { declarerReponse } from '../reply';

type Row = Record<string, unknown> | null;

/** Client Supabase minimal : une seule table, une seule ligne. */
const client = (row: Row) => {
  const updates: Record<string, unknown>[] = [];
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => Promise.resolve({ data: row, error: null }),
    update: (u: Record<string, unknown>) => {
      updates.push(u);
      return chain;
    },
  };
  return { sb: { from: () => chain } as any, updates };
};

const gare = {
  id: 'enr-1',
  status: 'active',
  current_step: 1,
  hold_reason: 'awaiting_reply',
  vars: { skippedSteps: [2] },
};

describe('declarerReponse', () => {
  beforeEach(() => mockAdvance.mockReset());

  it('date la réponse, lève le garage et fait repartir la séquence', async () => {
    const { sb, updates } = client(gare);

    const result = await declarerReponse(sb, 'enr-1');

    expect(result).toEqual({ ok: true, stepIndex: 1 });
    expect(updates[0].hold_reason).toBeNull();
    const vars = updates[0].vars as { replies: Record<string, string>; skippedSteps: number[] };
    expect(typeof vars.replies['1']).toBe('string');
    // Le reste du sac de contexte survit : écraser `vars` perdrait les étapes
    // annulées et les décalages posés à la main depuis la vue semaine.
    expect(vars.skippedSteps).toEqual([2]);
    expect(mockAdvance).toHaveBeenCalledWith('enr-1');
  });

  it('refuse une inscription introuvable', async () => {
    const { sb } = client(null);
    expect(await declarerReponse(sb, 'enr-1')).toEqual({ ok: false, error: 'introuvable' });
    expect(mockAdvance).not.toHaveBeenCalled();
  });

  it('refuse une inscription déjà sortie de séquence', async () => {
    const { sb } = client({ ...gare, status: 'exited' });
    expect(await declarerReponse(sb, 'enr-1')).toEqual({ ok: false, error: 'inactive' });
    expect(mockAdvance).not.toHaveBeenCalled();
  });

  // Le double-clic, ou un bouton resté affiché après un rafraîchissement :
  // avancer ici coûterait un message au prospect, sauté en silence.
  it('refuse quand la séquence n’attend pas de réponse', async () => {
    const { sb, updates } = client({ ...gare, hold_reason: null });
    expect(await declarerReponse(sb, 'enr-1')).toEqual({ ok: false, error: 'pas_en_attente' });
    expect(updates).toHaveLength(0);
    expect(mockAdvance).not.toHaveBeenCalled();
  });
});
