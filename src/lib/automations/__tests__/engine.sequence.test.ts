/**
 * @jest-environment node
 */

const mockSend = jest.fn();
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: (...args: unknown[]) => mockSend(...args) } })),
}));

const mockFrom = jest.fn();
jest.mock('@/app/api/_lib/service-client', () => ({
  getServiceClient: () => ({ from: (...args: unknown[]) => mockFrom(...args) }),
}));

import { advanceEnrollmentAfterTask, enrollInSequence, processSequenceEnrollment } from '../engine';
import { resetTestGuardCache } from '@/lib/email/test-guard';
import type { SequenceEnrollment } from '@/components/automations/types';

type ChainResult = { data: unknown; error?: unknown };

/** Chaîne Supabase générique : les lectures se terminent sur maybeSingle / limit / in. */
const tableChain = (result: ChainResult = { data: null, error: null }) => {
  const captured: { updates: unknown[]; inserts: unknown[] } = { updates: [], inserts: [] };
  const c: any = { captured };
  // `in` est un FILTRE, pas un terminateur : comme dans PostgrestFilterBuilder,
  // il rend la chaîne pour qu'on puisse enchaîner `.eq(…).maybeSingle()`
  // derrière. Le faire résoudre directement cassait tout appel qui filtre sur
  // un statut avant de conclure.
  for (const m of ['select', 'eq', 'neq', 'in', 'not', 'lte', 'gte', 'order']) {
    c[m] = jest.fn(() => c);
  }
  c.limit = jest.fn(() => Promise.resolve(result));
  // Comme PostgrestBuilder, la chaîne est « thenable » : un `await` sans
  // terminateur explicite (`.select('email')` seul) doit rendre le résultat.
  c.then = (resolve: (v: ChainResult) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  c.maybeSingle = jest.fn().mockResolvedValue(result);
  c.single = jest.fn().mockResolvedValue(result);
  c.update = jest.fn((u: unknown) => {
    captured.updates.push(u);
    return c;
  });
  c.insert = jest.fn((i: unknown) => {
    captured.inserts.push(i);
    // Comme le vrai client : un insert rend une chaîne, pour que
    // `.select('id').single()` puisse récupérer la ligne créée. Résoudre tout
    // de suite empêchait de tester une inscription.
    return c;
  });
  return c;
};

const sequenceWith = (kind: string, extra: Record<string, unknown> = {}) => ({
  id: 'auto-1',
  name: 'Artisans',
  kind: 'sequence',
  status: 'on',
  definition: { steps: [{ id: 's1', kind, day: 0, template: 'tpl-1', ...extra }] },
  settings: {},
});

const enrollment: SequenceEnrollment = {
  id: 'enr-1',
  automation_id: 'auto-1',
  contact_id: 'c-1',
  opportunite_id: null,
  entreprise_id: 42,
  current_step: 0,
  status: 'active',
  next_run_at: new Date().toISOString(),
  vars: {},
  created_by: null,
  entered_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  finished_at: null,
};

const ORIGINAL_ENV = { ...process.env };

describe('processSequenceEnrollment', () => {
  let tables: Record<string, any>;

  const wire = (automationRow: Record<string, unknown>, over: Record<string, any> = {}) => {
    tables = {
      automations: tableChain({ data: automationRow, error: null }),
      contacts: tableChain({
        data: {
          first_name: 'Jean',
          last_name: 'Test',
          email: 'jean@test.fr',
          tel: '0600',
          role_title: null,
          linkedin_url: null,
        },
        error: null,
      }),
      entreprises: tableChain({
        data: { name: 'Clim Ouest', ville: 'Angers', site_web_canonique: null, owner_id: 'agent-1' },
        error: null,
      }),
      opportunites: tableChain({ data: [], error: null }),
      audits: tableChain({ data: [], error: null }),
      sites: tableChain({ data: [], error: null }),
      email_templates: tableChain({ data: { subject: 'Objet', body: 'Bonjour' }, error: null }),
      whatsapp_templates: tableChain({ data: { body: 'Coucou {{contact.first_name}}' }, error: null }),
      call_scripts: tableChain({ data: null, error: null }),
      automation_connections: tableChain({ data: null, error: null }),
      email_signature_settings: tableChain({ data: null, error: null }),
      email_logs: tableChain(),
      sequence_enrollments: tableChain(),
      prospection_tasks: tableChain({ data: [], error: null }),
      regulator_settings: tableChain({
        data: { id: 'global', task_routing_mode: 'pref', task_max_per_agent: 8 },
        error: null,
      }),
      user_profiles: tableChain({ data: [{ id: 'admin-1' }], error: null }),
      agent_settings: tableChain({ data: [], error: null }),
      ...over,
    };
    mockFrom.mockImplementation((table: string) => {
      if (!tables[table]) throw new Error(`unexpected table: ${table}`);
      return tables[table];
    });
  };

  beforeEach(() => {
    mockFrom.mockReset();
    mockSend.mockReset();
    // Le garde-fou met les réglages en cache : sans reset, un test hériterait
    // de la phase de test du précédent.
    resetTestGuardCache();
    process.env = { ...ORIGINAL_ENV, RESEND_API_KEY: 'test-key' };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('envoie l’email et avance l’étape — l’heure a déjà été décidée par le régulateur', async () => {
    wire(sequenceWith('email'));
    mockSend.mockResolvedValue({ data: { id: 're-1' }, error: null });

    await processSequenceEnrollment(enrollment);

    expect(mockSend).toHaveBeenCalledTimes(1);
    const updates = tables.sequence_enrollments.captured.updates as Record<string, unknown>[];
    // 1) on efface la réservation du régulateur et on note la date d'envoi
    expect(updates[0]).toEqual(
      expect.objectContaining({ send_at: null, hold_reason: null, last_email_at: expect.any(String) }),
    );
    // 2) séquence à une seule étape → terminée
    expect(updates[1]).toEqual(expect.objectContaining({ current_step: 1, status: 'finished' }));
  });

  it('journalise l’envoi avec sa séquence — sinon impossible de compter un plafond par séquence', async () => {
    wire(sequenceWith('email'));
    mockSend.mockResolvedValue({ data: { id: 're-1' }, error: null });

    await processSequenceEnrollment(enrollment);

    const logged = (tables.email_logs.captured.inserts as Record<string, unknown>[])[0];
    expect(logged).toEqual(
      expect.objectContaining({ automation_id: 'auto-1', enrollment_id: 'enr-1', type: 'sequence' }),
    );
  });

  it('n’enregistre pas de date d’envoi quand Resend échoue', async () => {
    wire(sequenceWith('email'));
    mockSend.mockResolvedValue({ data: null, error: { message: 'rejected' } });

    await processSequenceEnrollment(enrollment);

    const updates = tables.sequence_enrollments.captured.updates as Record<string, unknown>[];
    expect(updates[0]).toEqual({ send_at: null, hold_reason: null });
  });

  describe('phase de test', () => {
    const inTestPhase = (allowed: string[]) => ({
      regulator_settings: tableChain({
        data: { id: 'global', task_routing_mode: 'pref', task_max_per_agent: 8, test_mode: true },
        error: null,
      }),
      test_email_addresses: tableChain({ data: allowed.map((email) => ({ email })), error: null }),
    });

    it('ne contacte jamais Resend pour un vrai prospect', async () => {
      wire(sequenceWith('email'), inTestPhase(['codingmos@gmail.com']));

      await processSequenceEnrollment(enrollment); // le contact est jean@test.fr

      expect(mockSend).not.toHaveBeenCalled();
    });

    it('journalise l’envoi retenu avec son motif', async () => {
      wire(sequenceWith('email'), inTestPhase(['codingmos@gmail.com']));

      await processSequenceEnrollment(enrollment);

      const logged = (tables.email_logs.captured.inserts as Record<string, unknown>[])[0];
      expect(logged).toEqual(
        expect.objectContaining({
          to_email: 'jean@test.fr',
          status: 'failed',
          blocked_reason: 'mode_test',
        }),
      );
    });

    it('gèle l’inscription au lieu de la faire avancer', async () => {
      // Le point qui compte pour un vrai prospect : rien n'est parti, donc rien
      // ne doit être consommé. Avancer d'une étape lui ferait perdre un email
      // pour de bon, et sa carte changerait de colonne dans le pipeline
      // commercial sans qu'il se soit rien passé.
      wire(sequenceWith('email'), inTestPhase(['codingmos@gmail.com']));

      await processSequenceEnrollment(enrollment);

      const updates = tables.sequence_enrollments.captured.updates as Record<string, unknown>[];
      expect(updates).toEqual([{ send_at: null, hold_reason: 'test_hold' }]);
      expect(updates.some((u) => 'current_step' in u)).toBe(false);
    });

    it('ne re-journalise pas une inscription déjà gelée', async () => {
      // Le régulateur repasse toutes les minutes : sans ce garde, le journal se
      // remplirait d'une ligne par tick et par prospect.
      wire(sequenceWith('email'), inTestPhase(['codingmos@gmail.com']));

      await processSequenceEnrollment({ ...enrollment, hold_reason: 'test_hold' });

      expect(tables.email_logs.captured.inserts).toHaveLength(0);
      expect(tables.sequence_enrollments.captured.updates).toHaveLength(0);
    });

    it('repart tout seul dès que l’adresse entre dans la liste de test', async () => {
      // Aucun réveil manuel : `next_run_at` n'a jamais été repoussé, donc le
      // tick suivant envoie normalement.
      wire(sequenceWith('email'), inTestPhase(['jean@test.fr']));
      mockSend.mockResolvedValue({ data: { id: 're-ok' }, error: null });

      await processSequenceEnrollment({ ...enrollment, hold_reason: 'test_hold' });

      expect(mockSend).toHaveBeenCalledTimes(1);
      const updates = tables.sequence_enrollments.captured.updates as Record<string, unknown>[];
      expect(updates.some((u) => u.current_step === 1)).toBe(true);
    });

    it('laisse partir un email vers une adresse de test', async () => {
      wire(sequenceWith('email'), inTestPhase(['jean@test.fr']));
      mockSend.mockResolvedValue({ data: { id: 're-ok' }, error: null });

      await processSequenceEnrollment(enrollment);

      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('sans adresse', () => {
    const noContactEmail = {
      contacts: tableChain({
        data: { first_name: 'Jean', last_name: 'Test', email: null, tel: '0600', role_title: null, linkedin_url: null },
        error: null,
      }),
    };

    it('gèle l’étape email au lieu de la franchir en silence', async () => {
      wire(sequenceWith('email'), {
        ...noContactEmail,
        entreprises: tableChain({
          data: { name: 'Clim Ouest', ville: 'Angers', site_web_canonique: null, email: null, owner_id: 'agent-1' },
          error: null,
        }),
      });

      await processSequenceEnrollment(enrollment);

      expect(mockSend).not.toHaveBeenCalled();
      const updates = tables.sequence_enrollments.captured.updates as Record<string, unknown>[];
      // Un seul update : le gel. L'étape n'avance PAS — avant, la séquence
      // franchissait l'email sans que rien ne parte.
      expect(updates).toHaveLength(1);
      expect(updates[0]).toEqual(
        expect.objectContaining({ send_at: null, hold_reason: 'no_email', next_run_at: expect.any(String) }),
      );
    });

    it('utilise l’adresse de la fiche entreprise comme destinataire de repli', async () => {
      wire(sequenceWith('email'), {
        ...noContactEmail,
        entreprises: tableChain({
          data: {
            name: 'Clim Ouest',
            ville: 'Angers',
            site_web_canonique: null,
            email: 'contact@clim-ouest.fr',
            owner_id: 'agent-1',
          },
          error: null,
        }),
      });
      mockSend.mockResolvedValue({ data: { id: 're-1' }, error: null });

      await processSequenceEnrollment(enrollment);

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend.mock.calls[0][0]).toEqual(
        expect.objectContaining({ to: 'Jean Test <contact@clim-ouest.fr>' }),
      );
    });
  });

  it('gèle l’inscription et dit pourquoi quand la séquence est en pause', async () => {
    wire({ ...sequenceWith('email'), status: 'paused' });

    await processSequenceEnrollment(enrollment);

    expect(mockSend).not.toHaveBeenCalled();
    expect(tables.sequence_enrollments.captured.updates).toEqual([
      { send_at: null, hold_reason: 'sequence_paused' },
    ]);
  });

  it('crée une tâche WhatsApp attribuée au propriétaire du contact, jamais un envoi', async () => {
    wire(sequenceWith('whatsapp'));

    await processSequenceEnrollment(enrollment);

    expect(mockSend).not.toHaveBeenCalled();
    const task = (tables.prospection_tasks.captured.inserts as Record<string, unknown>[])[0];
    expect(task).toEqual(
      expect.objectContaining({
        kind: 'whatsapp',
        assignee_id: 'agent-1',
        routing_reason: 'propriétaire du contact',
        enrollment_id: 'enr-1',
      }),
    );
    // La séquence attend le geste humain.
    expect(tables.sequence_enrollments.captured.updates).toEqual([
      { next_run_at: null, send_at: null, hold_reason: null },
    ]);
  });

  it('gèle l’étape sans modèle ni texte plutôt que de poser une tâche muette', async () => {
    // LE CAS DE PRODUCTION. « WhatsApp seul — site direct » a été réécrite dans
    // le builder : sa branche « sans réponse » — celle qu'empruntent les
    // silencieux, donc la majorité — porte une étape WhatsApp sans modèle et
    // sans message. `renderStepMessage` retombe alors sur `interpolate(undefined)`
    // qui vaut la chaîne vide, et la tâche partait quand même : l'agent ouvrait
    // WhatsApp devant un écran blanc.
    wire(sequenceWith('whatsapp', { template: null }));

    await processSequenceEnrollment(enrollment);

    expect(tables.prospection_tasks.captured.inserts).toEqual([]);
    const updates = tables.sequence_enrollments.captured.updates as Record<string, unknown>[];
    expect(updates[0]).toEqual(
      expect.objectContaining({ hold_reason: 'message_vide', send_at: null }),
    );
  });

  it('gèle aussi le message qui n’a que des blancs', async () => {
    // Un modèle vidé de son texte laisse des retours à la ligne : ce n'est pas
    // « vide » au sens strict, et c'est tout aussi muet à l'écran.
    wire(sequenceWith('whatsapp', { template: null, message: '  \n  ' }));

    await processSequenceEnrollment(enrollment);

    expect(tables.prospection_tasks.captured.inserts).toEqual([]);
    const updates = tables.sequence_enrollments.captured.updates as Record<string, unknown>[];
    expect(updates[0]).toEqual(expect.objectContaining({ hold_reason: 'message_vide' }));
  });

  it('pose bien la tâche quand l’étape porte un texte sans modèle', async () => {
    // Le garde ne doit pas manger le cas normal : un message écrit à la main,
    // sans modèle, est parfaitement légitime.
    wire(sequenceWith('whatsapp', { template: null, message: 'Bonjour, un mot rapide.' }));

    await processSequenceEnrollment(enrollment);

    const task = (tables.prospection_tasks.captured.inserts as Record<string, unknown>[])[0];
    expect((task.payload as { message: string }).message).toBe('Bonjour, un mot rapide.');
  });

  it('ne repose pas la tâche quand l’étape en a déjà une — le ticker et le geste de l’agent se croisent', async () => {
    // La fenêtre réelle : « il a répondu » avance l'inscription, pose
    // `next_run_at = maintenant`, puis met deux à quatre secondes à créer la
    // tâche. Le ticker passe pendant ce temps et retraite la même étape.
    wire(sequenceWith('whatsapp'), {
      prospection_tasks: tableChain({ data: [{ id: 'task-deja-la' }], error: null }),
    });

    await processSequenceEnrollment(enrollment);

    expect(tables.prospection_tasks.captured.inserts).toEqual([]);
    // L'inscription attend quand même le geste humain : la tâche existe, elle
    // est simplement l'œuvre de l'autre chemin.
    expect(tables.sequence_enrollments.captured.updates).toEqual([
      { next_run_at: null, send_at: null, hold_reason: null },
    ]);
  });

  it('laisse passer le doublon refusé par la base sans casser l’avancement', async () => {
    // Les deux chemins ont lu avant que l'un ait écrit : c'est l'index unique
    // qui tranche. Le perdant n'a rien à signaler — une seule tâche existe,
    // c'est le résultat recherché.
    const dejaPris = tableChain({ data: [], error: null });
    dejaPris.insert = jest.fn(() => Promise.resolve({ data: null, error: { code: '23505' } }));
    wire(sequenceWith('whatsapp'), { prospection_tasks: dejaPris });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(processSequenceEnrollment(enrollment)).resolves.toBeUndefined();

    expect(warn).not.toHaveBeenCalled();
    expect(tables.sequence_enrollments.captured.updates).toEqual([
      { next_run_at: null, send_at: null, hold_reason: null },
    ]);
    warn.mockRestore();
  });

  it('bascule la tâche chez l’admin quand personne ne suit l’entreprise', async () => {
    wire(sequenceWith('whatsapp'), {
      entreprises: tableChain({
        data: { name: 'Clim Ouest', ville: 'Angers', site_web_canonique: null, owner_id: null },
        error: null,
      }),
    });

    await processSequenceEnrollment(enrollment);

    const task = (tables.prospection_tasks.captured.inserts as Record<string, unknown>[])[0];
    expect(task).toEqual(
      expect.objectContaining({
        assignee_id: 'admin-1',
        routing_reason: expect.stringContaining('aucun propriétaire'),
      }),
    );
  });

  it('en mode « tout à l’admin », même un contact suivi part chez l’admin', async () => {
    wire(sequenceWith('whatsapp'), {
      regulator_settings: tableChain({
        data: { id: 'global', task_routing_mode: 'admin', task_max_per_agent: 8 },
        error: null,
      }),
    });

    await processSequenceEnrollment(enrollment);

    const task = (tables.prospection_tasks.captured.inserts as Record<string, unknown>[])[0];
    expect(task).toEqual(expect.objectContaining({ assignee_id: 'admin-1' }));
  });
});

/* ── Les deux versions d'un modèle ───────────────────────────────────────── */
//
// Un modèle porte un texte pour l'entreprise et un pour le contact nommé. Le
// choix se fait à l'envoi, prospect par prospect : c'est le seul endroit où on
// sait si la fiche a un prénom. Ces tests tiennent la règle de bout en bout,
// depuis la ligne de base jusqu'au message posé dans la file de l'agent.

describe('processSequenceEnrollment — variations du modèle', () => {
  let tables: Record<string, any>;

  const MODELE = {
    name: 'Accroche',
    body: 'Bonjour, je suis bien avec {{company.name}} ?',
    body_contact: 'Bonjour, je suis bien avec {{contact.first_name}} de {{company.name}} ?',
  };

  const wireWhatsapp = (contactRow: unknown) => {
    tables = {
      automations: tableChain({ data: sequenceWith('whatsapp'), error: null }),
      contacts: tableChain({ data: contactRow, error: null }),
      entreprises: tableChain({
        data: { name: 'Clim Ouest', ville: 'Angers', site_web_canonique: null, owner_id: 'agent-1' },
        error: null,
      }),
      opportunites: tableChain({ data: [], error: null }),
      audits: tableChain({ data: [], error: null }),
      sites: tableChain({ data: [], error: null }),
      email_templates: tableChain({ data: null, error: null }),
      whatsapp_templates: tableChain({ data: MODELE, error: null }),
      call_scripts: tableChain({ data: null, error: null }),
      automation_connections: tableChain({ data: null, error: null }),
      email_signature_settings: tableChain({ data: null, error: null }),
      email_logs: tableChain(),
      sequence_enrollments: tableChain(),
      prospection_tasks: tableChain({ data: [], error: null }),
      regulator_settings: tableChain({
        data: { id: 'global', task_routing_mode: 'pref', task_max_per_agent: 8 },
        error: null,
      }),
      user_profiles: tableChain({ data: [{ id: 'admin-1' }], error: null }),
      agent_settings: tableChain({ data: [], error: null }),
    };
    mockFrom.mockImplementation((table: string) => {
      if (!tables[table]) throw new Error(`unexpected table: ${table}`);
      return tables[table];
    });
  };

  const messagePose = () =>
    ((tables.prospection_tasks.captured.inserts as Record<string, any>[])[0].payload as { message: string }).message;

  beforeEach(() => {
    mockFrom.mockReset();
    mockSend.mockReset();
    resetTestGuardCache();
    process.env = { ...ORIGINAL_ENV, RESEND_API_KEY: 'test-key' };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('nomme la personne quand la fiche porte un prénom', async () => {
    wireWhatsapp({
      first_name: 'Jean',
      last_name: 'Test',
      email: 'jean@test.fr',
      tel: '0600',
      role_title: null,
      linkedin_url: null,
    });

    await processSequenceEnrollment(enrollment);

    expect(messagePose()).toBe('Bonjour, je suis bien avec Jean de Clim Ouest ?');
  });

  // Le défaut corrigé : 67 des 294 entreprises qualifiées n'ont aucun contact
  // avec un prénom. Un texte unique citant le prénom leur partait amputé — « je
  // suis bien avec  de Clim Ouest ? » —, `interpolate` vidant toute clé sans
  // valeur. On envoie désormais la version qui n'a personne à nommer.
  it('retombe sur la version entreprise quand la fiche n’a pas de contact', async () => {
    wireWhatsapp(null);

    await processSequenceEnrollment(enrollment);

    expect(messagePose()).toBe('Bonjour, je suis bien avec Clim Ouest ?');
    expect(messagePose()).not.toContain('  de');
  });

  it('retombe aussi quand le contact existe mais n’a pas de prénom', async () => {
    // Une fiche à moitié remplie est plus courante qu'une fiche absente, et
    // elle produisait exactement le même trou.
    wireWhatsapp({ first_name: '', last_name: 'Test', email: null, tel: '0600', role_title: null, linkedin_url: null });

    await processSequenceEnrollment(enrollment);

    expect(messagePose()).toBe('Bonjour, je suis bien avec Clim Ouest ?');
  });

  // L'épingle posée sur la ligne du pipeline commercial. C'est le SEUL moyen
  // qu'un e-mail la respecte : il part par le régulateur, sans personne devant
  // l'écran, donc le choix doit vivre sur l'inscription et pas sur la carte.
  it('respecte la version épinglée sur l’inscription', async () => {
    wireWhatsapp({
      first_name: 'Jean',
      last_name: 'Test',
      email: null,
      tel: '0600',
      role_title: null,
      linkedin_url: null,
    });

    await processSequenceEnrollment({ ...enrollment, vars: { variant: 'company' } });

    expect(messagePose()).toBe('Bonjour, je suis bien avec Clim Ouest ?');
  });

  it('transporte les DEUX versions dans la tâche, pour que la carte puisse basculer', async () => {
    wireWhatsapp({
      first_name: 'Jean',
      last_name: 'Test',
      email: null,
      tel: '0600',
      role_title: null,
      linkedin_url: null,
    });

    await processSequenceEnrollment(enrollment);

    const payload = (tables.prospection_tasks.captured.inserts as Record<string, any>[])[0].payload;
    expect(payload.variant).toBe('contact');
    // Recalculer l'autre version au clic voudrait dire relire modèle et
    // variables depuis le navigateur — donc risquer d'afficher autre chose que
    // ce que le moteur a réellement préparé.
    expect(payload.variantAlt).toEqual({
      variant: 'company',
      message: 'Bonjour, je suis bien avec Clim Ouest ?',
    });
  });

  it('ne propose pas de bascule quand le modèle n’a qu’une version', async () => {
    wireWhatsapp({
      first_name: 'Jean',
      last_name: 'Test',
      email: null,
      tel: '0600',
      role_title: null,
      linkedin_url: null,
    });
    tables.whatsapp_templates = tableChain({ data: { name: 'Accroche', body: MODELE.body }, error: null });

    await processSequenceEnrollment(enrollment);

    // Une bascule qui ne changerait pas un mot ferait douter de tout l'écran.
    const payload = (tables.prospection_tasks.captured.inserts as Record<string, any>[])[0].payload;
    expect(payload.variantAlt).toBeNull();
  });

  it('laisse les modèles d’avant la migration se comporter à l’identique', async () => {
    // Sans colonne `body_contact` en base — cas d'un déploiement qui précède la
    // migration —, il ne reste qu'un texte, et c'est lui qui part.
    wireWhatsapp({
      first_name: 'Jean',
      last_name: 'Test',
      email: null,
      tel: '0600',
      role_title: null,
      linkedin_url: null,
    });
    tables.whatsapp_templates = tableChain({ data: { name: 'Accroche', body: MODELE.body }, error: null });

    await processSequenceEnrollment(enrollment);

    expect(messagePose()).toBe('Bonjour, je suis bien avec Clim Ouest ?');
  });
});

/* ── Inscription : un canal suffit, une fiche contact n'est pas requise ──── */

describe('enrollInSequence', () => {
  let tables: Record<string, any>;

  /** Le socle commun ; `over` ne change que ce que le cas teste. */
  const wireEnroll = (over: Record<string, any> = {}) => {
    tables = {
      contacts: tableChain({ data: null, error: null }),
      entreprises: tableChain({ data: { name: 'Clim Ouest' }, error: null }),
      opportunites: tableChain({ data: [], error: null }),
      audits: tableChain({ data: [], error: null }),
      sites: tableChain({ data: [], error: null }),
      entreprises_rapport_public: tableChain({ data: null, error: null }),
      user_profiles: tableChain({ data: null, error: null }),
      scheduling_pages: tableChain({ data: null, error: null }),
      sequence_enrollments: tableChain({ data: null, error: null }),
      ...over,
    };
    mockFrom.mockImplementation((table: string) => {
      if (!tables[table]) throw new Error(`unexpected table: ${table}`);
      return tables[table];
    });
  };

  const automation = { id: 'auto-1', name: 'WhatsApp seul' } as any;

  beforeEach(() => mockFrom.mockReset());

  // Le cas qui bloquait 70 des 275 entreprises qualifiées : aucune ligne
  // `contacts`, mais un mobile sur la fiche entreprise — soit exactement le
  // segment de la séquence WhatsApp.
  it('inscrit une entreprise sans fiche contact, sur son seul mobile', async () => {
    wireEnroll({
      entreprises: tableChain({
        data: { name: 'Clim Ouest', telephone: '06 46 04 28 76', email: null },
        error: null,
      }),
    });

    const result = await enrollInSequence(automation, { entreprise_id: 42 });

    expect(result.enrolled).toBe(true);
    const insert = (tables.sequence_enrollments.captured.inserts as Record<string, unknown>[])[0];
    expect(insert).toEqual(expect.objectContaining({ entreprise_id: 42, contact_id: null }));
  });

  it('refuse un prospect qu’on ne peut ni écrire ni appeler', async () => {
    wireEnroll({
      entreprises: tableChain({ data: { name: 'Clim Ouest', telephone: null, email: null }, error: null }),
    });

    const result = await enrollInSequence(automation, { entreprise_id: 42 });

    expect(result.enrolled).toBe(false);
    expect(tables.sequence_enrollments.captured.inserts).toHaveLength(0);
  });

  it('ne double pas l’inscription d’une entreprise sans contact', async () => {
    // Sans dédoublonnage sur l'entreprise, un second clic enverrait tout deux fois.
    wireEnroll({
      entreprises: tableChain({ data: { name: 'Clim Ouest', telephone: '0646042876' }, error: null }),
      sequence_enrollments: tableChain({ data: { id: 'deja-la' }, error: null }),
    });

    const result = await enrollInSequence(automation, { entreprise_id: 42 });

    expect(result).toEqual({ enrolled: false, enrollmentId: 'deja-la' });
  });
});

/* ── Attente d'une réponse ───────────────────────────────────────────────── */

describe('étape « attendre une réponse »', () => {
  const DAY = 86_400_000;
  let tables: Record<string, any>;

  /** Accroche WhatsApp, puis attente, puis démo. */
  const withWait = (waitStep: Record<string, unknown>) => ({
    id: 'auto-1',
    name: 'WhatsApp seul',
    kind: 'sequence',
    status: 'on',
    definition: {
      steps: [
        { id: 's1', kind: 'whatsapp', day: 0 },
        { id: 's2', kind: 'wait', day: 0, ...waitStep },
        { id: 's3', kind: 'whatsapp', day: 3 },
      ],
    },
    settings: {},
  });

  const wireWait = (automationRow: Record<string, unknown>) => {
    tables = {
      automations: tableChain({ data: automationRow, error: null }),
      sequence_enrollments: tableChain(),
    };
    mockFrom.mockImplementation((table: string) => {
      if (!tables[table]) throw new Error(`unexpected table: ${table}`);
      return tables[table];
    });
  };

  const updates = () => tables.sequence_enrollments.captured.updates as Record<string, unknown>[];
  const onWait = (over: Partial<SequenceEnrollment> = {}): SequenceEnrollment => ({
    ...enrollment,
    current_step: 1,
    ...over,
  });

  beforeEach(() => {
    mockFrom.mockReset();
  });

  it('gare l’inscription au lieu d’enchaîner tout seul', async () => {
    wireWait(withWait({ waitMode: 'reply' }));

    await processSequenceEnrollment(onWait());

    // Sans délai de relance, `next_run_at` est nul : l'inscription sort de la
    // file du ticker plutôt que d'y revenir chaque minute pour ne rien faire.
    expect(updates()[0]).toEqual(
      expect.objectContaining({ hold_reason: 'awaiting_reply', next_run_at: null }),
    );
    // Surtout : elle n'a PAS avancé.
    expect(updates()[0]).not.toHaveProperty('current_step');
  });

  it('programme la relance quand un délai est fixé', async () => {
    const now = Date.now();
    wireWait(withWait({ waitMode: 'reply', replyTimeoutDays: 3 }));

    await processSequenceEnrollment(onWait());

    const update = updates()[0];
    expect(update.hold_reason).toBe('awaiting_reply');
    const runAt = Date.parse(update.next_run_at as string);
    expect(runAt - now).toBeGreaterThan(2.9 * DAY);
    expect(runAt - now).toBeLessThan(3.1 * DAY);
  });

  it('relance quand même à l’échéance, personne n’ayant répondu', async () => {
    wireWait(withWait({ waitMode: 'reply', replyTimeoutDays: 3 }));

    // Le ticker nous réveille sur une inscription déjà garée.
    await processSequenceEnrollment(onWait({ hold_reason: 'awaiting_reply' }));

    expect(updates()[0]).toEqual(expect.objectContaining({ current_step: 2 }));
  });

  it('avance dès qu’une réponse a été déclarée', async () => {
    const now = Date.now();
    wireWait(withWait({ waitMode: 'reply' }));

    await processSequenceEnrollment(
      onWait({
        hold_reason: 'awaiting_reply',
        vars: { replies: { '1': new Date().toISOString() } },
        entered_at: new Date(now - 10 * DAY).toISOString(),
      }),
    );

    const update = updates()[0];
    expect(update.current_step).toBe(2);
    // Réancré : la démo part trois jours après la réponse, pas dans la seconde
    // — les J+n de l'inscription sont pourtant tous dans le passé.
    const runAt = Date.parse(update.next_run_at as string);
    expect(runAt - now).toBeGreaterThan(2.9 * DAY);
    expect(update.anchor_step).toBe(1);
  });

  it('laisse une attente en jours se comporter comme avant', async () => {
    wireWait(withWait({}));

    await processSequenceEnrollment(onWait());

    expect(updates()[0]).toEqual(expect.objectContaining({ current_step: 2 }));
    expect(updates()[0].hold_reason).toBeNull();
  });
});

/* ── Les deux suites d'une attente ───────────────────────────────────────── */

describe('branches d’une attente-réponse', () => {
  let tables: Record<string, any>;

  /**
   * La séquence WhatsApp branchée : après l'attente, deux suites qui ne disent
   * pas la même chose — on ne remercie pas un silence de sa réponse.
   */
  const BRANCHEE = {
    id: 'auto-1',
    name: 'WhatsApp seul',
    kind: 'sequence',
    status: 'on',
    definition: {
      steps: [
        { id: 's1', kind: 'whatsapp', day: 0 },
        { id: 's2', kind: 'wait', day: 0, waitMode: 'reply', replyTimeoutDays: 3 },
        { id: 's3', kind: 'whatsapp', day: 0, branch: { waitId: 's2', on: 'reply' } },
        { id: 's4', kind: 'whatsapp', day: 3, branch: { waitId: 's2', on: 'timeout' } },
        { id: 's5', kind: 'call', day: 5 },
      ],
    },
    settings: {},
  };

  const wire = () => {
    tables = {
      automations: tableChain({ data: BRANCHEE, error: null }),
      sequence_enrollments: tableChain(),
    };
    mockFrom.mockImplementation((table: string) => {
      if (!tables[table]) throw new Error(`unexpected table: ${table}`);
      return tables[table];
    });
  };
  const updates = () => tables.sequence_enrollments.captured.updates as Record<string, unknown>[];

  beforeEach(() => mockFrom.mockReset());

  it('part sur la branche « il a répondu » quand une réponse est déclarée', async () => {
    wire();

    await processSequenceEnrollment({
      ...enrollment,
      current_step: 1,
      hold_reason: 'awaiting_reply',
      vars: { replies: { '1': new Date().toISOString() } },
    });

    expect(updates()[0]).toEqual(expect.objectContaining({ current_step: 2 }));
  });

  it('part sur la branche « sans réponse » quand le délai s’écoule', async () => {
    wire();

    // Le ticker réveille une inscription garée : personne n'a répondu.
    await processSequenceEnrollment({ ...enrollment, current_step: 1, hold_reason: 'awaiting_reply' });

    expect(updates()[0]).toEqual(expect.objectContaining({ current_step: 3 }));
  });

  it('ne fait jamais traverser l’autre branche au passage', async () => {
    wire();

    // Fin de la branche réponse (s3) : la relance du silence (s4) ne doit pas
    // partir — ce serait relancer quelqu'un qui vient d'écrire.
    await processSequenceEnrollment({
      ...enrollment,
      current_step: 2,
      vars: { replies: { '1': new Date().toISOString() }, skippedSteps: [2] },
    });

    expect(updates()[0]).toEqual(expect.objectContaining({ current_step: 4 }));
  });
});

/* ── Ancrage des délais ──────────────────────────────────────────────────── */

describe('advanceEnrollmentAfterTask', () => {
  const DAY = 86_400_000;
  let enrollments: any;

  /**
   * Une séquence WhatsApp réaliste : accroche à J+1, démo trois jours après.
   * C'est l'écart J+4 − J+1 qui doit être respecté, pas le J+4 absolu.
   */
  const STEPS = [
    { id: 's1', kind: 'email', day: 0 },
    { id: 's2', kind: 'whatsapp', day: 1 },
    { id: 's3', kind: 'whatsapp', day: 4 },
  ];

  /**
   * Comme `tableChain`, mais qui RETIENT l'état entre deux lectures.
   *
   * `advanceEnrollmentAfterTask` positionne l'inscription PUIS relit tout de
   * suite (`traiterEtapeCourante`) pour traiter l'étape sur laquelle elle vient
   * d'atterrir — sans attendre le prochain tick. Un double statique aurait
   * renvoyé l'état d'AVANT l'écriture à cette seconde lecture, comme le ferait
   * un mock qui ignore ses propres `.update()`.
   */
  const statefulEnrollments = (initial: Record<string, unknown>) => {
    const record: Record<string, unknown> = { ...initial };
    const updates: Record<string, unknown>[] = [];
    const c: any = { captured: { updates, inserts: [] } };
    for (const m of ['select', 'eq', 'in', 'not', 'lte', 'gte', 'order']) c[m] = jest.fn(() => c);
    c.maybeSingle = jest.fn(() => Promise.resolve({ data: { ...record }, error: null }));
    c.single = c.maybeSingle;
    c.then = (resolve: (v: ChainResult) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve({ data: { ...record }, error: null }).then(resolve, reject);
    c.update = jest.fn((u: Record<string, unknown>) => {
      updates.push(u);
      Object.assign(record, u);
      return c;
    });
    return c;
  };

  const wireAdvance = (enr: Partial<SequenceEnrollment>) => {
    enrollments = statefulEnrollments({ ...enrollment, current_step: 1, ...enr });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'sequence_enrollments') return enrollments;
      if (table === 'automations') return tableChain({ data: { status: 'on', definition: { steps: STEPS } }, error: null });
      // Traiter tout de suite l'étape suivante (créer sa tâche WhatsApp) irait
      // consulter entreprises, contacts, modèles… hors du périmètre de ces
      // tests, qui vérifient l'ANCRAGE. L'appelant rattrape l'échec
      // (`.catch(() => {})`) sans laisser de trace dans les écritures vérifiées
      // ci-dessous — c'est exactement ce qui se passe en production quand le
      // traitement immédiat échoue : le prochain tick s'en charge.
      throw new Error(`unexpected table: ${table}`);
    });
  };

  const lastUpdate = () => {
    const updates = enrollments.captured.updates as Record<string, unknown>[];
    return updates[updates.length - 1];
  };

  beforeEach(() => {
    mockFrom.mockReset();
  });

  // La régression qui a motivé l'ancre : une accroche WhatsApp prévue à J+1 mais
  // faite au bout d'une semaine laissait J+4 dans le passé, donc la démo partait
  // dans la seconde — juste après l'accroche, ce qui grille le prospect.
  it('ne fait pas partir l’étape suivante immédiatement quand la tâche a traîné', async () => {
    const now = Date.now();
    wireAdvance({ entered_at: new Date(now - 8 * DAY).toISOString() });

    await advanceEnrollmentAfterTask('enr-1');

    const update = lastUpdate();
    const runAt = Date.parse(update.next_run_at as string);
    // Trois jours après le geste (J+4 − J+1), pas « maintenant ».
    expect(runAt - now).toBeGreaterThan(2.9 * DAY);
    expect(runAt - now).toBeLessThan(3.1 * DAY);
  });

  it('pose l’ancre sur l’étape qu’on vient de franchir', async () => {
    wireAdvance({ entered_at: new Date(Date.now() - 8 * DAY).toISOString() });

    await advanceEnrollmentAfterTask('enr-1');

    const update = lastUpdate();
    expect(update.anchor_step).toBe(1);
    expect(Date.parse(update.anchor_at as string)).toBeCloseTo(Date.now(), -4);
    expect(update.current_step).toBe(2);
  });

  it('respecte l’écart même sur une inscription toute fraîche', async () => {
    const now = Date.now();
    wireAdvance({ entered_at: new Date(now).toISOString() });

    await advanceEnrollmentAfterTask('enr-1');

    const runAt = Date.parse(lastUpdate().next_run_at as string);
    expect(runAt - now).toBeGreaterThan(2.9 * DAY);
  });

  it('termine la séquence quand l’étape franchie était la dernière', async () => {
    enrollments = statefulEnrollments({ ...enrollment, current_step: 2 });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'sequence_enrollments') return enrollments;
      if (table === 'automations') return tableChain({ data: { status: 'on', definition: { steps: STEPS } }, error: null });
      throw new Error(`unexpected table: ${table}`);
    });

    await advanceEnrollmentAfterTask('enr-1');

    // Une inscription terminée n'est plus 'active' : la relecture immédiate
    // (`traiterEtapeCourante`) le voit — grâce au mock désormais à jour — et
    // s'arrête là. Une seule écriture, pas de traitement fantôme sur l'étape
    // qu'il n'y a plus.
    expect(enrollments.captured.updates).toEqual([
      expect.objectContaining({ status: 'finished', next_run_at: null }),
    ]);
  });

  it('ne touche pas à une inscription qui n’est plus active', async () => {
    wireAdvance({ status: 'exited' });

    await advanceEnrollmentAfterTask('enr-1');

    expect(enrollments.captured.updates).toHaveLength(0);
  });

  /**
   * LA RÉGRESSION SIGNALÉE : cliquer « il a répondu » dans la seconde qui suit
   * un « Fait » retombait sur « on n'attendait rien à cette étape ».
   *
   * `avancerApres` positionnait bien l'inscription sur l'attente-réponse
   * suivante, mais son `hold_reason` restait NUL jusqu'au prochain tick cron —
   * le seul endroit qui l'écrivait (`processWaitStep`). Entre les deux,
   * `declarerReponse` voyait une inscription qui n'a l'air d'attendre rien.
   *
   * `traiterEtapeCourante` comble cet écart : elle traite l'étape sur laquelle
   * on vient d'atterrir DANS LE MÊME APPEL, pas au prochain passage.
   */
  it('pose déjà hold_reason=awaiting_reply en atterrissant sur une attente-réponse — sans attendre le prochain tick', async () => {
    const WAIT_STEPS = [
      { id: 's1', kind: 'whatsapp', day: 0 },
      { id: 's2', kind: 'wait', day: 0, waitMode: 'reply', replyTimeoutDays: 0 },
    ];
    enrollments = statefulEnrollments({ ...enrollment, current_step: 0 });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'sequence_enrollments') return enrollments;
      if (table === 'automations') return tableChain({ data: { status: 'on', definition: { steps: WAIT_STEPS } }, error: null });
      throw new Error(`unexpected table: ${table}`);
    });

    await advanceEnrollmentAfterTask('enr-1');

    expect(enrollments.captured.updates).toEqual([
      // 1. avancerApres/scheduleStep positionne l'inscription sur s2.
      expect.objectContaining({ current_step: 1 }),
      // 2. traiterEtapeCourante traite s2 dans la foulée : hold_reason posé
      //    tout de suite, sans qu'un tick n'ait eu besoin de passer.
      expect.objectContaining({ hold_reason: 'awaiting_reply' }),
    ]);
  });
});

