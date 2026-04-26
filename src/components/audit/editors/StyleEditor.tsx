import React from 'react';
import { Input } from '@/components/ui/input';
import type { AuditGlobalStyle } from '@/types';
import { FieldGroup, labelStyle } from './shared';

interface Props {
  gs: AuditGlobalStyle;
  onChange: (patch: Partial<AuditGlobalStyle>) => void;
}

function NumericInput({ value, defaultVal, min, max, step, onChange }: {
  value: number | undefined;
  defaultVal: number;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value ?? defaultVal}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="flex-1 h-2 accent-primary"
      />
      <span className="text-xs text-muted-foreground w-10 text-right tabular-nums">
        {(value ?? defaultVal).toLocaleString('fr-FR', { maximumFractionDigits: 3 })}
      </span>
    </div>
  );
}

export function StyleEditor({ gs, onChange }: Props) {
  return (
    <div className="space-y-1">
      {/* Grain */}
      <div className="border-b border-border pb-4 mb-4">
        <p className={`${labelStyle} mb-3`}>Grain / texture</p>

        <FieldGroup label="Opacité du grain">
          <NumericInput
            value={gs.grain_opacity}
            defaultVal={0.045}
            min={0}
            max={0.3}
            step={0.005}
            onChange={v => onChange({ grain_opacity: v })}
          />
        </FieldGroup>

        <FieldGroup label="Granulométrie (0.1 = grossier, 2.0 = fin)">
          <NumericInput
            value={gs.grain_base_frequency}
            defaultVal={0.75}
            min={0.1}
            max={2.0}
            step={0.05}
            onChange={v => onChange({ grain_base_frequency: v })}
          />
        </FieldGroup>

        <FieldGroup label="Couleur du grain">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={gs.grain_color ?? '#ffffff'}
              onChange={e => onChange({ grain_color: e.target.value })}
              className="w-8 h-8 rounded cursor-pointer border border-input p-0.5"
            />
            <Input
              value={gs.grain_color ?? '#ffffff'}
              onChange={e => onChange({ grain_color: e.target.value })}
              placeholder="#ffffff"
              className="flex-1"
            />
          </div>
        </FieldGroup>
      </div>

      {/* Typography */}
      <div>
        <p className={`${labelStyle} mb-3`}>Tailles de police</p>

        <FieldGroup label="Titre couverture (défaut : 56px)">
          <NumericInput
            value={gs.font_cover_title}
            defaultVal={56}
            min={28}
            max={80}
            step={1}
            onChange={v => onChange({ font_cover_title: v })}
          />
        </FieldGroup>

        <FieldGroup label="Titre de section / pages intérieures (défaut : 38px)">
          <NumericInput
            value={gs.font_section_title}
            defaultVal={38}
            min={20}
            max={60}
            step={1}
            onChange={v => onChange({ font_section_title: v })}
          />
        </FieldGroup>

        <FieldGroup label="Texte d'intro / sous-titre (défaut : 14px)">
          <NumericInput
            value={gs.font_section_intro}
            defaultVal={14}
            min={9}
            max={22}
            step={1}
            onChange={v => onChange({ font_section_intro: v })}
          />
        </FieldGroup>

        <div className="mt-3 text-[10px] text-muted-foreground leading-relaxed">
          Les valeurs s&apos;appliquent à l&apos;aperçu et à l&apos;export PDF. Laissez vides pour utiliser les valeurs par défaut.
        </div>
      </div>
    </div>
  );
}
