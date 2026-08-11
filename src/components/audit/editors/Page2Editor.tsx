import React from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Trash2, Sparkles, AlertTriangle } from 'lucide-react';
import type { AuditPage2, AuditProblem } from '@/types';
import {
  AUDIT_ISSUE_CATALOG,
  MIN_AUDIT_ISSUES,
  MAX_AUDIT_ISSUES,
  CARTES_RETENUES,
  PILIERS,
  type AuditPilier,
} from '@/data/auditIssues';
import { FieldGroup, labelStyle } from './shared';

/** Du plus objectif au plus commercial : c'est l'ordre de lecture de l'audit. */
const ORDRE_PILIERS: AuditPilier[] = ['technique', 'contenu', 'popularite'];

interface Props {
  data: AuditPage2;
  onChange: (d: AuditPage2) => void;
  /** Clés des problèmes du catalogue actuellement cochés. */
  selectedIssueKeys?: string[];
  /** Cocher / décocher un problème du catalogue (met aussi à jour la page 3). */
  onToggleIssue?: (key: string) => void;
  /** L'enrichissement a-t-il détecté des problèmes à pré-cocher ? */
  hasDetectedIssues?: boolean;
  /** Appliquer la pré-détection (remplace les cases cochées). */
  onApplyDetected?: () => void;
}

