import type { FormLogicOp, FormLogicCondition, FormQuestion, FormLogicRule } from '@/types';

export function valueMatches(val: unknown, op: FormLogicOp, target: unknown): boolean {
  switch (op) {
    case 'eq':  return Array.isArray(val) ? val.includes(target) : val === target;
    case 'neq': return Array.isArray(val) ? !val.includes(target) : val !== target;
    case 'contains':     return Array.isArray(val) ? val.includes(target) : String(val ?? '').includes(String(target ?? ''));
    case 'not_contains': return Array.isArray(val) ? !val.includes(target) : !String(val ?? '').includes(String(target ?? ''));
    case 'gt':  return Number(val) >  Number(target);
    case 'gte': return Number(val) >= Number(target);
    case 'lt':  return Number(val) <  Number(target);
    case 'lte': return Number(val) <= Number(target);
    case 'answered': return val !== undefined && val !== '' && !(Array.isArray(val) && val.length === 0);
    case 'empty':    return val === undefined || val === '' || (Array.isArray(val) && val.length === 0);
    default: return false;
  }
}

export function evalCondition(
  cond: FormLogicCondition | undefined,
  answers: Record<string, unknown>,
): boolean {
  if (!cond) return true;
  if (cond.all) return cond.all.every((c) => valueMatches(answers[c.field], c.op, c.value));
  if (cond.any) return cond.any.some((c) => valueMatches(answers[c.field], c.op, c.value));
  return true;
}

export function nextQuestionId(
  form: { questions: FormQuestion[]; logic: FormLogicRule[] },
  currentId: string,
  answers: Record<string, unknown>,
): string | null {
  const rules = form.logic.filter((r) => r.from === currentId);
  for (const r of rules) {
    if (evalCondition(r.cond, answers)) return r.to;
  }
  const idx = form.questions.findIndex((q) => q.id === currentId);
  if (idx < 0) return null;
  return form.questions[idx + 1]?.id ?? null;
}

export function resolveFlow(
  form: { questions: FormQuestion[]; logic: FormLogicRule[] },
  answers: Record<string, unknown>,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  let cur: string | null | undefined = form.questions[0]?.id;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    out.push(cur);
    cur = nextQuestionId(form, cur, answers);
  }
  return out;
}
