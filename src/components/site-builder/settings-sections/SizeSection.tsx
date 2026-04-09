"use client";

import React from "react";
import type { UnitOption } from "./shared";
import { UNIT_OPTIONS, splitCssValue } from "./shared";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Ruler } from "lucide-react";

const UnitValueInput = ({
  id, label, value, onChange, defaultUnit = "px",
}: {
  id: string; label: string; value?: string | number;
  onChange: (e: { target: { id: string; value: string } }) => void;
  defaultUnit?: UnitOption;
}) => {
  const parsed = React.useMemo(() => splitCssValue(value, defaultUnit), [value, defaultUnit]);
  const [unit, setUnit] = React.useState<UnitOption>(parsed.unit);
  const [rawValue, setRawValue] = React.useState(parsed.value);

  React.useEffect(() => { setUnit(parsed.unit); setRawValue(parsed.value); }, [parsed.unit, parsed.value]);

  const commit = (nextValue: string, nextUnit: UnitOption) => {
    if (nextValue === "" && nextUnit !== "auto") { onChange({ target: { id, value: "" } }); return; }
    onChange({ target: { id, value: nextUnit === "auto" ? "auto" : `${nextValue}${nextUnit}` } });
  };

  return (
    <div className="flex flex-col gap-1">
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      <div className="flex gap-1">
        <Input id={id} value={rawValue} placeholder={defaultUnit} className="h-7 text-xs px-2"
          onChange={(e) => {
            const nextRaw = e.target.value.replace(/[a-zA-Z%]+$/g, "");
            const typedUnit = e.target.value.match(/[a-zA-Z%]+$/)?.[0] as UnitOption | undefined;
            const nextUnit = typedUnit && UNIT_OPTIONS.includes(typedUnit) ? typedUnit : unit;
            setRawValue(nextRaw); setUnit(nextUnit); commit(nextRaw, nextUnit);
          }}
          disabled={unit === "auto"}
        />
        <Select value={unit} onValueChange={(u) => { const next = u as UnitOption; setUnit(next); commit(rawValue, next); }}>
          <SelectTrigger className="w-[60px] h-7 text-[10px] shrink-0 px-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            {UNIT_OPTIONS.map((opt) => <SelectItem key={`${id}-${opt}`} value={opt} className="text-xs">{opt}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};

/** Visual box model: Margin or Padding 4-side inputs */
const BoxModelInputs = ({
  label, prefix, styles, onChange,
}: {
  label: string;
  prefix: "margin" | "padding";
  styles: React.CSSProperties;
  onChange: (e: { target: { id: string; value: string } }) => void;
}) => {
  const top    = styles[`${prefix}Top`    as keyof typeof styles] as string;
  const right  = styles[`${prefix}Right`  as keyof typeof styles] as string;
  const bottom = styles[`${prefix}Bottom` as keyof typeof styles] as string;
  const left   = styles[`${prefix}Left`   as keyof typeof styles] as string;

  return (
    <div className="flex flex-col gap-2">
      <Label className="text-xs font-medium">{label}</Label>
      {/* Visual box model layout */}
      <div className="relative border border-dashed border-muted-foreground/30 rounded-md p-3">
        <span className="absolute top-1 left-2 text-[9px] text-muted-foreground/50 uppercase">{label}</span>
        {/* Top */}
        <div className="flex justify-center mb-1">
          <div className="w-20"><UnitValueInput id={`${prefix}Top`} label="↑" value={top} onChange={onChange} defaultUnit="px" /></div>
        </div>
        {/* Left + inner box indicator + Right */}
        <div className="flex items-center gap-1">
          <div className="w-20"><UnitValueInput id={`${prefix}Left`} label="←" value={left} onChange={onChange} defaultUnit="px" /></div>
          <div className="flex-1 h-8 border border-dashed border-muted-foreground/20 rounded flex items-center justify-center">
            <span className="text-[9px] text-muted-foreground/30">{prefix === "margin" ? "m" : "p"}</span>
          </div>
          <div className="w-20"><UnitValueInput id={`${prefix}Right`} label="→" value={right} onChange={onChange} defaultUnit="px" /></div>
        </div>
        {/* Bottom */}
        <div className="flex justify-center mt-1">
          <div className="w-20"><UnitValueInput id={`${prefix}Bottom`} label="↓" value={bottom} onChange={onChange} defaultUnit="px" /></div>
        </div>
      </div>
    </div>
  );
};

interface SizeSectionProps {
  styles: React.CSSProperties;
  onChange: (e: { target: { id: string; value: string } }) => void;
}

const SizeSection: React.FC<SizeSectionProps> = ({ styles, onChange }) => {
  const [showConstraints, setShowConstraints] = React.useState(false);

  return (
    <AccordionItem value="Size" className="px-4 py-0 border-b-0">
      <AccordionTrigger className="!no-underline py-3">
        <span className="flex items-center gap-2 text-xs font-medium">
          <Ruler className="h-3.5 w-3.5 text-muted-foreground" />
          Taille
        </span>
      </AccordionTrigger>
      <AccordionContent className="flex flex-col gap-4 pb-4">
        {/* Width + Height */}
        <div className="grid grid-cols-2 gap-2">
          <UnitValueInput id="width"  label="Largeur"  value={styles.width}  onChange={onChange} defaultUnit="px" />
          <UnitValueInput id="height" label="Hauteur" value={styles.height} onChange={onChange} defaultUnit="px" />
        </div>

        {/* Constraints toggle */}
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground text-left flex items-center gap-1"
          onClick={() => setShowConstraints((p) => !p)}
        >
          <span>{showConstraints ? "▾" : "▸"}</span> Contraintes min/max
        </button>

        {showConstraints && (
          <div className="grid grid-cols-2 gap-2">
            <UnitValueInput id="minWidth"  label="Min largeur"  value={styles.minWidth}  onChange={onChange} defaultUnit="px" />
            <UnitValueInput id="maxWidth"  label="Max largeur"  value={styles.maxWidth}  onChange={onChange} defaultUnit="px" />
            <UnitValueInput id="minHeight" label="Min hauteur" value={styles.minHeight} onChange={onChange} defaultUnit="px" />
            <UnitValueInput id="maxHeight" label="Max hauteur" value={styles.maxHeight} onChange={onChange} defaultUnit="px" />
          </div>
        )}

        {/* Margin box model */}
        <BoxModelInputs label="Marges" prefix="margin" styles={styles} onChange={onChange} />

        {/* Padding box model */}
        <BoxModelInputs label="Rembourrage" prefix="padding" styles={styles} onChange={onChange} />
      </AccordionContent>
    </AccordionItem>
  );
};

export default SizeSection;
