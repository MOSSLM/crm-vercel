import { scoreFormForSite, pickDefaultFormId } from '../match-form-by-tags';
import type { Form } from '@/types';

function makeForm(id: string, tags: string[], updatedAt: string): Form {
  return {
    id,
    name: id,
    tags,
    questions: [],
    logic: [],
    brand: {},
    settings: {
      progressBar: false,
      showQuestionNumber: false,
      submitLabel: 'Submit',
      renderMode: 'step',
    },
    style: {},
    is_published: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: updatedAt,
  };
}

// ── scoreFormForSite ──────────────────────────────────────────────────────────

describe('scoreFormForSite', () => {
  it('returns 0 when there is no overlap', () => {
    expect(scoreFormForSite(['energy', 'hvac'], ['plumbing', 'solar'])).toBe(0);
  });

  it('returns partial score for partial overlap', () => {
    expect(scoreFormForSite(['energy', 'hvac', 'solar'], ['solar', 'plumbing'])).toBe(1);
  });

  it('returns full score when all form tags match site tags', () => {
    expect(scoreFormForSite(['solar', 'hvac'], ['hvac', 'solar', 'energy'])).toBe(2);
  });

  it('is case-insensitive', () => {
    expect(scoreFormForSite(['HVAC', 'Solar'], ['hvac', 'solar'])).toBe(2);
    expect(scoreFormForSite(['hvac'], ['HVAC'])).toBe(1);
  });

  it('returns 0 for empty form tags', () => {
    expect(scoreFormForSite([], ['hvac', 'solar'])).toBe(0);
  });

  it('returns 0 for empty site tags', () => {
    expect(scoreFormForSite(['hvac', 'solar'], [])).toBe(0);
  });
});

// ── pickDefaultFormId ─────────────────────────────────────────────────────────

describe('pickDefaultFormId', () => {
  it('returns null for empty forms array', () => {
    expect(pickDefaultFormId([], ['hvac'])).toBeNull();
  });

  it('returns the single form id when only one form exists', () => {
    const forms = [makeForm('f1', [], '2026-01-01T00:00:00.000Z')];
    expect(pickDefaultFormId(forms, ['hvac'])).toBe('f1');
  });

  it('returns the form with highest tag score', () => {
    const forms = [
      makeForm('f1', ['solar'], '2026-01-01T00:00:00.000Z'),
      makeForm('f2', ['hvac', 'energy'], '2026-01-01T00:00:00.000Z'),
    ];
    expect(pickDefaultFormId(forms, ['hvac', 'energy', 'heat'])).toBe('f2');
  });

  it('breaks ties by most recently updated', () => {
    const forms = [
      makeForm('f1', ['hvac'], '2026-01-01T00:00:00.000Z'),
      makeForm('f2', ['hvac'], '2026-06-01T00:00:00.000Z'),
    ];
    expect(pickDefaultFormId(forms, ['hvac'])).toBe('f2');
  });

  it('picks a form even when score is 0 for all', () => {
    const forms = [
      makeForm('f1', ['solar'], '2026-01-01T00:00:00.000Z'),
      makeForm('f2', ['energy'], '2026-02-01T00:00:00.000Z'),
    ];
    // no site tags → all score 0, most recent wins
    const result = pickDefaultFormId(forms, []);
    expect(result).toBe('f2');
  });

  it('is case-insensitive in tag matching', () => {
    const forms = [
      makeForm('f1', ['HVAC'], '2026-01-01T00:00:00.000Z'),
      makeForm('f2', [], '2026-01-01T00:00:00.000Z'),
    ];
    expect(pickDefaultFormId(forms, ['hvac'])).toBe('f1');
  });
});
