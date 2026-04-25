import React from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { AuditPage1 } from '@/types';
import { FieldGroup, labelStyle } from './shared';

interface Props {
  data: AuditPage1;
  logoUrl?: string;
  onChange: (d: AuditPage1) => void;
  onMetaChange: (k: string, v: string) => void;
}

export function Page1Editor({ data, logoUrl, onChange, onMetaChange }: Props) {
  const set = (k: keyof AuditPage1) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange({ ...data, [k]: e.target.value });

  return (
    <div className="space-y-1">
      <FieldGroup label="Date (en-tête)">
        <Input value={data.date} onChange={set('date')} placeholder="Audit · Avril 2025" />
      </FieldGroup>
      <FieldGroup label="Accroche (eyebrow)">
        <Input value={data.eyebrow} onChange={set('eyebrow')} />
      </FieldGroup>
      <FieldGroup label="Titre — ligne 1">
        <Input value={data.title_line1} onChange={set('title_line1')} />
      </FieldGroup>
      <FieldGroup label="Titre — ligne 2">
        <Input value={data.title_line2} onChange={set('title_line2')} />
      </FieldGroup>
      <FieldGroup label="Titre — ligne 3 (italique)">
        <Input value={data.title_line3} onChange={set('title_line3')} />
      </FieldGroup>
      <FieldGroup label="Sous-titre">
        <Textarea value={data.subtitle} onChange={set('subtitle')} rows={2} />
      </FieldGroup>
      <div className="border-t border-border pt-4 mt-4">
        <p className={`${labelStyle} mb-3`}>Bloc client (auto-rempli depuis l&apos;opportunité)</p>
        <FieldGroup label="Nom entreprise">
          <Input value={data.client_name} onChange={set('client_name')} placeholder="Entreprise Cliente" />
        </FieldGroup>
        <FieldGroup label="Adresse">
          <Input value={data.client_meta} onChange={set('client_meta')} placeholder="15 rue de la Paix, 75001 Paris" />
        </FieldGroup>
        <FieldGroup label="URL site démo">
          <Input value={data.demo_url} onChange={set('demo_url')} placeholder="https://demo.sama.fr/..." />
        </FieldGroup>
        <FieldGroup label="Logo URL">
          <Input
            value={logoUrl || ''}
            onChange={(e) => onMetaChange('entreprise_logo_url', e.target.value)}
            placeholder="https://..."
          />
          {logoUrl && <img src={logoUrl} alt="Logo" className="h-10 w-10 object-contain rounded mt-1 border" />}
        </FieldGroup>
      </div>
    </div>
  );
}
