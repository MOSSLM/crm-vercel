"use client";

import React from "react";
import type { UnitOption } from "./shared";
import { UNIT_OPTIONS, splitCssValue } from "./shared";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  LayoutGrid,
  AlignHorizontalJustifyCenterIcon,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignHorizontalSpaceAround,
  AlignHorizontalSpaceBetween,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
} from "lucide-react";

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

interface LayoutSectionProps {
  styles: React.CSSProperties;
  onChange: (e: { target: { id: string; value: string } }) => void;
}

const LayoutSection: React.FC<LayoutSectionProps> = ({ styles, onChange }) => {
  const isFlex = styles.display === "flex" || styles.display === "inline-flex";
  const isGrid = styles.display === "grid";

  return (
    <AccordionItem value="Layout" className="px-4 py-0">
      <AccordionTrigger className="!no-underline py-3">
        <span className="flex items-center gap-2 text-xs font-medium">
          <LayoutGrid className="h-3.5 w-3.5 text-muted-foreground" />
          Mise en page
        </span>
      </AccordionTrigger>
      <AccordionContent className="flex flex-col gap-3 pb-4">
        {/* Display */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Affichage</Label>
          <Select value={styles.display as string} onValueChange={(v) => onChange({ target: { id: "display", value: v } })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Sélectionner" /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel className="text-xs">Mode</SelectLabel>
                <SelectItem value="block" className="text-xs">Block</SelectItem>
                <SelectItem value="flex" className="text-xs">Flex</SelectItem>
                <SelectItem value="inline-flex" className="text-xs">Inline Flex</SelectItem>
                <SelectItem value="grid" className="text-xs">Grid</SelectItem>
                <SelectItem value="inline" className="text-xs">Inline</SelectItem>
                <SelectItem value="inline-block" className="text-xs">Inline Block</SelectItem>
                <SelectItem value="none" className="text-xs">Aucun (caché)</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        {/* Flex controls */}
        {isFlex && (
          <>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Direction</Label>
              <Select value={styles.flexDirection as string} onValueChange={(v) => onChange({ target: { id: "flexDirection", value: v } })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="row" className="text-xs">Ligne →</SelectItem>
                  <SelectItem value="column" className="text-xs">Colonne ↓</SelectItem>
                  <SelectItem value="row-reverse" className="text-xs">Ligne inversée ←</SelectItem>
                  <SelectItem value="column-reverse" className="text-xs">Colonne inversée ↑</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Justifier</Label>
              <ToggleGroup type="single" className="justify-start border rounded-md gap-0"
                value={styles.justifyContent}
                onValueChange={(v) => onChange({ target: { id: "justifyContent", value: v } })}>
                <Tooltip><TooltipTrigger><ToggleGroupItem value="flex-start" className="h-8 px-2"><AlignHorizontalJustifyStart className="w-3.5 h-3.5" /></ToggleGroupItem></TooltipTrigger><TooltipContent side="bottom"><p>Début</p></TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger><ToggleGroupItem value="center" className="h-8 px-2"><AlignHorizontalJustifyCenterIcon className="w-3.5 h-3.5" /></ToggleGroupItem></TooltipTrigger><TooltipContent side="bottom"><p>Centre</p></TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger><ToggleGroupItem value="flex-end" className="h-8 px-2"><AlignHorizontalJustifyEnd className="w-3.5 h-3.5" /></ToggleGroupItem></TooltipTrigger><TooltipContent side="bottom"><p>Fin</p></TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger><ToggleGroupItem value="space-between" className="h-8 px-2"><AlignHorizontalSpaceBetween className="w-3.5 h-3.5" /></ToggleGroupItem></TooltipTrigger><TooltipContent side="bottom"><p>Space Between</p></TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger><ToggleGroupItem value="space-around" className="h-8 px-2"><AlignHorizontalSpaceAround className="w-3.5 h-3.5" /></ToggleGroupItem></TooltipTrigger><TooltipContent side="bottom"><p>Space Around</p></TooltipContent></Tooltip>
              </ToggleGroup>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Aligner</Label>
              <ToggleGroup type="single" className="justify-start border rounded-md gap-0"
                value={styles.alignItems}
                onValueChange={(v) => onChange({ target: { id: "alignItems", value: v } })}>
                <Tooltip><TooltipTrigger><ToggleGroupItem value="flex-start" className="h-8 px-3"><AlignVerticalJustifyStart className="w-3.5 h-3.5" /></ToggleGroupItem></TooltipTrigger><TooltipContent side="bottom"><p>Début</p></TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger><ToggleGroupItem value="center" className="h-8 px-3"><AlignVerticalJustifyCenter className="w-3.5 h-3.5" /></ToggleGroupItem></TooltipTrigger><TooltipContent side="bottom"><p>Centre</p></TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger><ToggleGroupItem value="flex-end" className="h-8 px-3"><AlignVerticalJustifyEnd className="w-3.5 h-3.5" /></ToggleGroupItem></TooltipTrigger><TooltipContent side="bottom"><p>Fin</p></TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger><ToggleGroupItem value="stretch" className="h-8 px-3 text-[10px]">Str</ToggleGroupItem></TooltipTrigger><TooltipContent side="bottom"><p>Stretch</p></TooltipContent></Tooltip>
              </ToggleGroup>
            </div>

            <UnitValueInput id="gap" label="Gap" value={styles.gap} onChange={onChange} defaultUnit="px" />
          </>
        )}

        {/* Grid controls */}
        {isGrid && (
          <>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Colonnes</Label>
              <Input id="gridTemplateColumns" placeholder="repeat(3, 1fr)" className="h-8 text-xs"
                onChange={(e) => onChange({ target: { id: "gridTemplateColumns", value: e.target.value } })}
                value={styles.gridTemplateColumns ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Lignes</Label>
              <Input id="gridTemplateRows" placeholder="auto auto" className="h-8 text-xs"
                onChange={(e) => onChange({ target: { id: "gridTemplateRows", value: e.target.value } })}
                value={styles.gridTemplateRows ?? ""} />
            </div>
            <UnitValueInput id="gap" label="Gap" value={styles.gap} onChange={onChange} defaultUnit="px" />
          </>
        )}

        {/* Z-index */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Z-index</Label>
          <Input id="zIndex" placeholder="0" className="h-8 text-xs"
            onChange={(e) => onChange({ target: { id: "zIndex", value: e.target.value.replace(/[^\d-]/g, "") } })}
            value={styles.zIndex?.toString() ?? ""} />
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};

export default LayoutSection;
