/**
 * @jest-environment node
 */

const mockAdvance = jest.fn();
const mockReprendre = jest.fn();
jest.mock('../engine', () => ({
  advanceEnrollmentAfterReply: (...args: unknown[]) => mockAdvance(...args),
  reprendreSurLaBrancheReponse: (...args: unknown[]) => mockReprendre(...args),
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

/**
 * Client à deux tables : l'inscription, et la définition de sa séquence. Le
 * rattrapage a besoin des étapes pour savoir où revenir.
 */
const clientAvecSequence = (row: Row, steps: unknown[]) => {
  const updates: Record<string, unknown>[] = [];
  const make = (data: Row) => {
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: () => Promise.resolve({ data, error: null }),
      update: (u: Record<string, unknown>) => {
        updates.push(u);
        return chain;
      },
    };
    return chain;
  };
  const tables: Record<string, any> = {
    sequence_enrollments: make(row),
    automations: make({ definition: { steps } }),
  };
  return { sb: { from: (t: string) => tables[t] } as any, updates };
};

const gare = {
  id: 'enr-1',
  automation_id: 'auto-1',
  status: 'active',
  current_step: 1,
  hold_reason: 'awaiting_reply',
  vars: { skippedSteps: [2] },
};

/** L'accroche, l'attente à délai, puis les deux suites, puis le tronc. */
const BRANCHEE = [
  { id: 's1', kind: 'whatsapp', day: 0 },
  { id: 's2', kind: 'wait', day: 0, waitMode: 'reply', replyTimeoutDays: 3 },
  { id: 's3', kind: 'whatsapp', day: 0, branch: { waitId: 's2', on: 'reply' } },
  { id: 's4', kind: 'whatsapp', day: 3, branch: { waitId: 's2', on: 'timeout' } },
  { id: 's5', kind: 'call', day: 5 },
];

describe('declarerReponse', () => {
  beforeEach(() => {
    mockAdvance.mockReset();
    mockReprendre.mockReset();
  });

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
  it('refuse quand la séquence n’attend pas de réponse et n’a rien à rattraper', async () => {
    const { sb, updates } = clientAvecSequence({ ...gare, hold_reason: null }, BRANCHEE);
    expect(await declarerReponse(sb, 'enr-1')).toEqual({ ok: false, error: 'pas_en_attente' });
    expect(updates).toHaveLength(0);
    expect(mockAdvance).not.toHaveBeenCalled();
    expect(mockReprendre).not.toHaveBeenCalled();
  });

  /* ── Le demi-tour ─────────────────────────────────────────────────────────
   * Un prospect qui répond APRÈS la relance est le cas le plus fréquent : c'est
   * elle qui l'a réveillé. Sans ce rattrapage, la seule issue était de laisser
   * la séquence enchaîner des relances à quelqu'un qui vient d'écrire.
   */
  it('ramène sur la voie « il a répondu » quand la relance est déjà partie', async () => {
    // L'inscription est sur `s4`, la relance de la voie silence.
    const { sb, updates } = clientAvecSequence(
      { ...gare, hold_reason: null, current_step: 3 },
      BRANCHEE,
    );

    const result = await declarerReponse(sb, 'enr-1');

    expect(result).toEqual({ ok: true, stepIndex: 1, rattrapage: true });
    // La réponse se note sur l'ATTENTE (index 1), pas sur l'étape courante :
    // c'est elle qui décide de la voie, et c'est elle que le moteur relira.
    const vars = updates[0].vars as { replies: Record<string, string> };
    expect(typeof vars.replies['1']).toBe('string');
    expect(vars.replies['3']).toBeUndefined();
    // Retour au DÉBUT de la voie réponse (`s3`, index 2), l'ancre posée sur
    // l'attente : les J+n de cette voie ont été écrits en partant de là.
    expect(mockReprendre).toHaveBeenCalledWith('enr-1', 2, 1);
    expect(mockAdvance).not.toHaveBeenCalled();
  });

  it('ne rattrape rien depuis le tronc commun', async () => {
    const { sb, updates } = clientAvecSequence(
      { ...gare, hold_reason: null, current_step: 4 },
      BRANCHEE,
    );
    expect(await declarerReponse(sb, 'enr-1')).toEqual({ ok: false, error: 'pas_en_attente' });
    expect(updates).toHaveLength(0);
  });

  it('ne rattrape rien quand aucune voie « il a répondu » n’est écrite', async () => {
    // Rien à rejoindre : avancer d'une étape au hasard ferait partir un message
    // que personne n'a écrit pour ce cas.
    const sansVoieReponse = [
      { id: 's1', kind: 'whatsapp', day: 0 },
      { id: 's2', kind: 'wait', day: 0, waitMode: 'reply', replyTimeoutDays: 3 },
      { id: 's3', kind: 'whatsapp', day: 3, branch: { waitId: 's2', on: 'timeout' } },
    ];
    const { sb, updates } = clientAvecSequence(
      { ...gare, hold_reason: null, current_step: 2 },
      sansVoieReponse,
    );
    expect(await declarerReponse(sb, 'enr-1')).toEqual({ ok: false, error: 'pas_en_attente' });
    expect(updates).toHaveLength(0);
  });
});
