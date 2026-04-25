import React from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { AuditPage6, AuditNextStep } from '@/types';
import { FieldGroup, labelStyle } from './shared';

interface Props {
  data: AuditPage6;
  onChange: (d: AuditPage6) => void;
}

export function Page6Editor({ data, onChange }: Props) {
  const setStep = (i: number, k: keyof AuditNextStep, v: string) => {
    const steps = data.next_steps.map((s, idx) => idx === i ? { ...s, [k]: v } : s);
    onChange({ ...data, next_steps: steps });
  };
  const set = (k: keyof AuditPage6) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange({ ...data, [k]: e.target.value });

  return (
    <div className="space-y-1">
      <div className="border-b border-border pb-4 mb-4">
        <p className={`${labelStyle} mb-3`}>Titres de section</p>
        <FieldGroup label="Titre barre (dark header)">
          <Input value={data.header_section || ''} onChange={e => onChange({ ...data, header_section: e.target.value })} placeholder="Prochaines étapes" />
        </FieldGroup>
        <FieldGroup label="Label (petites caps)">
          <Input value={data.section_label || ''} onChange={e => onChange({ ...data, section_label: e.target.value })} placeholder="05 · Pour démarrer" />
        </FieldGroup>
        <FieldGroup label="Titre — ligne 1">
          <Input value={data.section_title || ''} onChange={e => onChange({ ...data, section_title: e.target.value })} placeholder="Simple, rapide," />
        </FieldGroup>
        <FieldGroup label="Titre — ligne 2">
          <Input value={data.section_title_line2 || ''} onChange={e => onChange({ ...data, section_title_line2: e.target.value })} placeholder="et c'est" />
        </FieldGroup>
        <FieldGroup label="Titre — partie italique (bleue)">
          <Input value={data.section_title_em || ''} onChange={e => onChange({ ...data, section_title_em: e.target.value })} placeholder="lancé" />
        </FieldGroup>
        <FieldGroup label="Sous-titre">
          <Textarea value={data.section_subtitle || ''} onChange={e => onChange({ ...data, section_subtitle: e.target.value })} rows={2} placeholder="Pas de processus compliqué..." />
        </FieldGroup>
      </div>

      <p className={`${labelStyle} mb-2`}>Prochaines étapes</p>
      {data.next_steps.map((step, i) => (
        <div key={i} className="border border-border rounded-md p-3 mb-3 space-y-2">
          <FieldGroup label={`Étape ${i + 1} — Titre`}>
            <Input value={step.title} onChange={e => setStep(i, 'title', e.target.value)} />
          </FieldGroup>
          <FieldGroup label="Description">
            <Textarea value={step.desc} onChange={e => setStep(i, 'desc', e.target.value)} rows={2} />
          </FieldGroup>
        </div>
      ))}

      <div className="border-t border-border pt-4">
        <p className={`${labelStyle} mb-3`}>Bloc CTA</p>
        <FieldGroup label="Titre CTA">
          <Input value={data.cta_title} onChange={set('cta_title')} />
        </FieldGroup>
        <FieldGroup label="Sous-titre CTA">
          <Input value={data.cta_sub} onChange={set('cta_sub')} />
        </FieldGroup>
        <div className="grid grid-cols-2 gap-2">
          <FieldGroup label="Téléphone">
            <Input value={data.contact_phone} onChange={set('contact_phone')} />
          </FieldGroup>
          <FieldGroup label="Email">
            <Input value={data.contact_email} onChange={set('contact_email')} />
          </FieldGroup>
        </div>
        <FieldGroup label="Site web">
          <Input value={data.contact_website} onChange={set('contact_website')} />
        </FieldGroup>
      </div>
    </div>
  );
}