/**
 * Le lien d'audit — le trou le plus coûteux de la mécanique.
 *
 * `{{company.audit_url}}` s'interpolait en vide pour TOUTES les entreprises :
 * le jeton de partage n'était créé que par le dialogue « Partager le rapport »,
 * qu'un envoi automatique ne traverse jamais. Aucun jeton n'existait en base.
 * Le message « c'est ici, rien à télécharger : » partait donc suivi de rien.
 */
describe('le lien du rapport d’audit', () => {
  let tables: Record<string, any>;

  const wireAudit = (over: Record<string, any> = {}) => {
    tables = {
      automations: tableChain({
        data: {
          id: 'auto-1',
          name: 'Artisans',
          kind: 'sequence',
          status: 'on',
          definition: { steps: [{ id: 's1', kind: 'email', day: 0, template: 'tpl-1' }] },
          settings: {},
        },
        error: null,
      }),
      contacts: tableChain({
        data: { first_name: 'Jean', last_name: 'Test', email: 'jean@test.fr', tel: '0600', role_title: null, linkedin_url: null },
        error: null,
      }),
      entreprises: tableChain({
        data: { name: 'Clim Ouest', ville: 'Angers', site_web_canonique: null, owner_id: 'agent-1' },
        error: null,
      }),
      opportunites: tableChain({ data: [], error: null }),
      audits: tableChain({ data: [], error: null }),
      sites: tableChain({ data: [], error: null }),
      // Le modèle CITE le rapport : c'est ce qui arme le garde-fou.
      email_templates: tableChain({
        data: { subject: 'Votre site', body: 'Le rapport est ici : {{company.audit_url}}' },
        error: null,
      }),
      whatsapp_templates: tableChain({ data: null, error: null }),
      call_scripts: tableChain({ data: null, error: null }),
      automation_connections: tableChain({ data: null, error: null }),
      email_signature_settings: tableChain({ data: null, error: null }),
      email_logs: tableChain(),
      sequence_enrollments: tableChain(),
      prospection_tasks: tableChain({ data: [], error: null }),
      regulator_settings: tableChain({ data: { id: 'global' }, error: null }),
      user_profiles: tableChain({ data: [{ id: 'admin-1' }], error: null }),
      agent_settings: tableChain({ data: [], error: null }),
      entreprises_audit_site: tableChain({ data: null, error: null, count: 0 } as any),
      entreprises_rapport_public: tableChain({ data: null, error: null }),
      ...over,
    };
    mockFrom.mockImplementation((table: string) => {
      if (!tables[table]) throw new Error(`unexpected table: ${table}`);
      return tables[table];
    });
  };

  beforeEach(() => {
    mockFrom.mockReset();
    mockSend.mockReset();
    resetTestGuardCache();
    process.env = { ...ORIGINAL_ENV, RESEND_API_KEY: 'test-key' };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('gèle l’étape quand le message promet un audit que l’entreprise n’a pas', async () => {
    // 192 des 295 entreprises qualifiées n'ont aucune mesure : le rapport
    // n'afficherait que la trame par défaut à leur nom.
    wireAudit();

    await processSequenceEnrollment(enrollment);

    expect(mockSend).not.toHaveBeenCalled();
    const updates = tables.sequence_enrollments.captured.updates as Record<string, unknown>[];
    expect(updates[0]).toEqual(
      expect.objectContaining({ hold_reason: 'lien_manquant', send_at: null, next_run_at: expect.any(String) }),
    );
  });

  it('laisse partir le message quand l’entreprise a des mesures', async () => {
    wireAudit({
      entreprises_audit_site: tableChain({ data: null, error: null, count: 3 } as any),
      entreprises_rapport_public: tableChain({
        data: { entreprise_id: 42, token: 'a1b2c3d4e5f6a7b8', actif: true, vues: 0, vu_le: null },
        error: null,
      }),
    });
    mockSend.mockResolvedValue({ data: { id: 're-1' }, error: null });

    await processSequenceEnrollment(enrollment);

    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('crée le jeton à l’envoi quand l’entreprise n’en a pas encore', async () => {
    // Le cœur du correctif : sans cet insert, le lien restait vide pour tout le
    // parc — aucun jeton n'existait en base.
    const rapport = tableChain({ data: null, error: null });
    // Première lecture vide, puis l'insert rend la ligne créée.
    rapport.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
    rapport.single = jest
      .fn()
      .mockResolvedValue({ data: { entreprise_id: 42, token: 'ff00ff00ff00ff00', actif: true, vues: 0, vu_le: null }, error: null });

    wireAudit({
      entreprises_audit_site: tableChain({ data: null, error: null, count: 1 } as any),
      entreprises_rapport_public: rapport,
    });
    mockSend.mockResolvedValue({ data: { id: 're-1' }, error: null });

    await processSequenceEnrollment(enrollment);

    expect(rapport.captured.inserts).toHaveLength(1);
    expect(rapport.captured.inserts[0]).toEqual(expect.objectContaining({ entreprise_id: 42 }));
    // Et le lien créé arrive bien dans le corps envoyé au prospect.
    const envoi = mockSend.mock.calls[0][0] as { text?: string; html?: string };
    expect(`${envoi.text ?? ''}${envoi.html ?? ''}`).toContain('ff00ff00ff00ff00');
  });

  it('ne gèle pas une étape dont le message ne parle pas d’audit', async () => {
    wireAudit({
      email_templates: tableChain({ data: { subject: 'Bonjour', body: 'Un mot rapide.' }, error: null }),
    });
    mockSend.mockResolvedValue({ data: { id: 're-1' }, error: null });

    await processSequenceEnrollment(enrollment);

    expect(mockSend).toHaveBeenCalledTimes(1);
  });
});

/**
 * Le lien de la démo — le même trou que l'audit, trois lignes plus bas.
 *
 * `resolveEntities` n'acceptait que `published_domain` / `published_subdomain`.
 * Or aucun site du parc n'est publié : sur 114 entreprises qualifiées qui en
 * ont un, zéro a de sous-domaine. `company.demo_url` s'interpolait donc en vide
 * pour les 295 — alors qu'un site non publié a une URL d'aperçu qui marche, et
 * que le rapport public l'envoie déjà.
 */
describe('le lien du site démo', () => {
  let tables: Record<string, any>;

  const wireDemo = (siteRows: unknown[], body = 'Votre démo : {{company.demo_url}}') => {
    tables = {
      automations: tableChain({
        data: {
          id: 'auto-1',
          name: 'Artisans',
          kind: 'sequence',
          status: 'on',
          definition: { steps: [{ id: 's1', kind: 'email', day: 0, template: 'tpl-1' }] },
          settings: {},
        },
        error: null,
      }),
      contacts: tableChain({
        data: { first_name: 'Jean', last_name: 'Test', email: 'jean@test.fr', tel: '0600', role_title: null, linkedin_url: null },
        error: null,
      }),
      entreprises: tableChain({
        data: { name: 'Clim Ouest', ville: 'Angers', site_web_canonique: null, owner_id: 'agent-1' },
        error: null,
      }),
      opportunites: tableChain({ data: [], error: null }),
      audits: tableChain({ data: [], error: null }),
      sites: tableChain({ data: siteRows, error: null }),
      email_templates: tableChain({ data: { subject: 'Objet', body }, error: null }),
      whatsapp_templates: tableChain({ data: null, error: null }),
      call_scripts: tableChain({ data: null, error: null }),
      automation_connections: tableChain({ data: null, error: null }),
      email_signature_settings: tableChain({ data: null, error: null }),
      email_logs: tableChain(),
      sequence_enrollments: tableChain(),
      prospection_tasks: tableChain({ data: [], error: null }),
      regulator_settings: tableChain({ data: { id: 'global' }, error: null }),
      user_profiles: tableChain({ data: [{ id: 'admin-1' }], error: null }),
      agent_settings: tableChain({ data: [], error: null }),
      entreprises_audit_site: tableChain({ data: null, error: null, count: 5 } as any),
      entreprises_rapport_public: tableChain({
        data: { entreprise_id: 42, token: 'a1b2c3d4e5f6a7b8', actif: true, vues: 0, vu_le: null },
        error: null,
      }),
    };
    mockFrom.mockImplementation((table: string) => {
      if (!tables[table]) throw new Error(`unexpected table: ${table}`);
      return tables[table];
    });
  };

  beforeEach(() => {
    mockFrom.mockReset();
    mockSend.mockReset();
    resetTestGuardCache();
    process.env = { ...ORIGINAL_ENV, RESEND_API_KEY: 'test-key' };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('envoie l’aperçu d’un site « Prêt » même s’il n’est pas publié', async () => {
    // Le cas de tout le parc : 0 site publié, mais l'aperçu `{id}.{domaine}`
    // est routé par le middleware et marche.
    wireDemo([
      { id: 'site-uuid-1', is_published: false, published_subdomain: null, published_domain: null, build_stage: 'pret', is_template: false },
    ]);
    mockSend.mockResolvedValue({ data: { id: 're-1' }, error: null });

    await processSequenceEnrollment(enrollment);

    expect(mockSend).toHaveBeenCalledTimes(1);
    const envoi = mockSend.mock.calls[0][0] as { text?: string; html?: string };
    expect(`${envoi.text ?? ''}${envoi.html ?? ''}`).toContain('site-uuid-1.');
  });

  it('préfère le sous-domaine publié quand il existe', async () => {
    wireDemo([
      { id: 'site-uuid-1', is_published: true, published_subdomain: 'clim-ouest', published_domain: null, build_stage: 'pret', is_template: false },
    ]);
    mockSend.mockResolvedValue({ data: { id: 're-1' }, error: null });

    await processSequenceEnrollment(enrollment);

    const envoi = mockSend.mock.calls[0][0] as { text?: string; html?: string };
    expect(`${envoi.text ?? ''}${envoi.html ?? ''}`).toContain('clim-ouest.');
  });

  it('gèle quand le seul site est encore « À faire » — donc pas commencé', async () => {
    // 112 des 115 sites du parc sont dans cet état. « À faire » veut dire
    // « Prêt à créer » au tableau du site-builder, pas « prêt à montrer ».
    wireDemo([
      { id: 'site-uuid-2', is_published: false, published_subdomain: null, published_domain: null, build_stage: 'a_faire', is_template: false },
    ]);

    await processSequenceEnrollment(enrollment);

    expect(mockSend).not.toHaveBeenCalled();
    const updates = tables.sequence_enrollments.captured.updates as Record<string, unknown>[];
    expect(updates[0]).toEqual(expect.objectContaining({ hold_reason: 'demo_manquante', send_at: null }));
  });

  it('ignore un gabarit, qui n’est le site de personne', async () => {
    wireDemo([
      { id: 'tpl-uuid', is_published: true, published_subdomain: 'gabarit', published_domain: null, build_stage: 'pret', is_template: true },
    ]);

    await processSequenceEnrollment(enrollment);

    expect(mockSend).not.toHaveBeenCalled();
  });

  it('ne gèle pas une étape dont le message ne parle pas de démo', async () => {
    wireDemo([], 'Un mot rapide, sans lien.');
    mockSend.mockResolvedValue({ data: { id: 're-1' }, error: null });

    await processSequenceEnrollment(enrollment);

    expect(mockSend).toHaveBeenCalledTimes(1);
  });
});
