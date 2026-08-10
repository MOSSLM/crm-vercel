import {
  AUDIT_ISSUE_CATALOG,
  backfillProblemKeys,
  backfillSolutionKeys,
  issueKeyForProblemTitle,
  issueKeyForSolutionName,
} from '../auditIssues';
import type { AuditProblem, AuditSolution } from '@/types';

const sample = AUDIT_ISSUE_CATALOG[0]; // no_reviews_on_site

describe('issue title/name → key lookups', () => {
  it('resolves a problem key from its rendered title', () => {
    expect(issueKeyForProblemTitle(sample.problem.title)).toBe(sample.key);
  });

  it('resolves a problem key from its checklist label (legacy fallback)', () => {
    expect(issueKeyForProblemTitle(sample.label)).toBe(sample.key);
  });

  it('is case- and whitespace-insensitive', () => {
    expect(issueKeyForProblemTitle(`  ${sample.problem.title.toUpperCase()}  `)).toBe(sample.key);
  });

  it('resolves a solution key from its name', () => {
    expect(issueKeyForSolutionName(sample.solution.name)).toBe(sample.key);
  });

  it('returns undefined for unknown / custom text', () => {
    expect(issueKeyForProblemTitle('Un problème totalement sur mesure')).toBeUndefined();
    expect(issueKeyForSolutionName('')).toBeUndefined();
  });
});

describe('backfillProblemKeys', () => {
  it('assigns the catalog key to a legacy card that has none (fixes ×2 duplication)', () => {
    const legacy: AuditProblem[] = [{ title: sample.problem.title, desc: sample.problem.desc }];
    const [out] = backfillProblemKeys(legacy);
    expect(out.key).toBe(sample.key);
  });

  it('leaves an already-keyed card untouched', () => {
    const keyed: AuditProblem[] = [{ key: sample.key, title: 'edited title', desc: 'x' }];
    expect(backfillProblemKeys(keyed)[0]).toBe(keyed[0]); // same reference, no change
  });

  it('leaves a genuinely custom card keyless', () => {
    const custom: AuditProblem[] = [{ title: 'Souci maison', desc: 'y' }];
    expect(backfillProblemKeys(custom)[0].key).toBeUndefined();
  });
});

describe('backfillSolutionKeys', () => {
  it('assigns the catalog key to a legacy solution matched by name', () => {
    const legacy: AuditSolution[] = [
      { num: '1', name: sample.solution.name, desc: sample.solution.desc, tag: sample.solution.tag },
    ];
    expect(backfillSolutionKeys(legacy)[0].key).toBe(sample.key);
  });
});

describe("la colonne « après » du catalogue", () => {
  it("porte un commentaire partout où elle porte une valeur", () => {
    for (const d of AUDIT_ISSUE_CATALOG) {
      if (!d.apres) continue;
      expect(d.apres.valeur.length).toBeGreaterThan(2);
      expect(d.apres.comment.length).toBeGreaterThan(20);
    }
  });

  it("laisse sans après les deux constats qui ne se comparent pas", () => {
    // Un site qui n'existe pas n'a pas de valeur « avant » dans la même unité,
    // et une note Google basse ne se corrige pas en construisant un site :
    // promettre « 3,2 → 4,6 » serait s'engager sur ce que les clients écriront.
    const sansApres = AUDIT_ISSUE_CATALOG.filter((d) => !d.apres).map((d) => d.key);
    expect(sansApres.sort()).toEqual(["low_rating", "no_site_or_unreachable"]);
  });

  it("n'annonce jamais un résultat en pourcentage", () => {
    // Un pourcentage sur un seul site n'a pas de dénominateur vérifiable, et la
    // règle éditoriale du document l'interdit partout ailleurs.
    for (const d of AUDIT_ISSUE_CATALOG) {
      expect(d.apres?.valeur ?? "").not.toMatch(/%/);
    }
  });
});

describe("l'« après » doit battre le seuil, pas seulement paraître bon", () => {
  /**
   * Une ligne du tableau n'apparaît QUE si sa preuve est en échec, donc au-delà
   * du seuil. Une valeur promise meilleure que le seuil est donc meilleure que
   * toutes les mesures capables de déclencher la ligne.
   *
   * La règle vient d'un cas réel : « Moins de 1,5 s » semblait raisonnable pour
   * un serveur lent, jusqu'à ce qu'une entreprise mesurée à 1,3 s reçoive la
   * ligne « 1,3 s → moins de 1,5 s ». Promesse nulle, et embarrassante.
   */
  const SEUILS: Array<{ key: string; seuil: number; unite: RegExp }> = [
    { key: 'slow_site', seuil: 0.8, unite: /([\d,]+)\s*s\b/ }, // SEUILS.ttfbMs = 800 ms
    { key: 'form_not_accessible', seuil: 4, unite: /(\d+)\s*champs/ },
  ];

  it.each(SEUILS)('$key promet mieux que son seuil', ({ key, seuil, unite }) => {
    const valeur = AUDIT_ISSUE_CATALOG.find((d) => d.key === key)?.apres?.valeur ?? '';
    const trouve = unite.exec(valeur);
    expect(trouve).not.toBeNull();
    expect(Number(trouve![1].replace(',', '.'))).toBeLessThan(seuil);
  });
});