export function Page2Editor({
  data,
  onChange,
  selectedIssueKeys = [],
  onToggleIssue,
  hasDetectedIssues = false,
  onApplyDetected,
}: Props) {
  const selected = new Set(selectedIssueKeys);

  const setProb = (i: number, k: keyof AuditProblem, v: string) => {
    const problems = data.problems.map((p, idx) => idx === i ? { ...p, [k]: v } : p);
    onChange({ ...data, problems });
  };
  const addProb = () => {
    if (data.problems.length >= MAX_AUDIT_ISSUES) return;
    onChange({ ...data, problems: [...data.problems, { title: '', desc: '' }] });
  };
  const removeProb = (i: number) => {
    const prob = data.problems[i];
    // Carte issue du catalogue → on passe par le toggle pour retirer aussi la solution pairée.
    if (prob?.key && onToggleIssue) { onToggleIssue(prob.key); return; }
    onChange({ ...data, problems: data.problems.filter((_, idx) => idx !== i) });
  };

  const selectedCount = selected.size;

  return (
    <div className="space-y-1">
      {/* ── Catalogue des problèmes courants (cases à cocher) ────────── */}
      {onToggleIssue && (
        <div className="border border-border rounded-md p-3 mb-4 bg-muted/30">
          <div className="flex items-center justify-between mb-1">
            <p className={labelStyle}>Problèmes du site — cochez ceux qui s'appliquent</p>
            {hasDetectedIssues && onApplyDetected && (
              <Button size="sm" variant="ghost" onClick={onApplyDetected} className="h-6 text-xs px-2" title="Pré-cocher les problèmes détectés automatiquement">
                <Sparkles className="h-3 w-3 mr-1" /> Détectés
              </Button>
            )}
          </div>
          <p className={`text-xs mb-1 flex items-center gap-1 ${selectedCount < MIN_AUDIT_ISSUES ? 'text-amber-600' : 'text-muted-foreground'}`}>
            {selectedCount < MIN_AUDIT_ISSUES && <AlertTriangle className="h-3 w-3" />}
            {selectedCount} coché{selectedCount > 1 ? 's' : ''} · au moins {MIN_AUDIT_ISSUES} recommandés
          </p>
          {/* Les cases ne dessinent plus rien sur l'A4, mais elles commandent
              toujours les offres proposées page « Investissement » : le dire ici
              évite de les croire décoratives et de les décocher pour faire propre. */}
          <p className="text-[11px] text-muted-foreground mb-3 leading-snug">
            Décide des offres proposées sur la page « Investissement », et de ce que la préparation
            écrit dans l&apos;avant/après.
          </p>
          {/* Groupé par pilier : à plat, deux douzaines de cases ne se lisent
              plus. Le pilier dit aussi de quoi on parle au prospect — la
              technique, le discours, ou la réputation. */}
          <div className="space-y-3">
            {ORDRE_PILIERS.map(pilier => {
              const constats = AUDIT_ISSUE_CATALOG.filter(i => i.pilier === pilier);
              if (constats.length === 0) return null;
              const coches = constats.filter(i => selected.has(i.key)).length;

              return (
                <div key={pilier}>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1.5">
                    {PILIERS[pilier].titre}
                    {coches > 0 && <span className="ml-1 text-foreground">· {coches}</span>}
                  </p>
                  <div className="space-y-2 pl-0.5">
                    {constats.map(issue => (
                      <label key={issue.key} className="flex items-start gap-2 cursor-pointer text-sm">
                        <Checkbox
                          checked={selected.has(issue.key)}
                          onCheckedChange={() => onToggleIssue(issue.key)}
                          className="mt-0.5"
                        />
                        <span className="leading-tight">{issue.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="border-b border-border pb-4 mb-4">
        <p className={`${labelStyle} mb-3`}>Titres de section</p>
        <FieldGroup label="Label (petites caps)">
          <Input value={data.section_label || ''} onChange={e => onChange({ ...data, section_label: e.target.value })} placeholder="01 · Contexte" />
        </FieldGroup>
        <FieldGroup label="Titre principal">
          <Input value={data.section_title || ''} onChange={e => onChange({ ...data, section_title: e.target.value })} placeholder="Ce que nous avons" />
        </FieldGroup>
        <FieldGroup label="Titre — partie italique (bleue)">
          <Input value={data.section_title_em || ''} onChange={e => onChange({ ...data, section_title_em: e.target.value })} placeholder="observé" />
        </FieldGroup>
      </div>

      <FieldGroup label="Intro de section">
        <Textarea value={data.section_intro} onChange={e => onChange({ ...data, section_intro: e.target.value })} rows={3} />
      </FieldGroup>

      <div className="border-t border-border pt-4 mt-4">
        <p className="text-[11px] text-muted-foreground leading-snug">
          Ce qui suit ne sort <span className="font-medium text-foreground">que sur le rapport mobile</span>
          {' '}(le lien public). Sur le document A4, cette demi-page affiche le relevé mesuré — la note,
          les axes, la méthode — que personne ne peut retoucher à la main.
        </p>
      </div>

      <div className="flex items-center justify-between mt-4 mb-2">
        <p className={labelStyle}>
          Cartes affichées ({data.problems.length}/{MAX_AUDIT_ISSUES})
          {data.problems.length > CARTES_RETENUES && data.problems.length < MAX_AUDIT_ISSUES && (
            <span className="ml-1 font-normal text-amber-600">· trou dans la grille</span>
          )}
        </p>
        {data.problems.length < MAX_AUDIT_ISSUES && (
          <Button size="sm" variant="outline" onClick={addProb} className="h-6 text-xs px-2">
            <Plus className="h-3 w-3 mr-1" /> Carte libre
          </Button>
        )}
      </div>
      {data.problems.map((p, i) => (
        <div key={i} className="border border-border rounded-md p-3 mb-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">
              Carte {i + 1}{p.key ? '' : ' · libre'}
            </span>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeProb(i)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
          <FieldGroup label="Titre">
            <Input value={p.title} onChange={e => setProb(i, 'title', e.target.value)} />
          </FieldGroup>
          <FieldGroup label="Description">
            <Textarea value={p.desc} onChange={e => setProb(i, 'desc', e.target.value)} rows={2} />
          </FieldGroup>
        </div>
      ))}

      <div className="border-t border-border pt-4">
        <FieldGroup label="Citation">
          <Textarea value={data.quote} onChange={e => onChange({ ...data, quote: e.target.value })} rows={2} />
        </FieldGroup>
        <FieldGroup label="Source">
          <Input value={data.quote_source} onChange={e => onChange({ ...data, quote_source: e.target.value })} />
        </FieldGroup>
      </div>
    </div>
  );
}
