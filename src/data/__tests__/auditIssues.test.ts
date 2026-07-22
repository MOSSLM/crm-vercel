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
