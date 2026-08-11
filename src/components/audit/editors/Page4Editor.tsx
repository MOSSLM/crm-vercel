import React from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Plus, Trash2 } from 'lucide-react';
import type { AuditPage4, AuditLivrable } from '@/types';
import { FieldGroup, labelStyle } from './shared';

/**
 * La demi-page « Ce qui change » : un tableau à trois colonnes.
 *
 * DEUX DES TROIS COLONNES N'ÉTAIENT PAS ÉDITABLES. Le rendu affiche « le volet »,
 * « ce que vous recevez » et « ce que ça corrige » ; l'éditeur ne proposait que
 * le titre et les éléments. La troisième colonne — celle qui rattache chaque
 * volet au constat qu'il répare, et la seule chose qui distingue ce bloc d'une
 * plaquette — se remplissait toute seule et ne se corrigeait jamais.
 */

const ENTETES_PAR_DEFAUT = ['Le volet', 'Ce que vous recevez', 'Ce que ça corrige'];

interface Props {
  data: AuditPage4;
  onChange: (d: AuditPage4) => void;
}

export function Page4Editor({ data, onChange }: Props) {
  const entetes = data.recu_head ?? ENTETES_PAR_DEFAUT;

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
  const setEntete = (i: number, v: string) =>
    onChange({ ...data, recu_head: entetes.map((h, idx) => idx === i ? v : h) });

  return (
    <div className="space-y-1">
      <div className="border-b border-border pb-4 mb-4">
        <p className={`${labelStyle} mb-3`}>Titres de section</p>
        <FieldGroup label="Label (petites caps)">
          <Input value={data.section_label || ''} onChange={e => onChange({ ...data, section_label: e.target.value })} placeholder="03 · Ce que vous recevez" />
        </FieldGroup>
        <FieldGroup label="Titre principal">
          <Input value={data.section_title || ''} onChange={e => onChange({ ...data, section_title: e.target.value })} placeholder="Ce qui change," />
        </FieldGroup>
        <FieldGroup label="Titre — partie italique (bleue)">
          <Input value={data.section_title_em || ''} onChange={e => onChange({ ...data, section_title_em: e.target.value })} placeholder="concrètement" />
        </FieldGroup>
        <FieldGroup label="Sous-titre">
          <Textarea value={data.section_subtitle || ''} onChange={e => onChange({ ...data, section_subtitle: e.target.value })} rows={2} placeholder="Trois volets — et à chaque fois, le point faible qu'il corrige." />
        </FieldGroup>
      </div>

      <div className="border-b border-border pb-4 mb-4">
        <p className={`${labelStyle} mb-2`}>En-têtes du tableau</p>
        <div className="grid grid-cols-3 gap-2">
          {entetes.map((h, i) => (
            <Input key={i} value={h} onChange={e => setEntete(i, e.target.value)} className="h-7 text-xs" placeholder={ENTETES_PAR_DEFAUT[i]} />
          ))}
        </div>
      </div>

      <p className={`${labelStyle} mb-2`}>Volets ({data.livrables.length})</p>
      {data.livrables.map((liv, i) => (
        <div key={i} className="border border-border rounded-md p-3 mb-4">
          <FieldGroup label={`${entetes[0] || 'Volet'} ${i + 1}`}>
            <Input value={liv.title} onChange={e => setLiv(i, 'title', e.target.value)} placeholder="Le site" />
          </FieldGroup>

          <p className={labelStyle}>{entetes[1] || 'Ce que vous recevez'}</p>
          {liv.items.map((item, j) => (
            <div key={j} className="flex items-center gap-1 mb-1">
              <Textarea value={item} onChange={e => setItem(i, j, e.target.value)} className="flex-1 text-xs min-h-[3.5rem]" rows={3} />
              <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => removeItem(i, j)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => addItem(i)} className="mt-1 mb-3 h-7 text-xs">
            <Plus className="h-3 w-3 mr-1" /> Ajouter
          </Button>

          <FieldGroup label={`${entetes[2] || 'Ce que ça corrige'} — une raison par ligne`}>
            <Textarea
              value={liv.fix || ''}
              onChange={e => setLiv(i, 'fix', e.target.value)}
              rows={3}
              placeholder={'Lenteur\nCrédibilité\nBase technique'}
            />
          </FieldGroup>
        </div>
      ))}
    </div>
  );
}
