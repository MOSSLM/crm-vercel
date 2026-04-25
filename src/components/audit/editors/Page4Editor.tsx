import React from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Plus, Trash2 } from 'lucide-react';
import type { AuditPage4, AuditLivrable } from '@/types';
import { FieldGroup, labelStyle } from './shared';

interface Props {
  data: AuditPage4;
  onChange: (d: AuditPage4) => void;
}

export function Page4Editor({ data, onChange }: Props) {
  const setLiv = (i: number, k: keyof AuditLivrable, v: string | string[]) => {
    const livrables = data.livrables.map((l, idx) => idx === i ? { ...l, [k]: v } : l);
    onChange({ ...data, livrables });
  };
  const setItem = (li: number, ii: number, v: string) => {
    const items = data.livrables[li].items.map((item, idx) => idx === ii ? v : item);
    setLiv(li, 'items', items);
  };
  const addItem = (li: number) => setLiv(li, 'items', [...data.livrables[li].items, '']);
  const removeItem = (li: number, ii: number) => setLiv(li, 'items', data.livrables[li].items.filter((_, idx) => idx !== ii));

  return (
    <div className="space-y-1">
      <div className="border-b border-border pb-4 mb-4">
        <p className={`${labelStyle} mb-3`}>Titres de section</p>
        <FieldGroup label="Titre barre (dark header)">
          <Input value={data.header_section || ''} onChange={e => onChange({ ...data, header_section: e.target.value })} placeholder="Livrables inclus" />
        </FieldGroup>
        <FieldGroup label="Label (petites caps)">
          <Input value={data.section_label || ''} onChange={e => onChange({ ...data, section_label: e.target.value })} placeholder="03 · Ce que vous recevez" />
        </FieldGroup>
        <FieldGroup label="Titre principal">
          <Input value={data.section_title || ''} onChange={e => onChange({ ...data, section_title: e.target.value })} placeholder="Tout est" />
        </FieldGroup>
        <FieldGroup label="Titre — partie italique (bleue)">
          <Input value={data.section_title_em || ''} onChange={e => onChange({ ...data, section_title_em: e.target.value })} placeholder="inclus" />
        </FieldGroup>
        <FieldGroup label="Sous-titre">
          <Textarea value={data.section_subtitle || ''} onChange={e => onChange({ ...data, section_subtitle: e.target.value })} rows={2} placeholder="Aucune mauvaise surprise..." />
        </FieldGroup>
      </div>

      {data.livrables.map((liv, i) => (
        <div key={i} className="border border-border rounded-md p-3 mb-4">
          <FieldGroup label={`Titre livrable ${i + 1}`}>
            <Input value={liv.title} onChange={e => setLiv(i, 'title', e.target.value)} />
          </FieldGroup>
          <p className={labelStyle}>Éléments inclus</p>
          {liv.items.map((item, j) => (
            <div key={j} className="flex items-center gap-1 mb-1">
              <Input value={item} onChange={e => setItem(i, j, e.target.value)} className="flex-1 h-7 text-xs" />
              <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => removeItem(i, j)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => addItem(i)} className="mt-1 h-7 text-xs">
            <Plus className="h-3 w-3 mr-1" /> Ajouter
          </Button>
        </div>
      ))}
    </div>
  );
}
