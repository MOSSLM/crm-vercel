/**
 * @jest-environment node
 *
 * La bascule hors scénario — et la seule chose qu'elle n'a pas le droit de
 * faire.
 *
 * CE QUE CE FICHIER PROTÈGE. Changer un prospect de séquence, c'est deux
 * écritures dans deux tables, et l'ordre entre elles n'est pas une question de
 * style : sortir d'abord, c'est risquer un prospect qui n'est plus dans aucune
 * inscription vivante — donc dans aucune file, dans aucun tableau, et rien à
 * l'écran ne le signale. Il faut le chercher pour savoir qu'il manque.
 *
 * Le moteur tient déjà cette règle pour le passage de relais automatique
 * (`transition.test.ts`). Ici c'est un HUMAIN qui déclenche, au moment précis
 * où le prospect vient de nous parler — c'est-à-dire le pire moment possible
 * pour le perdre.
 */
const mockFrom = jest.fn();
jest.mock('@/app/api/_lib/service-client', () => ({
  getServiceClient: () => ({ from: (...args: unknown[]) => mockFrom(...args) }),
}));

import { basculerVersSequence, ligneDePiece, PIECES } from '../hors-scenario';
import type { SupabaseClient } from '@supabase/supabase-js';

type Capture = { updates: Record<string, unknown>[]; inserts: Record<string, unknown>[] };

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

const CIBLE = {
  id: 'auto-4',
  name: 'S4 — Il a rappelé',
  kind: 'sequence',
  status: 'on',
  settings: {},
  definition: { steps: [{ id: 'vuQ', kind: 'condition', day: 0 }] },
};

const ANCIENNE = {
  id: 'enr-1',
  automation_id: 'auto-1',
  vars: { transitions: ['auto-0'] },
};

/**
 * Le monde : une séquence cible, une inscription en cours, une entreprise
 * joignable — et le cahier de ce qui a été écrit.
 *
 * `joignable: false` reproduit le seul refus qui compte : ni e-mail ni
 * téléphone, donc `enrollInSequence` n'ouvre rien.
 */
function monde(
  opts: { joignable?: boolean; dejaInscrit?: boolean; cible?: unknown; avecAncienne?: boolean } = {},
) {
  const cahier: Record<string, Capture> = {};
  const pour = (t: string) => (cahier[t] ??= { updates: [], inserts: [] });
  let lectureInscription = 0;

  mockFrom.mockImplementation((table: string) => {
    const capture = pour(table);
    if (table === 'automations') {
      return chain('cible' in opts ? opts.cible : CIBLE, capture);
    }
    if (table === 'entreprises') {
      return chain(
        opts.joignable === false
          ? { id: 42, nom: 'SARL Martin', email: null, telephone: null, telephones: null }
          : { id: 42, nom: 'SARL Martin', email: 'contact@martin.fr', telephone: '0612345678' },
        capture,
      );
    }
    if (table === 'sequence_enrollments') {
      const c = chain(null, capture) as Record<string, unknown>;
      // Deux lectures se suivent sur cette table : l'inscription qu'on quitte,
      // puis la déduplication d'`enrollInSequence`. Les distinguer par l'ordre
      // est ce que fait déjà `transition.test.ts` pour `automations` — d'où
      // `avecAncienne`, sans quoi le cas « aucune inscription » verrait sa
      // déduplication répondre avec l'inscription qu'on ne quitte pas.
      const ancienneAttendue = opts.avecAncienne !== false;
      c.maybeSingle = jest.fn(async () => ({
        data:
          ancienneAttendue && lectureInscription++ === 0
            ? ANCIENNE
            : opts.dejaInscrit
              ? { id: 'enr-4' }
              : null,
        error: null,
      }));
      c.single = jest.fn().mockResolvedValue({ data: { id: 'enr-neuve' }, error: null });
      return c;
    }
    return chain(null, capture);
  });

  return cahier;
}

const sb = { from: (...a: unknown[]) => mockFrom(...a) } as unknown as SupabaseClient;

const ctx = {
  entrepriseId: 42,
  contactId: null,
  opportuniteId: null,
  enrollmentId: 'enr-1',
  userId: 'agent-1',
};

beforeEach(() => mockFrom.mockReset());

