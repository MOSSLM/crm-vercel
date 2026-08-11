import React from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import type { AuditPage3, AuditSolution, AuditAvantApres } from '@/types';
import { MAX_LIGNES_AVANT_APRES } from '@/utils/audit/htmlCompact';
import { FieldGroup, labelStyle } from './shared';

/**
 * La demi-page « Constat → après », et le reste qui part sur le rapport mobile.
 *
 * LE TABLEAU AVANT/APRÈS N'AVAIT AUCUN ÉDITEUR. Il occupe pourtant une demi-page
 * entière du document A4 : c'est le bloc qui vend. Il était rempli une fois par
 * la préparation automatique, et plus personne ne pouvait y toucher — cliquer
 * dessus dans l'aperçu n'ouvrait rien. Un bloc qu'on ne peut pas corriger devant
 * un prospect est un bloc qu'on finit par ne plus regarder.
 *
 * Les « solutions » ci-dessous, elles, ne sortent QUE sur le rapport mobile
 * (le lien public). Elles restent modifiables, mais l'onglet le dit : chercher
 * dans l'A4 un bloc qui n'y est pas coûte plus cher que de le lire ici.
 */

interface Props {
  data: AuditPage3;
  onChange: (d: AuditPage3) => void;
}

export function Page3Editor({ data, onChange }: Props) {
  const lignes = data.avant_apres ?? [];

  const setSol = (i: number, k: keyof AuditSolution, v: string) => {
    const solutions = data.solutions.map((s, idx) => idx === i ? { ...s, [k]: v } : s);
    onChange({ ...data, solutions });
  };
  const addSol = () => onChange({ ...data, solutions: [...data.solutions, { num: String(data.solutions.length + 1), name: '', desc: '', tag: '' }] });
  const removeSol = (i: number) => onChange({ ...data, solutions: data.solutions.filter((_, idx) => idx !== i) });

  const setLigne = (i: number, k: keyof AuditAvantApres, v: string) => {
    onChange({ ...data, avant_apres: lignes.map((l, idx) => idx === i ? { ...l, [k]: v } : l) });
  };
  const addLigne = () =>
    onChange({ ...data, avant_apres: [...lignes, { cle: `libre-${lignes.length + 1}`, avant: '', apres: '' }] });
  const removeLigne = (i: number) =>
    onChange({ ...data, avant_apres: lignes.filter((_, idx) => idx !== i) });
  /** Seules les premières lignes comparables sont détaillées : l'ordre décide. */
  const deplacer = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= lignes.length) return;
    const copie = [...lignes];
    [copie[i], copie[j]] = [copie[j], copie[i]];
    onChange({ ...data, avant_apres: copie });
  };

  /**
   * Ce que le document fera de cette ligne, dit avant l'envoi et non après.
   *
   * La règle du rendu : les deux côtés doivent porter la même unité, sinon la
   * ligne n'est pas mise en regard — et au-delà de trois lignes détaillées, la
   * demi-page déborde. Les lignes écartées ne sont pas perdues, elles sont
   * comptées dans le bandeau « +N constats de plus ».
   */
  const sortDe = (i: number): { detaillee: boolean; motif: string } => {
    const l = lignes[i];
    if (!l.apres || !l.apres.trim()) return { detaillee: false, motif: 'Comptée · pas d’après à mettre en regard' };
    const rang = lignes.filter((x, idx) => idx < i && x.apres && x.apres.trim()).length;
    return rang < MAX_LIGNES_AVANT_APRES
      ? { detaillee: true, motif: 'Détaillée dans le document' }
      : { detaillee: false, motif: `Comptée · au-delà de ${MAX_LIGNES_AVANT_APRES} lignes` };
  };

  return (
    <div className="space-y-1">
      <div className="border-b border-border pb-4 mb-4">
        <p className={`${labelStyle} mb-3`}>Titres de section</p>
        <FieldGroup label="Label (petites caps)">
          <Input value={data.section_label || ''} onChange={e => onChange({ ...data, section_label: e.target.value })} placeholder="02 · Ce que l'on fait" />
        </FieldGroup>
        <FieldGroup label="Titre principal">
          <Input value={data.section_title || ''} onChange={e => onChange({ ...data, section_title: e.target.value })} placeholder="Un site conçu pour" />
        </FieldGroup>
        <FieldGroup label="Titre — partie italique (bleue)">
          <Input value={data.section_title_em || ''} onChange={e => onChange({ ...data, section_title_em: e.target.value })} placeholder="convertir" />
        </FieldGroup>
        <FieldGroup label="Intro de section">
          <Textarea value={data.section_intro} onChange={e => onChange({ ...data, section_intro: e.target.value })} rows={2} />
        </FieldGroup>
      </div>

      {/* ── Le tableau avant / après : la demi-page 02 du document A4 ────── */}
      <div className="flex items-center justify-between mb-1">
        <p className={labelStyle}>Avant / après ({lignes.length})</p>
        <Button size="sm" variant="outline" onClick={addLigne} className="h-6 text-xs px-2">
          <Plus className="h-3 w-3 mr-1" /> Ligne
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3 leading-snug">
        Les deux colonnes doivent porter <span className="font-medium text-foreground">la même unité</span> —
        « 9,8 s » face à « 1,2 s », « 9 champs » face à « 3 champs ». Une ligne dont l&apos;après change de
        sujet n&apos;est pas mise en regard : elle rejoint le décompte « +N constats de plus ».
        Les {MAX_LIGNES_AVANT_APRES} premières lignes comparables sont détaillées, dans cet ordre.
      </p>

      {lignes.length === 0 && (
        <p className="text-xs text-muted-foreground italic mb-3">
          Aucune ligne — la demi-page n&apos;affichera que son titre. La préparation de l&apos;audit les
          remplit normalement toute seule.
        </p>
      )}

      {lignes.map((l, i) => {
        const sort = sortDe(i);
        return (
          <div key={i} className="border border-border rounded-md p-3 mb-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-medium uppercase tracking-wide ${sort.detaillee ? 'text-foreground' : 'text-muted-foreground'}`}>
                {sort.motif}
              </span>
              <div className="flex items-center gap-0.5">
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => deplacer(i, -1)} disabled={i === 0} title="Monter">
                  <ArrowUp className="h-3 w-3" />
                </Button>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => deplacer(i, 1)} disabled={i === lignes.length - 1} title="Descendre">
                  <ArrowDown className="h-3 w-3" />
                </Button>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeLigne(i)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <FieldGroup label="Avant — la valeur">
                <Input value={l.avant} onChange={e => setLigne(i, 'avant', e.target.value)} placeholder="9,8 s d'attente" />
              </FieldGroup>
              <FieldGroup label="Après — même unité">
                <Input value={l.apres || ''} onChange={e => setLigne(i, 'apres', e.target.value)} placeholder="1,2 s" />
              </FieldGroup>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <FieldGroup label="Précision (sous l'avant)">
                <Input value={l.precision || ''} onChange={e => setLigne(i, 'precision', e.target.value)} placeholder="sur téléphone, réseau mobile" />
              </FieldGroup>
              <FieldGroup label="Réponse (sous l'après)">
                <Input value={l.reponse || ''} onChange={e => setLigne(i, 'reponse', e.target.value)} placeholder="Site reconstruit, images compressées." />
              </FieldGroup>
            </div>
          </div>
        );
      })}

      {/* ── Les solutions : rapport mobile uniquement ────────────────────── */}
      <div className="border-t border-border pt-4 mt-4">
        <p className={`${labelStyle} mb-1`}>Solutions / conseils</p>
        <p className="text-[11px] text-muted-foreground mb-3">
          N&apos;apparaissent que sur le rapport mobile (le lien public), pas sur le document A4.
        </p>
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
    </div>
  );
}
