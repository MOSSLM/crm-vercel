import React from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Plus, Trash2 } from 'lucide-react';
import type { AuditPage3, AuditSolution } from '@/types';
import { FieldGroup, labelStyle } from './shared';

interface Props {
  data: AuditPage3;
  onChange: (d: AuditPage3) => void;
}

export function Page3Editor({ data, onChange }: Props) {
  const setSol = (i: number, k: keyof AuditSolution, v: string) => {
    const solutions = data.solutions.map((s, idx) => idx === i ? { ...s, [k]: v } : s);
    onChange({ ...data, solutions });
  };
  const addSol = () => onChange({ ...data, solutions: [...data.solutions, { num: String(data.solutions.length + 1), name: '', desc: '', tag: '' }] });
  const removeSol = (i: number) => onChange({ ...data, solutions: data.solutions.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-1">
      <div className="border-b border-border pb-4 mb-4">
        <p className={`${labelStyle} mb-3`}>Titres de section</p>
        <FieldGroup label="Titre barre (dark header)">
          <Input value={data.header_section || ''} onChange={e => onChange({ ...data, header_section: e.target.value })} placeholder="Notre solution" />
        </FieldGroup>
        <FieldGroup label="Label (petites caps)">
          <Input value={data.section_label || ''} onChange={e => onChange({ ...data, section_label: e.target.value })} placeholder="02 · Ce que l'on fait" />
        </FieldGroup>
        <FieldGroup label="Titre principal">
          <Input value={data.section_title || ''} onChange={e => onChange({ ...data, section_title: e.target.value })} placeholder="Un site conçu pour" />
        </FieldGroup>
        <FieldGroup label="Titre — partie italique (bleue)">
          <Input value={data.section_title_em || ''} onChange={e => onChange({ ...data, section_title_em: e.target.value })} placeholder="convertir" />
        </FieldGroup>
      </div>

      <FieldGroup label="Intro de section">
        <Textarea value={data.section_intro} onChange={e => onChange({ ...data, section_intro: e.target.value })} rows={2} />
      </FieldGroup>

      <p className={`${labelStyle} mt-4 mb-2`}>Solutions / Conseils</p>
      {data.solutions.map((s, i) => (
        <div key={i} className="border border-border rounded-md p-3 mb-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">#{s.num}</span>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeSol(i)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <FieldGroup label="Nom">
              <Input value={s.name} onChange={e => setSol(i, 'name', e.target.value)} />
            </FieldGroup>
            <FieldGroup label="Tag">
              <Input value={s.tag} onChange={e => setSol(i, 'tag', e.target.value)} placeholder="SEO" />
            </FieldGroup>
          </div>
          <FieldGroup label="Description">
            <Textarea value={s.desc} onChange={e => setSol(i, 'desc', e.target.value)} rows={2} />
          </FieldGroup>
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={addSol} className="w-full">
        <Plus className="h-3 w-3 mr-1" /> Ajouter une solution
      </Button>
    </div>
  );
}
