import type { Form } from '@/types';

export function scoreFormForSite(formTags: string[], siteTags: string[]): number {
  const set = new Set(siteTags.map(s => s.toLowerCase()));
  return formTags.reduce((n, t) => n + (set.has(t.toLowerCase()) ? 1 : 0), 0);
}

export function pickDefaultFormId(forms: Form[], siteTags: string[]): string | null {
  if (!forms.length) return null;
  const scored = forms.map(f => ({
    id: f.id,
    score: scoreFormForSite(f.tags, siteTags),
    ts: new Date(f.updated_at).getTime(),
  }));
  scored.sort((a, b) => b.score - a.score || b.ts - a.ts);
  return scored[0]?.id ?? null;
}
