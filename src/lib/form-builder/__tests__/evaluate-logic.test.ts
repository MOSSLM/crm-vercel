import { valueMatches, evalCondition, nextQuestionId, resolveFlow } from '../evaluate-logic';
import type { FormLogicCondition, FormQuestion, FormLogicRule } from '@/types';

// ── valueMatches ──────────────────────────────────────────────────────────────

describe('valueMatches', () => {
  describe('eq', () => {
    it('returns true when scalar equals target', () => {
      expect(valueMatches('hello', 'eq', 'hello')).toBe(true);
    });
    it('returns false when scalar differs', () => {
      expect(valueMatches('hello', 'eq', 'world')).toBe(false);
    });
    it('returns true when array includes target', () => {
      expect(valueMatches(['a', 'b'], 'eq', 'a')).toBe(true);
    });
    it('returns false when array does not include target', () => {
      expect(valueMatches(['a', 'b'], 'eq', 'c')).toBe(false);
    });
  });

  describe('neq', () => {
    it('returns true when scalar differs', () => {
      expect(valueMatches('hello', 'neq', 'world')).toBe(true);
    });
    it('returns false when scalar equals', () => {
      expect(valueMatches('hello', 'neq', 'hello')).toBe(false);
    });
    it('returns true when array does not include target', () => {
      expect(valueMatches(['a', 'b'], 'neq', 'c')).toBe(true);
    });
    it('returns false when array includes target', () => {
      expect(valueMatches(['a', 'b'], 'neq', 'a')).toBe(false);
    });
  });

  describe('contains', () => {
    it('returns true when string contains target', () => {
      expect(valueMatches('hello world', 'contains', 'world')).toBe(true);
    });
    it('returns false when string does not contain target', () => {
      expect(valueMatches('hello', 'contains', 'world')).toBe(false);
    });
    it('returns true when array includes target', () => {
      expect(valueMatches(['a', 'b', 'c'], 'contains', 'b')).toBe(true);
    });
    it('returns false when array does not include target', () => {
      expect(valueMatches(['a', 'b'], 'contains', 'z')).toBe(false);
    });
  });

  describe('not_contains', () => {
    it('returns true when string does not contain target', () => {
      expect(valueMatches('hello', 'not_contains', 'world')).toBe(true);
    });
    it('returns false when string contains target', () => {
      expect(valueMatches('hello world', 'not_contains', 'world')).toBe(false);
    });
    it('returns true when array does not include target', () => {
      expect(valueMatches(['a', 'b'], 'not_contains', 'z')).toBe(true);
    });
    it('returns false when array includes target', () => {
      expect(valueMatches(['a', 'b', 'c'], 'not_contains', 'b')).toBe(false);
    });
  });

  describe('gt / gte / lt / lte', () => {
    it('gt: true when val > target', () => expect(valueMatches(5, 'gt', 3)).toBe(true));
    it('gt: false when val <= target', () => expect(valueMatches(3, 'gt', 5)).toBe(false));
    it('gte: true when val >= target', () => expect(valueMatches(5, 'gte', 5)).toBe(true));
    it('gte: false when val < target', () => expect(valueMatches(4, 'gte', 5)).toBe(false));
    it('lt: true when val < target', () => expect(valueMatches(2, 'lt', 5)).toBe(true));
    it('lt: false when val >= target', () => expect(valueMatches(5, 'lt', 5)).toBe(false));
    it('lte: true when val <= target', () => expect(valueMatches(5, 'lte', 5)).toBe(true));
    it('lte: false when val > target', () => expect(valueMatches(6, 'lte', 5)).toBe(false));
  });

  describe('answered', () => {
    it('returns true for non-empty string', () => {
      expect(valueMatches('hello', 'answered', undefined)).toBe(true);
    });
    it('returns false for empty string', () => {
      expect(valueMatches('', 'answered', undefined)).toBe(false);
    });
    it('returns false for undefined', () => {
      expect(valueMatches(undefined, 'answered', undefined)).toBe(false);
    });
    it('returns false for empty array', () => {
      expect(valueMatches([], 'answered', undefined)).toBe(false);
    });
    it('returns true for non-empty array', () => {
      expect(valueMatches(['a'], 'answered', undefined)).toBe(true);
    });
  });

  describe('empty', () => {
    it('returns true for undefined', () => {
      expect(valueMatches(undefined, 'empty', undefined)).toBe(true);
    });
    it('returns true for empty string', () => {
      expect(valueMatches('', 'empty', undefined)).toBe(true);
    });
    it('returns true for empty array', () => {
      expect(valueMatches([], 'empty', undefined)).toBe(true);
    });
    it('returns false for non-empty string', () => {
      expect(valueMatches('hello', 'empty', undefined)).toBe(false);
    });
    it('returns false for non-empty array', () => {
      expect(valueMatches(['a'], 'empty', undefined)).toBe(false);
    });
  });
});

// ── evalCondition ─────────────────────────────────────────────────────────────

