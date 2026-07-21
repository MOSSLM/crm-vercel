import React from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Plus, Trash2 } from 'lucide-react';
import type { AuditPage5, AuditPricingService, AuditAdditionalService, AuditSecondaryCard } from '@/types';
import { getServices, calcTotal, fmtEur } from '@/components/audit/AuditShared';
import { FieldGroup, labelStyle } from './shared';

interface Props {
  data: AuditPage5;
  onChange: (d: AuditPage5) => void;
}

export function Page5Editor({ data, onChange }: Props) {
  const services = getServices(data);
  const { total, hasMrr } = calcTotal(services);
  const addlServices = data.additional_services || [];

  const setSvc = (i: number, patch: Partial<AuditPricingService>) => {
    const updated = services.map((s, idx) => idx === i ? { ...s, ...patch } : s);
    onChange({ ...data, services: updated });
  };
  const addSvc = () => onChange({ ...data, services: [...services, { label: '', sub_label: '', amount: 0, is_mrr: false, enabled: true }] });
  const removeSvc = (i: number) => onChange({ ...data, services: services.filter((_, idx) => idx !== i) });

  const setAddl = (i: number, patch: Partial<AuditAdditionalService>) => {
    const updated = addlServices.map((s, idx) => idx === i ? { ...s, ...patch } : s);
    onChange({ ...data, additional_services: updated });
  };
  const addAddl = () => onChange({ ...data, additional_services: [...addlServices, { label: '', description: '', amount: 0, is_mrr: false, badge: '' }] });
  const removeAddl = (i: number) => onChange({ ...data, additional_services: addlServices.filter((_, idx) => idx !== i) });

  const setSecondary = (patch: Partial<AuditSecondaryCard>) => {
    const base: AuditSecondaryCard = data.secondary_card ?? { title: '', amount: 0 };
    onChange({ ...data, secondary_card: { ...base, ...patch } });
  };

  return (
    <div className="space-y-1">
      {/* Section headers */}
      <div className="border-b border-border pb-4 mb-4">
        <p className={`${labelStyle} mb-3`}>Titres de section</p>
        <FieldGroup label="Titre barre (dark header)">
          <Input value={data.header_section || ''} onChange={e => onChange({ ...data, header_section: e.target.value })} placeholder="Tarifs" />
        </FieldGroup>
        <FieldGroup label="Label (petites caps)">
          <Input value={data.section_label || ''} onChange={e => onChange({ ...data, section_label: e.target.value })} placeholder="04 · Investissement" />
        </FieldGroup>
      </div>

      {/* Main pricing card */}
      <div className="border-b border-border pb-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <p className={labelStyle}>Carte principale (solution conseillée)</p>
          <Button size="sm" variant="outline" onClick={addSvc} className="h-6 text-xs px-2">
            <Plus className="h-3 w-3 mr-1" /> Ajouter
          </Button>
        </div>

        <FieldGroup label="Sous-titre carte (ex : Solution conseillée)">
          <Input value={data.pricing_subtitle || ''} onChange={e => onChange({ ...data, pricing_subtitle: e.target.value })} placeholder="Solution conseillée" />
        </FieldGroup>

        {services.map((svc, i) => (
          <div key={i} className="border border-border rounded-md p-3 mb-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Service {i + 1}</span>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                  <input type="checkbox" checked={svc.is_mrr} onChange={e => setSvc(i, { is_mrr: e.target.checked })} className="w-3 h-3" />
                  /mois
                </label>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                  <input type="checkbox" checked={!!svc.from} onChange={e => setSvc(i, { from: e.target.checked })} className="w-3 h-3" />
                  À partir de
                </label>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                  <input type="checkbox" checked={svc.enabled} onChange={e => setSvc(i, { enabled: e.target.checked })} className="w-3 h-3" />
                  Actif
                </label>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeSvc(i)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <FieldGroup label="Label">
              <Input value={svc.label} onChange={e => setSvc(i, { label: e.target.value })} />
            </FieldGroup>
            <FieldGroup label="Sous-label">
              <Input value={svc.sub_label || ''} onChange={e => setSvc(i, { sub_label: e.target.value })} placeholder="Description courte..." />
            </FieldGroup>
            <FieldGroup label="Montant (€)">
              <div className="relative">
                <Input
                  type="number"
                  value={svc.amount || ''}
                  onChange={e => setSvc(i, { amount: parseFloat(e.target.value) || 0 })}
                  className="pr-8"
                  placeholder="0"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€{svc.is_mrr ? '/mois' : ''}</span>
              </div>
            </FieldGroup>
          </div>
        ))}

        <div className="bg-muted/40 rounded-md p-3 mb-3 text-xs text-muted-foreground">
          Total — {hasMrr ? 'an 1' : 'one-shot'} : <span className="font-semibold text-foreground">{fmtEur(total)}</span>
          {data.hide_total && <span className="ml-1 italic">(masqué)</span>}
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer mb-3">
          <input type="checkbox" checked={data.hide_total === true} onChange={e => onChange({ ...data, hide_total: e.target.checked })} className="w-3.5 h-3.5" />
          Masquer la ligne « Investissement total »
        </label>

        <FieldGroup label="Note tarifaire">
          <Textarea value={data.price_note} onChange={e => onChange({ ...data, price_note: e.target.value })} rows={3} />
        </FieldGroup>

        <div className="pt-2 flex flex-col gap-2">
          <p className={`${labelStyle} mb-1`}>Options visuelles</p>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={data.show_grain !== false} onChange={e => onChange({ ...data, show_grain: e.target.checked })} className="w-3.5 h-3.5" />
            Grain / texture sur la carte
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={data.flatten_grain_for_pdf === true} onChange={e => onChange({ ...data, flatten_grain_for_pdf: e.target.checked })} className="w-3.5 h-3.5" />
            Supprimer le grain à l&apos;export PDF
          </label>
        </div>
      </div>

      {/* Secondary card — alternative offer (custom site) */}
      <div className="border-b border-border pb-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <p className={labelStyle}>Carte secondaire (site sur mesure)</p>
          {data.secondary_card ? (
            <Button size="sm" variant="ghost" onClick={() => onChange({ ...data, secondary_card: undefined })} className="h-6 text-xs px-2">
              <Trash2 className="h-3 w-3 mr-1" /> Retirer
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => onChange({ ...data, secondary_card: { title: 'Site sur mesure', subtitle: 'Autre formule', description: '', amount: 1990, from: true } })} className="h-6 text-xs px-2">
              <Plus className="h-3 w-3 mr-1" /> Ajouter
            </Button>
          )}
        </div>

        {data.secondary_card && (
          <div className="space-y-2">
            <FieldGroup label="Sur-titre (petites caps)">
              <Input value={data.secondary_card.subtitle || ''} onChange={e => setSecondary({ subtitle: e.target.value })} placeholder="Autre formule" />
            </FieldGroup>
            <FieldGroup label="Titre">
              <Input value={data.secondary_card.title} onChange={e => setSecondary({ title: e.target.value })} placeholder="Site sur mesure" />
            </FieldGroup>
            <FieldGroup label="Description">
              <Textarea value={data.secondary_card.description || ''} onChange={e => setSecondary({ description: e.target.value })} rows={2} placeholder="Vous choisissez votre direction artistique..." />
            </FieldGroup>
            <FieldGroup label="Montant (€)">
              <div className="relative">
                <Input type="number" value={data.secondary_card.amount || ''} onChange={e => setSecondary({ amount: parseFloat(e.target.value) || 0 })} className="pr-8" placeholder="0" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€</span>
              </div>
            </FieldGroup>
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={!!data.secondary_card.from} onChange={e => setSecondary({ from: e.target.checked })} className="w-3.5 h-3.5" />
              Afficher « À partir de »
            </label>
          </div>
        )}
      </div>

      {/* Additional optional services */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className={labelStyle}>Services additionnels <span className="normal-case text-[10px] font-normal opacity-60">(optionnel)</span></p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Mini-cartes sous la carte principale</p>
          </div>
          <Button size="sm" variant="outline" onClick={addAddl} className="h-6 text-xs px-2">
            <Plus className="h-3 w-3 mr-1" /> Ajouter
          </Button>
        </div>

        {addlServices.length > 0 && (
          <>
            <FieldGroup label="Titre de la section additionnelle">
              <Input value={data.addl_section_title || ''} onChange={e => onChange({ ...data, addl_section_title: e.target.value })} placeholder="Services additionnels" />
            </FieldGroup>
            <FieldGroup label="Sous-titre (optionnel)">
              <Input value={data.addl_section_subtitle || ''} onChange={e => onChange({ ...data, addl_section_subtitle: e.target.value })} placeholder="Pour maximiser votre impact..." />
            </FieldGroup>
          </>
        )}

        {addlServices.map((svc, i) => (
          <div key={i} className="border border-border rounded-md p-3 mb-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Service {i + 1}</span>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                  <input type="checkbox" checked={svc.is_mrr} onChange={e => setAddl(i, { is_mrr: e.target.checked })} className="w-3 h-3" />
                  /mois
                </label>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeAddl(i)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <FieldGroup label="Badge (ex: Recommandé, Impact positif)">
              <Input value={svc.badge || ''} onChange={e => setAddl(i, { badge: e.target.value })} placeholder="Recommandé" />
            </FieldGroup>
            <FieldGroup label="Nom du service">
              <Input value={svc.label} onChange={e => setAddl(i, { label: e.target.value })} />
            </FieldGroup>
            <FieldGroup label="Description">
              <Textarea value={svc.description || ''} onChange={e => setAddl(i, { description: e.target.value })} rows={2} placeholder="Courte description..." />
            </FieldGroup>
            <FieldGroup label="Tarif (€)">
              <div className="relative">
                <Input
                  type="number"
                  value={svc.amount || ''}
                  onChange={e => setAddl(i, { amount: parseFloat(e.target.value) || 0 })}
                  className="pr-8"
                  placeholder="0"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€{svc.is_mrr ? '/mois' : ''}</span>
              </div>
            </FieldGroup>
          </div>
        ))}
      </div>
    </div>
  );
}
