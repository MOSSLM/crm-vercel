"use client";

import React from "react";
import type { UnitOption } from "./shared";
import { UNIT_OPTIONS, ColorInput, splitCssValue } from "./shared";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlignLeft, AlignCenter, AlignRight,
  Italic, Type, RemoveFormatting,
  Underline, GripHorizontal, Waves,
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

interface TypographySectionProps {
  styles: React.CSSProperties;
  onChange: (e: { target: { id: string; value: string } }) => void;
}

const TypographySection: React.FC<TypographySectionProps> = ({ styles, onChange }) => {
  return (
    <AccordionItem value="Styles" className="px-4 py-0">
      <AccordionTrigger className="!no-underline py-3">
        <span className="flex items-center gap-2 text-xs font-medium">
          <Type className="h-3.5 w-3.5 text-muted-foreground" />
          Typographie
        </span>
      </AccordionTrigger>
      <AccordionContent className="flex flex-col gap-3 pb-4">
        {/* Font family */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Police</Label>
          <Select value={(styles.fontFamily as string) || "inherit"} onValueChange={(v) => onChange({ target: { id: "fontFamily", value: v } })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Hérité" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="inherit" className="text-xs">Hérité</SelectItem>
              <SelectItem value="Inter, sans-serif" className="text-xs">Inter</SelectItem>
              <SelectItem value="'DM Sans', sans-serif" className="text-xs">DM Sans</SelectItem>
              <SelectItem value="'Playfair Display', serif" className="text-xs">Playfair Display</SelectItem>
              <SelectItem value="Georgia, serif" className="text-xs">Georgia</SelectItem>
              <SelectItem value="'DM Mono', monospace" className="text-xs">DM Mono</SelectItem>
              <SelectItem value="system-ui, sans-serif" className="text-xs">System UI</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Size + Weight in a row */}
        <div className="grid grid-cols-2 gap-2">
          <UnitValueInput id="fontSize" label="Taille" value={styles.fontSize} onChange={onChange} defaultUnit="px" />
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Graisse</Label>
            <Select onValueChange={(v) => onChange({ target: { id: "fontWeight", value: v } })} value={styles.fontWeight?.toString()}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Normal" /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel className="text-xs">Graisse</SelectLabel>
                  <SelectItem value="700" className="text-xs">Gras (700)</SelectItem>
                  <SelectItem value="600" className="text-xs">Semi-gras (600)</SelectItem>
                  <SelectItem value="500" className="text-xs">Moyen (500)</SelectItem>
                  <SelectItem value="normal" className="text-xs">Normal</SelectItem>
                  <SelectItem value="300" className="text-xs">Léger (300)</SelectItem>
                  <SelectItem value="200" className="text-xs">Extra-léger (200)</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Line height + Letter spacing */}
        <div className="grid grid-cols-2 gap-2">
          <UnitValueInput id="lineHeight" label="Hauteur ligne" value={styles.lineHeight} onChange={onChange} defaultUnit="em" />
          <UnitValueInput id="letterSpacing" label="Espacement" value={styles.letterSpacing} onChange={onChange} defaultUnit="em" />
        </div>

        {/* Color */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Couleur</Label>
          <ColorInput value={styles.color as string} onChange={(v) => onChange({ target: { id: "color", value: v } })} />
        </div>

        {/* Text align */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Alignement</Label>
          <ToggleGroup type="single" className="justify-start border rounded-md gap-0"
            value={styles.textAlign as string}
            onValueChange={(v) => onChange({ target: { id: "textAlign", value: v } })}>
            <Tooltip><TooltipTrigger><ToggleGroupItem value="left" className="h-8 px-3"><AlignLeft className="w-3.5 h-3.5" /></ToggleGroupItem></TooltipTrigger><TooltipContent side="bottom"><p>Gauche</p></TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger><ToggleGroupItem value="center" className="h-8 px-3"><AlignCenter className="w-3.5 h-3.5" /></ToggleGroupItem></TooltipTrigger><TooltipContent side="bottom"><p>Centre</p></TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger><ToggleGroupItem value="right" className="h-8 px-3"><AlignRight className="w-3.5 h-3.5" /></ToggleGroupItem></TooltipTrigger><TooltipContent side="bottom"><p>Droite</p></TooltipContent></Tooltip>
          </ToggleGroup>
        </div>

        {/* Transform + Style */}
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Casse</Label>
            <Select value={(styles.textTransform as string) || "none"} onValueChange={(v) => onChange({ target: { id: "textTransform", value: v } })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-xs">Aucun</SelectItem>
                <SelectItem value="uppercase" className="text-xs">MAJUSCULES</SelectItem>
                <SelectItem value="lowercase" className="text-xs">minuscules</SelectItem>
                <SelectItem value="capitalize" className="text-xs">Capitalize</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Style</Label>
            <ToggleGroup type="single" className="justify-start border rounded-md gap-0"
              value={styles.fontStyle as string}
              onValueChange={(v) => onChange({ target: { id: "fontStyle", value: v } })}>
              <Tooltip><TooltipTrigger><ToggleGroupItem value="normal" className="h-8 px-3"><Type className="w-3.5 h-3.5" /></ToggleGroupItem></TooltipTrigger><TooltipContent side="bottom"><p>Normal</p></TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger><ToggleGroupItem value="italic" className="h-8 px-3"><Italic className="w-3.5 h-3.5" /></ToggleGroupItem></TooltipTrigger><TooltipContent side="bottom"><p>Italique</p></TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger><ToggleGroupItem value="oblique" className="h-8 px-3"><RemoveFormatting className="w-3.5 h-3.5" /></ToggleGroupItem></TooltipTrigger><TooltipContent side="bottom"><p>Oblique</p></TooltipContent></Tooltip>
            </ToggleGroup>
          </div>
        </div>

        {/* Decoration */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Décoration</Label>
          <ToggleGroup type="single" className="justify-start border rounded-md gap-0"
            value={styles.textDecoration as string}
            onValueChange={(v) => onChange({ target: { id: "textDecoration", value: v } })}>
            <Tooltip><TooltipTrigger><ToggleGroupItem value="none" className="h-8 px-3 text-xs">—</ToggleGroupItem></TooltipTrigger><TooltipContent side="bottom"><p>Aucun</p></TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger><ToggleGroupItem value="underline" className="h-8 px-3"><Underline className="w-3.5 h-3.5" /></ToggleGroupItem></TooltipTrigger><TooltipContent side="bottom"><p>Souligné</p></TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger><ToggleGroupItem value="underline dotted" className="h-8 px-3"><GripHorizontal className="w-3.5 h-3.5" /></ToggleGroupItem></TooltipTrigger><TooltipContent side="bottom"><p>Pointillé</p></TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger><ToggleGroupItem value="underline wavy" className="h-8 px-3"><Waves className="w-3.5 h-3.5" /></ToggleGroupItem></TooltipTrigger><TooltipContent side="bottom"><p>Ondulé</p></TooltipContent></Tooltip>
          </ToggleGroup>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};

export { UnitValueInput };
export default TypographySection;
