"use client";

import React from "react";
import type { UnitOption } from "./shared";
import { UNIT_OPTIONS, splitCssValue } from "./shared";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Move } from "lucide-react";

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
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-1">
        <Input id={id} value={rawValue} placeholder={defaultUnit} className="h-8 text-xs"
          onChange={(e) => {
            const nextRaw = e.target.value.replace(/[a-zA-Z%]+$/g, "");
            const typedUnit = e.target.value.match(/[a-zA-Z%]+$/)?.[0] as UnitOption | undefined;
            const nextUnit = typedUnit && UNIT_OPTIONS.includes(typedUnit) ? typedUnit : unit;
            setRawValue(nextRaw); setUnit(nextUnit); commit(nextRaw, nextUnit);
          }}
          disabled={unit === "auto"}
        />
        <Select value={unit} onValueChange={(u) => { const next = u as UnitOption; setUnit(next); commit(rawValue, next); }}>
          <SelectTrigger className="w-[72px] h-8 text-xs shrink-0"><SelectValue /></SelectTrigger>
          <SelectContent>
            {UNIT_OPTIONS.map((opt) => <SelectItem key={`${id}-${opt}`} value={opt} className="text-xs">{opt}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};

interface PositionSectionProps {
  styles: React.CSSProperties;
  onChange: (e: { target: { id: string; value: string } }) => void;
}

const PositionSection: React.FC<PositionSectionProps> = ({ styles, onChange }) => {
  const positionType = (styles.position as string) || "static";
  const showOffsets = positionType === "absolute" || positionType === "fixed" || positionType === "relative" || positionType === "sticky";

  return (
    <AccordionItem value="Position" className="px-4 py-0">
      <AccordionTrigger className="!no-underline py-3">
        <span className="flex items-center gap-2 text-xs font-medium">
          <Move className="h-3.5 w-3.5 text-muted-foreground" />
          Position
        </span>
      </AccordionTrigger>
      <AccordionContent className="flex flex-col gap-3 pb-4">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Type</Label>
          <Select value={positionType} onValueChange={(v) => onChange({ target: { id: "position", value: v } })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="static"   className="text-xs">Static</SelectItem>
              <SelectItem value="relative" className="text-xs">Relative</SelectItem>
              <SelectItem value="absolute" className="text-xs">Absolute</SelectItem>
              <SelectItem value="fixed"    className="text-xs">Fixed</SelectItem>
              <SelectItem value="sticky"   className="text-xs">Sticky</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {showOffsets && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <UnitValueInput id="top"    label="Haut"   value={styles.top}   onChange={onChange} defaultUnit="px" />
              <UnitValueInput id="right"  label="Droite" value={styles.right} onChange={onChange} defaultUnit="px" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <UnitValueInput id="bottom" label="Bas"    value={styles.bottom} onChange={onChange} defaultUnit="px" />
              <UnitValueInput id="left"   label="Gauche" value={styles.left}   onChange={onChange} defaultUnit="px" />
            </div>
          </>
        )}
      </AccordionContent>
    </AccordionItem>
  );
};

export default PositionSection;