describe('basculerVersSequence', () => {
  it('ouvre en face, PUIS ferme ici', async () => {
    const cahier = monde();
    const r = await basculerVersSequence(sb, 'auto-4', ctx);

    const inscriptions = cahier['sequence_enrollments'];
    expect(inscriptions.inserts).toHaveLength(1);
    expect(inscriptions.inserts[0]).toMatchObject({ automation_id: 'auto-4', entreprise_id: 42 });
    // La sortie porte le motif `transfert`, qui ne renvoie pas le prospect au
    // stock à démarcher : une inscription est déjà ouverte en face.
    expect(inscriptions.updates.find((u) => u.status === 'exited')).toMatchObject({
      exit_reason: 'transfert',
    });
    expect(r.refus).toBeNull();
    expect(r.sortieDe).toBe('enr-1');
  });

  it('emporte la chaîne des séquences déjà traversées', async () => {
    const cahier = monde();
    await basculerVersSequence(sb, 'auto-4', ctx);
    // Sans elle, un aller-retour S1 → S4 → S1 ne se compterait jamais et le
    // garde-fou de boucle repartirait de zéro à chaque saut humain.
    const vars = cahier['sequence_enrollments'].inserts[0].vars as Record<string, unknown>;
    expect(vars.transitions).toEqual(['auto-0', 'auto-1']);
  });

  it('NE FERME RIEN quand rien ne s’ouvre en face', async () => {
    const cahier = monde({ joignable: false });
    const r = await basculerVersSequence(sb, 'auto-4', ctx);

    expect(r.refus).toBe('aucun_canal');
    expect(cahier['sequence_enrollments'].inserts).toHaveLength(0);
    // LE POINT DU FICHIER : l'ancienne inscription est restée en place. Un
    // prospect sans inscription vivante ne s'affiche nulle part.
    expect(cahier['sequence_enrollments'].updates.filter((u) => u.status === 'exited')).toHaveLength(0);
  });

  it('refuse une cible introuvable sans toucher à l’existant', async () => {
    const cahier = monde({ cible: null });
    const r = await basculerVersSequence(sb, 'auto-4', ctx);

    expect(r.refus).toBe('sequence_introuvable');
    expect(cahier['sequence_enrollments']?.updates ?? []).toHaveLength(0);
  });

  /**
   * Un agent qui clique deux fois ne doit pas créer deux inscriptions. La
   * seconde fois, `enrollInSequence` rend l'existante sans rien ouvrir — ce
   * n'est pas un échec, et la sortie doit quand même avoir lieu.
   */
  it('traite « il y est déjà » comme un succès, pas comme un refus', async () => {
    const cahier = monde({ dejaInscrit: true });
    const r = await basculerVersSequence(sb, 'auto-4', ctx);

    expect(r.dejaInscrit).toBe(true);
    expect(r.refus).toBeNull();
    expect(cahier['sequence_enrollments'].inserts).toHaveLength(0);
    expect(cahier['sequence_enrollments'].updates.find((u) => u.status === 'exited')).toBeTruthy();
  });

  /** « De n'importe quelle fiche » : un appel à froid n'a aucune inscription. */
  it('entre dans la cible sans rien quitter quand il n’y a pas d’inscription', async () => {
    const cahier = monde({ avecAncienne: false });
    const r = await basculerVersSequence(sb, 'auto-4', { ...ctx, enrollmentId: null });

    expect(r.sortieDe).toBeNull();
    expect(r.refus).toBeNull();
    expect(cahier['sequence_enrollments'].inserts).toHaveLength(1);
    // Aucune chaîne à emporter : il ne vient de nulle part.
    expect(cahier['sequence_enrollments'].inserts[0].vars).toMatchObject({});
  });
});

describe('la trace des pièces envoyées à la main', () => {
  it('écrit le lien DANS le corps, pas seulement dans un champ', () => {
    // Le fil se relit comme une conversation : « plaquette envoyée » sans le
    // lien oblige à aller chercher ailleurs de quelle version on parlait.
    expect(ligneDePiece('plaquette', 'https://x.fr/p/abc')).toContain('https://x.fr/p/abc');
    expect(ligneDePiece('demo', 'https://demo.fr')).toMatch(/^Site démo/);
  });

  it('ne connaît que les pièces dont le CRM sait mesurer l’ouverture', () => {
    // Trois liens à jeton, et rien d'autre : journaliser un envoi qu'on ne
    // saura jamais relier à une ouverture remplirait le fil sans rien apprendre.
    expect([...PIECES]).toEqual(['demo', 'plaquette', 'audit']);
  });
});
