import type { Form, FormQuestion, FormLogicRule } from '@/types';
import {
  calculerCompletion,
  choisirFormulaire,
  estFormulaireCompteRendu,
  estRepondu,
  formaterValeur,
  formulairesEligibles,
  questionsVisibles,
  resumerReponses,
  titreParDefaut,
} from '../formulaire';

function q(id: string, over: Partial<FormQuestion> = {}): FormQuestion {
  return { id, ref: id.toUpperCase(), type: 'short_text', title: `Titre ${id}`, ...over };
}

function makeForm(over: Partial<Form> = {}): Form {
  return {
    id: 'f1',
    name: 'Compte rendu',
    tags: ['compte-rendu'],
    questions: [],
    logic: [],
    brand: {},
    settings: {
      progressBar: true,
      showQuestionNumber: true,
      submitLabel: 'Envoyer',
      renderMode: 'scroll',
    },
    style: {},
    is_published: false,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...over,
  };
}

// ── éligibilité ───────────────────────────────────────────────────────────────

describe('estFormulaireCompteRendu', () => {
  it('accepte le tag compte-rendu', () => {
    expect(estFormulaireCompteRendu({ tags: ['compte-rendu'] })).toBe(true);
  });
  it('accepte le tag rdv', () => {
    expect(estFormulaireCompteRendu({ tags: ['rdv'] })).toBe(true);
  });
  it('ignore la casse et les espaces', () => {
    expect(estFormulaireCompteRendu({ tags: ['  Compte-Rendu '] })).toBe(true);
  });
  it('refuse un formulaire sans tag pertinent', () => {
    expect(estFormulaireCompteRendu({ tags: ['devis', 'contact'] })).toBe(false);
  });
  it('refuse un formulaire sans tags', () => {
    expect(estFormulaireCompteRendu({ tags: [] })).toBe(false);
  });
});

describe('formulairesEligibles', () => {
  it('ne garde que les formulaires tagués, du plus récent au plus ancien', () => {
    const a = makeForm({ id: 'a', updated_at: '2026-01-01T00:00:00Z' });
    const b = makeForm({ id: 'b', updated_at: '2026-06-01T00:00:00Z' });
    const c = makeForm({ id: 'c', tags: ['devis'] });
    expect(formulairesEligibles([a, b, c]).map((f) => f.id)).toEqual(['b', 'a']);
  });

  it('traite une date invalide comme la plus ancienne au lieu de casser le tri', () => {
    const bon = makeForm({ id: 'bon', updated_at: '2026-06-01T00:00:00Z' });
    const casse = makeForm({ id: 'casse', updated_at: 'pas-une-date' });
    expect(formulairesEligibles([casse, bon]).map((f) => f.id)).toEqual(['bon', 'casse']);
  });
});

// ── choix du formulaire ───────────────────────────────────────────────────────

describe('choisirFormulaire', () => {
  const dedie = makeForm({ id: 'dedie', enterprise_id: 42, updated_at: '2026-01-01T00:00:00Z' });
  const recent = makeForm({ id: 'recent', updated_at: '2026-07-01T00:00:00Z' });
  const vieux = makeForm({ id: 'vieux', updated_at: '2026-02-01T00:00:00Z' });

  it('retourne null quand aucun formulaire n’est éligible', () => {
    expect(choisirFormulaire([makeForm({ tags: ['devis'] })])).toBeNull();
  });

  it('retourne null sur une liste vide', () => {
    expect(choisirFormulaire([])).toBeNull();
  });

  it('honore le formId demandé avant tout le reste', () => {
    expect(choisirFormulaire([dedie, recent], { formId: 'dedie', entrepriseId: 7 })?.id).toBe('dedie');
  });

  it('rouvre un formulaire même s’il n’est plus tagué', () => {
    const detagué = makeForm({ id: 'ancien', tags: [] });
    expect(choisirFormulaire([detagué, recent], { formId: 'ancien' })?.id).toBe('ancien');
  });

  it('retombe sur le choix normal si le formId demandé n’existe plus', () => {
    expect(choisirFormulaire([recent, vieux], { formId: 'disparu' })?.id).toBe('recent');
  });

  it('préfère un formulaire dédié à l’entreprise', () => {
    expect(choisirFormulaire([recent, dedie], { entrepriseId: 42 })?.id).toBe('dedie');
  });

  it('ignore le formulaire dédié à une autre entreprise', () => {
    expect(choisirFormulaire([recent, dedie], { entrepriseId: 99 })?.id).toBe('recent');
  });

  it('prend le plus récent sans autre indice', () => {
    expect(choisirFormulaire([vieux, recent])?.id).toBe('recent');
  });
});

// ── questions visibles ────────────────────────────────────────────────────────

