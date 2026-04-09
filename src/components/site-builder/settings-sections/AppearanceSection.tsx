"use client";

import React from "react";
import type { UnitOption } from "./shared";
import { UNIT_OPTIONS, ColorInput, splitCssValue, parseSliderValue } from "./shared";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Eye, Expand, Shrink, LucideImageDown, WrapText } from "lucide-react";

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
        <Input
          id={id} value={rawValue} placeholder={defaultUnit}
          className="h-8 text-xs"
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

interface AppearanceSectionProps {
  styles: React.CSSProperties;
  onChange: (e: { target: { id: string; value: string } }) => void;
}

const AppearanceSection: React.FC<AppearanceSectionProps> = ({ styles, onChange }) => {
  return (
    <AccordionItem value="Visual" className="px-4 py-0">
      <AccordionTrigger className="!no-underline py-3">
        <span className="flex items-center gap-2 text-xs font-medium">
          <Eye className="h-3.5 w-3.5 text-muted-foreground" />
          Apparence
        </span>
      </AccordionTrigger>
      <AccordionContent className="flex flex-col gap-3 pb-4">
        {/* Opacity */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Opacité</Label>
            <span className="text-xs text-muted-foreground">{parseSliderValue(styles?.opacity, 100)}%</span>
          </div>
          <Slider
            defaultValue={[parseSliderValue(styles?.opacity, 100)]}
            max={100} step={1}
            onValueChange={(e) => onChange({ target: { id: "opacity", value: `${e[0]}%` } })}
          />
        </div>

        {/* Border color + style */}
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Bordure</Label>
            <ColorInput value={styles.borderColor as string} onChange={(v) => onChange({ target: { id: "borderColor", value: v } })} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Style bordure</Label>
            <Select value={(styles.borderStyle as string) || "solid"} onValueChange={(v) => onChange({ target: { id: "borderStyle", value: v } })}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-xs">Aucun</SelectItem>
                <SelectItem value="solid" className="text-xs">Solide</SelectItem>
                <SelectItem value="dashed" className="text-xs">Tirets</SelectItem>
                <SelectItem value="dotted" className="text-xs">Points</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Border width + radius */}
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Épaisseur</Label>
              <span className="text-xs text-muted-foreground">{parseSliderValue(styles?.borderWidth, 0)}px</span>
            </div>
            <Slider defaultValue={[parseSliderValue(styles?.borderWidth, 0)]} max={20} step={1}
              onValueChange={(e) => onChange({ target: { id: "borderWidth", value: `${e[0]}px` } })} />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Rayon</Label>
              <span className="text-xs text-muted-foreground">{parseSliderValue(styles?.borderRadius, 0)}px</span>
            </div>
            <Slider defaultValue={[parseSliderValue(styles?.borderRadius, 0)]} max={100} step={1}
              onValueChange={(e) => onChange({ target: { id: "borderRadius", value: `${e[0]}px` } })} />
          </div>
        </div>

        {/* Background color */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Couleur de fond</Label>
          <ColorInput value={styles.background as string} onChange={(v) => onChange({ target: { id: "background", value: v } })} />
        </div>

        {/* Background image */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Image de fond</Label>
          <div className="flex border rounded-md overflow-clip h-9">
            <div className="w-9 shrink-0" style={{ backgroundImage: styles.backgroundImage as string, backgroundSize: "cover" }} />
            <Input placeholder="url(https://...)" className="!border-0 rounded-none text-xs h-full"
              id="backgroundImage" onChange={(e) => onChange({ target: { id: "backgroundImage", value: e.target.value } })}
              value={styles.backgroundImage ?? ""} />
          </div>
        </div>

        {/* Background size */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Taille image fond</Label>
          <ToggleGroup type="single" className="justify-start border rounded-md gap-0 items-center"
            value={styles.backgroundSize?.toString()}
            onValueChange={(v) => onChange({ target: { id: "backgroundSize", value: v } })}>
            <Tooltip><TooltipTrigger><ToggleGroupItem value="cover" className="h-8 px-3"><Expand className="w-3.5 h-3.5" /></ToggleGroupItem></TooltipTrigger><TooltipContent side="bottom"><p>Cover</p></TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger><ToggleGroupItem value="contain" className="h-8 px-3"><Shrink className="w-3.5 h-3.5" /></ToggleGroupItem></TooltipTrigger><TooltipContent side="bottom"><p>Contain</p></TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger><ToggleGroupItem value="auto" className="h-8 px-3"><LucideImageDown className="w-3.5 h-3.5" /></ToggleGroupItem></TooltipTrigger><TooltipContent side="bottom"><p>Auto</p></TooltipContent></Tooltip>
          </ToggleGroup>
        </div>

        {/* Box shadow */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Ombre</Label>
          <Input id="boxShadow" placeholder="0 4px 16px rgba(0,0,0,0.15)" className="h-8 text-xs"
            onChange={(e) => onChange({ target: { id: "boxShadow", value: e.target.value } })}
            value={(styles.boxShadow as string) ?? ""} />
        </div>

        {/* Overflow */}
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Débordement</Label>
            <Select value={(styles.overflow as string) || "visible"} onValueChange={(v) => onChange({ target: { id: "overflow", value: v } })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="visible" className="text-xs">Visible</SelectItem>
                <SelectItem value="hidden" className="text-xs">Caché</SelectItem>
                <SelectItem value="auto" className="text-xs">Auto</SelectItem>
                <SelectItem value="scroll" className="text-xs">Défilement</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Curseur</Label>
            <Select value={(styles.cursor as string) || "auto"} onValueChange={(v) => onChange({ target: { id: "cursor", value: v } })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto" className="text-xs">Auto</SelectItem>
                <SelectItem value="pointer" className="text-xs">Pointeur</SelectItem>
                <SelectItem value="default" className="text-xs">Défaut</SelectItem>
                <SelectItem value="grab" className="text-xs">Grab</SelectItem>
                <SelectItem value="not-allowed" className="text-xs">Interdit</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Flex wrap */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Retour à la ligne</Label>
          <ToggleGroup type="single" className="justify-start border rounded-md gap-0"
            value={(styles.flexWrap as string) || "nowrap"}
            onValueChange={(v) => onChange({ target: { id: "flexWrap", value: v } })}>
            <ToggleGroupItem value="nowrap" className="h-8 px-3 text-xs flex-1">Sans retour</ToggleGroupItem>
            <Tooltip><TooltipTrigger asChild>
              <ToggleGroupItem value="wrap" className="h-8 px-3"><WrapText className="w-3.5 h-3.5" /></ToggleGroupItem>
            </TooltipTrigger><TooltipContent side="bottom"><p>Retour à la ligne</p></TooltipContent></Tooltip>
          </ToggleGroup>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};

export { UnitValueInput, AppearanceSection };
export default AppearanceSection;
