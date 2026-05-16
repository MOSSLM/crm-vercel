'use client';

import { useEffect, useState, useCallback } from 'react';
import type { Form, SectionFormPickerField } from '@/types';
import { scoreFormForSite } from '@/lib/form-builder/match-form-by-tags';

interface FormPickerFieldProps {
  field: SectionFormPickerField;
  value: string;
  onChange: (v: string) => void;
  siteTags?: string[];
}

export function FormPickerField({ value, onChange, siteTags = [] }: FormPickerFieldProps) {
  const [forms, setForms] = useState<Form[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/forms')
      .then((r) => r.json())
      .then((d: Form[]) => { setForms(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const scored = useCallback(() => {
    return [...forms].sort((a, b) => {
      const sa = scoreFormForSite(a.tags, siteTags);
      const sb = scoreFormForSite(b.tags, siteTags);
      if (sb !== sa) return sb - sa;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [forms, siteTags]);

  const sorted = scored();
  const recommended = sorted.filter((f) => scoreFormForSite(f.tags, siteTags) > 0);
  const others = sorted.filter((f) => scoreFormForSite(f.tags, siteTags) === 0);

  if (loading) {
    return (
      <div className="text-xs text-white/30 py-2">Chargement des formulaires…</div>
    );
  }

  if (forms.length === 0) {
    return (
      <div className="text-xs text-white/30 py-2">
        Aucun formulaire.{' '}
        <a href="/forms" className="text-blue-400 hover:underline" target="_blank" rel="noreferrer">
          Créer un formulaire →
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white/5 border border-white/10 rounded text-white text-xs px-2.5 py-1.5 focus:outline-none"
      >
        <option value="">-- Choisir un formulaire --</option>
        {recommended.length > 0 && (
          <optgroup label="Recommandés pour ce site">
            {recommended.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} {f.is_published ? '' : '(brouillon)'}
              </option>
            ))}
          </optgroup>
        )}
        {others.length > 0 && (
          <optgroup label="Autres">
            {others.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} {f.is_published ? '' : '(brouillon)'}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      {value && (
        <a
          href={`/forms/${value}/edit`}
          className="text-[10px] text-blue-400 hover:underline"
          target="_blank"
          rel="noreferrer"
        >
          Ouvrir dans le builder →
        </a>
      )}
    </div>
  );
}