describe('evalCondition', () => {
  const answers = { q1: 'yes', q2: ['a', 'b'], q3: '' };

  it('returns true when cond is undefined', () => {
    expect(evalCondition(undefined, answers)).toBe(true);
  });

  it('returns true when all clauses pass (AND)', () => {
    const cond: FormLogicCondition = {
      all: [
        { field: 'q1', op: 'eq', value: 'yes' },
        { field: 'q2', op: 'contains', value: 'a' },
      ],
    };
    expect(evalCondition(cond, answers)).toBe(true);
  });

  it('returns false when one all clause fails', () => {
    const cond: FormLogicCondition = {
      all: [
        { field: 'q1', op: 'eq', value: 'yes' },
        { field: 'q1', op: 'eq', value: 'no' },
      ],
    };
    expect(evalCondition(cond, answers)).toBe(false);
  });

  it('returns true when any clause passes (OR)', () => {
    const cond: FormLogicCondition = {
      any: [
        { field: 'q1', op: 'eq', value: 'no' },
        { field: 'q1', op: 'eq', value: 'yes' },
      ],
    };
    expect(evalCondition(cond, answers)).toBe(true);
  });

  it('returns false when no any clause passes', () => {
    const cond: FormLogicCondition = {
      any: [
        { field: 'q1', op: 'eq', value: 'no' },
        { field: 'q3', op: 'eq', value: 'maybe' },
      ],
    };
    expect(evalCondition(cond, answers)).toBe(false);
  });

  it('returns true for empty cond object (no all/any)', () => {
    expect(evalCondition({}, answers)).toBe(true);
  });
});

// ── helpers ───────────────────────────────────────────────────────────────────

function makeQ(id: string): FormQuestion {
  return { id, ref: id, type: 'short_text', title: id };
}

function makeForm(
  questions: FormQuestion[],
  logic: FormLogicRule[] = [],
) {
  return { questions, logic };
}

// ── nextQuestionId ────────────────────────────────────────────────────────────

describe('nextQuestionId', () => {
  const q1 = makeQ('q1');
  const q2 = makeQ('q2');
  const q3 = makeQ('q3');

  it('returns next sequential question when no rule matches', () => {
    const form = makeForm([q1, q2, q3]);
    expect(nextQuestionId(form, 'q1', {})).toBe('q2');
  });

  it('returns rule target when rule condition matches', () => {
    const form = makeForm([q1, q2, q3], [
      { id: 'r1', from: 'q1', to: 'q3', cond: { all: [{ field: 'q1', op: 'eq', value: 'jump' }] } },
    ]);
    expect(nextQuestionId(form, 'q1', { q1: 'jump' })).toBe('q3');
  });

  it('falls through to sequential when rule condition does not match', () => {
    const form = makeForm([q1, q2, q3], [
      { id: 'r1', from: 'q1', to: 'q3', cond: { all: [{ field: 'q1', op: 'eq', value: 'jump' }] } },
    ]);
    expect(nextQuestionId(form, 'q1', { q1: 'other' })).toBe('q2');
  });

  it('returns null at end of form', () => {
    const form = makeForm([q1, q2, q3]);
    expect(nextQuestionId(form, 'q3', {})).toBeNull();
  });

  it('returns null for unknown question id', () => {
    const form = makeForm([q1, q2]);
    expect(nextQuestionId(form, 'unknown', {})).toBeNull();
  });
});

// ── resolveFlow ───────────────────────────────────────────────────────────────

describe('resolveFlow', () => {
  const q1 = makeQ('q1');
  const q2 = makeQ('q2');
  const q3 = makeQ('q3');
  const q4 = makeQ('q4');

  it('returns all question ids in sequential order with no logic', () => {
    const form = makeForm([q1, q2, q3]);
    expect(resolveFlow(form, {})).toEqual(['q1', 'q2', 'q3']);
  });

  it('applies logic rules and skips questions', () => {
    const form = makeForm([q1, q2, q3, q4], [
      { id: 'r1', from: 'q1', to: 'q3', cond: { all: [{ field: 'q1', op: 'eq', value: 'skip' }] } },
    ]);
    expect(resolveFlow(form, { q1: 'skip' })).toEqual(['q1', 'q3', 'q4']);
  });

  it('does not loop on cyclic logic (anti-cycle)', () => {
    // q1 → q2 → q1 would cycle; resolveFlow should stop
    const form = makeForm([q1, q2], [
      { id: 'r1', from: 'q2', to: 'q1' },
    ]);
    const flow = resolveFlow(form, {});
    expect(flow).toEqual(['q1', 'q2']);
  });

  it('returns empty array for empty form', () => {
    expect(resolveFlow({ questions: [], logic: [] }, {})).toEqual([]);
  });

  it('returns ordered ids respecting multiple rules', () => {
    const form = makeForm([q1, q2, q3, q4], [
      { id: 'r1', from: 'q1', to: 'q2', cond: { all: [{ field: 'q1', op: 'eq', value: 'a' }] } },
      { id: 'r2', from: 'q2', to: 'q4', cond: { all: [{ field: 'q2', op: 'answered', value: undefined }] } },
    ]);
    expect(resolveFlow(form, { q1: 'a', q2: 'something' })).toEqual(['q1', 'q2', 'q4']);
  });
});