describe('questionsVisibles', () => {
  it('écarte les écrans structurels', () => {
    const form = makeForm({
      questions: [
        q('w', { type: 'welcome' }),
        q('a'),
        q('s', { type: 'statement' }),
        q('e', { type: 'end' }),
      ],
    });
    expect(questionsVisibles(form, {}).map((x) => x.id)).toEqual(['a']);
  });

  it('applique la logique conditionnelle du form builder', () => {
    const logic: FormLogicRule[] = [
      { id: 'r1', from: 'a', to: 'c', cond: { all: [{ field: 'a', op: 'eq', value: 'non' }] } },
    ];
    const form = makeForm({ questions: [q('a'), q('b'), q('c')], logic });

    expect(questionsVisibles(form, {}).map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(questionsVisibles(form, { a: 'non' }).map((x) => x.id)).toEqual(['a', 'c']);
  });

  it('ne casse pas sur un formulaire sans questions', () => {
    expect(questionsVisibles(makeForm(), {})).toEqual([]);
  });
});

// ── complétion ────────────────────────────────────────────────────────────────

describe('estRepondu', () => {
  it.each([
    [undefined, false],
    [null, false],
    ['', false],
    ['   ', false],
    [[], false],
    ['x', true],
    [0, true],
    [false, true],
    [['a'], true],
  ])('estRepondu(%p) === %p', (valeur, attendu) => {
    expect(estRepondu(valeur)).toBe(attendu);
  });
});

describe('calculerCompletion', () => {
  const form = makeForm({
    questions: [q('a', { required: true }), q('b'), q('c', { required: true })],
  });

  it('renvoie 0 % sans NaN sur un formulaire vide', () => {
    expect(calculerCompletion(makeForm(), {})).toEqual({
      repondues: 0,
      total: 0,
      pct: 0,
      manquantes: [],
    });
  });

  it('compte les réponses et arrondit le pourcentage', () => {
    const res = calculerCompletion(form, { a: 'oui' });
    expect(res.repondues).toBe(1);
    expect(res.total).toBe(3);
    expect(res.pct).toBe(33);
  });

  it('liste les obligatoires encore vides', () => {
    const res = calculerCompletion(form, { a: 'oui' });
    expect(res.manquantes.map((x) => x.id)).toEqual(['c']);
  });

  it('atteint 100 % quand tout est rempli', () => {
    const res = calculerCompletion(form, { a: '1', b: '2', c: '3' });
    expect(res.pct).toBe(100);
    expect(res.manquantes).toEqual([]);
  });

  it('ne réclame pas une question obligatoire sautée par la logique', () => {
    const logic: FormLogicRule[] = [
      { id: 'r1', from: 'a', to: 'c', cond: { all: [{ field: 'a', op: 'eq', value: 'skip' }] } },
    ];
    const avecLogique = makeForm({
      questions: [q('a', { required: true }), q('b', { required: true }), q('c')],
      logic,
    });
    const res = calculerCompletion(avecLogique, { a: 'skip' });
    expect(res.total).toBe(2);
    expect(res.manquantes).toEqual([]);
  });
});

// ── formatage ─────────────────────────────────────────────────────────────────

describe('formaterValeur', () => {
  const choix = q('x', {
    type: 'single_choice',
    choices: [
      { id: 'c1', label: 'Chauffage' },
      { id: 'c2', label: 'Solaire', value: 'solar' },
    ],
  });

  it('remplace un identifiant de choix par son libellé', () => {
    expect(formaterValeur(choix, 'c1')).toBe('Chauffage');
  });

  it('reconnaît aussi la valeur du choix', () => {
    expect(formaterValeur(choix, 'solar')).toBe('Solaire');
  });

  it('joint les choix multiples', () => {
    expect(formaterValeur(choix, ['c1', 'c2'])).toBe('Chauffage, Solaire');
  });

  it('traduit oui/non', () => {
    expect(formaterValeur(q('y', { type: 'yes_no' }), 'yes')).toBe('Oui');
    expect(formaterValeur(q('y', { type: 'yes_no' }), 'no')).toBe('Non');
    expect(formaterValeur(null, true)).toBe('Oui');
  });

  it('ajoute l’unité', () => {
    expect(formaterValeur(q('n', { type: 'number', unit: '€' }), 1500)).toBe('1500 €');
  });

  it('rend une valeur inconnue telle quelle', () => {
    expect(formaterValeur(null, 'texte libre')).toBe('texte libre');
  });

  it('rend une valeur absente comme chaîne vide', () => {
    expect(formaterValeur(null, undefined)).toBe('');
    expect(formaterValeur(null, null)).toBe('');
  });
});

// ── relecture ─────────────────────────────────────────────────────────────────

describe('resumerReponses', () => {
  const form = makeForm({ questions: [q('a', { title: 'Budget' }), q('b', { title: 'Délai' })] });

  it('rend les réponses dans l’ordre du formulaire', () => {
    const lignes = resumerReponses(form, { b: '3 mois', a: '5000' });
    expect(lignes.map((l) => l.label)).toEqual(['Budget', 'Délai']);
  });

  it('saute les réponses vides', () => {
    expect(resumerReponses(form, { a: '', b: 'x' }).map((l) => l.label)).toEqual(['Délai']);
  });

  it('conserve les réponses dont la question a disparu, marquées orphelines', () => {
    const lignes = resumerReponses(form, { a: '5000', q_supprimee: 'valeur perdue' });
    expect(lignes).toHaveLength(2);
    expect(lignes[1]).toMatchObject({ id: 'q_supprimee', texte: 'valeur perdue', orpheline: true });
  });

  it('place les orphelines après les questions connues', () => {
    const lignes = resumerReponses(form, { zz_orpheline: 'x', b: 'y' });
    expect(lignes.map((l) => l.orpheline)).toEqual([false, true]);
  });

  it('rend tout orphelin quand le formulaire est introuvable', () => {
    const lignes = resumerReponses(null, { a: '5000' });
    expect(lignes).toEqual([{ id: 'a', label: 'a', texte: '5000', orpheline: true }]);
  });

  it('ignore les écrans structurels', () => {
    const avecAccueil = makeForm({ questions: [q('w', { type: 'welcome' }), q('a')] });
    expect(resumerReponses(avecAccueil, { w: 'x', a: 'y' }).map((l) => l.id)).toEqual(['a']);
  });
});

describe('titreParDefaut', () => {
  it('compose canal et date en français', () => {
    expect(titreParDefaut('appel', new Date('2026-08-12T10:00:00Z'))).toBe('Appel — 12 août 2026');
  });

  it('retombe sur « Échange » pour un canal inconnu', () => {
    expect(titreParDefaut('inconnu', new Date('2026-08-12T10:00:00Z'))).toBe('Échange — 12 août 2026');
  });
});
