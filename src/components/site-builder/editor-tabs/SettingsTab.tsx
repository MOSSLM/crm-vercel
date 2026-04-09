"use client";

import React from "react";
import {
  AlignCenter,
  AlignHorizontalJustifyCenterIcon,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignHorizontalSpaceAround,
  AlignHorizontalSpaceBetween,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  Bookmark,
  Check,
  Expand,
  GripHorizontal,
  Italic,
  LucideImageDown,
  MousePointerClick,
  RemoveFormatting,
  Shrink,
  Type,
  Underline,
  Waves,
} from "lucide-react";
import { useEditor } from "@/components/site-builder/use-editor";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { componentsApi } from "@/utils/siteBuilderApi";

// Native color input replacing ColorPicker
const ColorInput = ({ value, onChange, className }: { value?: string; onChange: (val: string) => void; className?: string }) => (
  <div className={`flex items-center gap-2 h-9 rounded-md border border-input bg-background px-3 py-1 ${className ?? ""}`}>
    <input
      type="color"
      value={value && value.startsWith("#") ? value : "#000000"}
      onChange={(e) => onChange(e.target.value)}
      className="h-6 w-6 rounded cursor-pointer border-0 bg-transparent p-0 shrink-0"
    />
    <span className="text-sm text-muted-foreground truncate">{value || "#000000"}</span>
  </div>
);

const parseSliderValue = (val: string | number | undefined, fallback = 0): number => {
  if (typeof val === "number") return val;
  if (!val) return fallback;
  const n = parseFloat(String(val).replace(/[^0-9.]/g, ""));
  return isNaN(n) ? fallback : n;
};

const SettingsTab: React.FC = () => {
  const { editor, dispatch } = useEditor();
  const [showSave, setShowSave] = React.useState(false);
  const [compName, setCompName] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  const handleSaveComponent = async () => {
    const sel = editor.editor.selectedElement;
    if (!sel.id || !compName.trim()) return;
    setSaving(true);
    try {
      await componentsApi.create({ name: compName.trim(), content: JSON.stringify(sel) });
      window.dispatchEvent(new CustomEvent("sb:componentSaved"));
      setSaved(true);
      setTimeout(() => { setSaved(false); setShowSave(false); setCompName(""); }, 1500);
    } catch { /* ignore */ }
    setSaving(false);
  };

  const handleChangeCustomValues = (e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch({
      type: "UPDATE_ELEMENT",
      payload: {
        elementDetails: {
          ...editor.editor.selectedElement,
          content: {
            ...(!Array.isArray(editor.editor.selectedElement.content) ? editor.editor.selectedElement.content : {}),
            [e.target.id]: e.target.value,
          },
        },
      },
    });
  };

  const handleOnChanges = (e: { target: { id: string; value: string } }) => {
    dispatch({
      type: "UPDATE_ELEMENT",
      payload: {
        elementDetails: {
          ...editor.editor.selectedElement,
          styles: { ...editor.editor.selectedElement.styles, [e.target.id]: e.target.value },
        },
      },
    });
  };

  if (!editor.editor.selectedElement.id) {
    return (
      <div className="px-6 py-6">
        <h3 className="text-sm font-semibold mb-1">Styles</h3>
        <p className="text-xs text-muted-foreground mb-8">Personnalisez chaque composant comme vous le souhaitez.</p>
        <div className="flex flex-col items-center text-sm gap-2 text-muted-foreground text-center mt-16">
          <MousePointerClick className="w-6 h-6" />
          Sélectionnez un composant pour le personnaliser
        </div>
      </div>
    );
  }

  const sel = editor.editor.selectedElement;
  const content = !Array.isArray(sel.content) ? sel.content : {};

  return (
    <TooltipProvider delayDuration={300}>
      <div className="px-6 py-6">
        <h3 className="text-sm font-semibold mb-1">Styles</h3>
        <p className="text-xs text-muted-foreground mb-4">Personnalisez chaque composant comme vous le souhaitez.</p>
      </div>

      {/* Save as component */}
      {sel.type && sel.type !== "__body" && (
        <div className="px-6 pb-4 border-b border-border">
          {!showSave ? (
            <Button variant="outline" size="sm" className="w-full gap-2 text-xs" onClick={() => setShowSave(true)}>
              <Bookmark className="w-3.5 h-3.5" />
              Sauvegarder comme composant
            </Button>
          ) : (
            <div className="flex flex-col gap-2">
              <Label className="text-xs">Nom du composant</Label>
              <div className="flex gap-2">
                <Input
                  value={compName}
                  onChange={(e) => setCompName(e.target.value)}
                  placeholder="Ex : Hero Section"
                  className="h-8 text-xs"
                  onKeyDown={(e) => { if (e.key === "Enter") handleSaveComponent(); if (e.key === "Escape") { setShowSave(false); setCompName(""); } }}
                  autoFocus
                />
                <Button size="sm" className="h-8 px-3 shrink-0" onClick={handleSaveComponent} disabled={saving || !compName.trim()}>
                  {saved ? <Check className="w-3.5 h-3.5" /> : saving ? "…" : "OK"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <Accordion type="multiple" className="w-full" defaultValue={["Custom", "Typography", "Dimensions", "Decorations", "Layout"]}>

        {/* Custom properties */}
        {(sel.type === "link" || sel.type === "video" || sel.type === "image") && (
          <AccordionItem value="Custom" className="px-6 py-0">
            <AccordionTrigger className="!no-underline">Personnalisé</AccordionTrigger>
            <AccordionContent>
              {sel.type === "link" && (
                <div className="flex flex-col gap-2">
                  <Label>URL du lien</Label>
                  <Input id="href" placeholder="https://domain.example.com/pathname" onChange={handleChangeCustomValues} value={content.href ?? ""} />
                </div>
              )}
              {sel.type === "video" && (
                <div className="flex flex-col gap-2">
                  <Label>URL de la vidéo</Label>
                  <Input id="src" placeholder="https://www.youtube.com/embed/..." onChange={handleChangeCustomValues} value={content.src ?? ""} />
                </div>
              )}
              {sel.type === "image" && (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <Label>URL de l&apos;image</Label>
                    <Input id="src" placeholder="https://domain.example.com/image.jpg" onChange={handleChangeCustomValues} value={content.src ?? ""} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Description (alt)</Label>
                    <Input id="alt" placeholder="Description de l'image" onChange={handleChangeCustomValues} value={content.alt ?? ""} />
                  </div>
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        )}

        {/* Typography */}
        <AccordionItem value="Typography" className="px-6 py-0 border-y-[1px]">
          <AccordionTrigger className="!no-underline">Typographie</AccordionTrigger>
          <AccordionContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>Alignement</Label>
              <ToggleGroup
                type="single"
                className="w-[274px] justify-between border rounded-md gap-4 items-center p-1"
                value={sel.styles.textAlign as string}
                onValueChange={(e) => handleOnChanges({ target: { id: "textAlign", value: e } })}
              >
                <Tooltip><TooltipTrigger><ToggleGroupItem value="left"><AlignLeft className="w-5 h-5" /></ToggleGroupItem></TooltipTrigger><TooltipContent side="bottom"><p>Gauche</p></TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger><ToggleGroupItem value="center"><AlignCenter className="w-5 h-5" /></ToggleGroupItem></TooltipTrigger><TooltipContent side="bottom"><p>Centre</p></TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger><ToggleGroupItem value="right"><AlignRight className="w-5 h-5" /></ToggleGroupItem></TooltipTrigger><TooltipContent side="bottom"><p>Droite</p></TooltipContent></Tooltip>
              </ToggleGroup>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Couleur</Label>
              <ColorInput value={sel.styles.color as string} className="w-[274px]" onChange={(e) => handleOnChanges({ target: { id: "color", value: e } })} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Décoration</Label>
              <ToggleGroup
                type="single"
                className="w-[274px] justify-between border rounded-md gap-4 items-center p-1"
                value={sel.styles.textDecoration as string}
                onValueChange={(e) => handleOnChanges({ target: { id: "textDecoration", value: e } })}
              >
                <Tooltip><TooltipTrigger><ToggleGroupItem value="underline"><Underline className="w-5 h-5" /></ToggleGroupItem></TooltipTrigger><TooltipContent side="bottom"><p>Souligné <kbd className="text-[10px]">⌘U</kbd></p></TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger><ToggleGroupItem value="underline dotted"><GripHorizontal className="w-5 h-5" /></ToggleGroupItem></TooltipTrigger><TooltipContent side="bottom"><p>Pointillé</p></TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger><ToggleGroupItem value="underline wavy"><Waves className="w-5 h-5" /></ToggleGroupItem></TooltipTrigger><TooltipContent side="bottom"><p>Ondulé</p></TooltipContent></Tooltip>
              </ToggleGroup>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Style</Label>
              <ToggleGroup
                type="single"
                className="justify-between border rounded-md gap-4 items-center p-1"
                value={sel.styles.fontStyle as string}
                onValueChange={(e) => handleOnChanges({ target: { id: "fontStyle", value: e } })}
              >
                <Tooltip><TooltipTrigger><ToggleGroupItem value="italic"><Italic className="w-5 h-5" /></ToggleGroupItem></TooltipTrigger><TooltipContent side="bottom"><p>Italique <kbd className="text-[10px]">⌘I</kbd></p></TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger><ToggleGroupItem value="normal"><Type className="w-5 h-5" /></ToggleGroupItem></TooltipTrigger><TooltipContent side="bottom"><p>Normal</p></TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger><ToggleGroupItem value="oblique"><RemoveFormatting className="w-5 h-5" /></ToggleGroupItem></TooltipTrigger><TooltipContent side="bottom"><p>Oblique</p></TooltipContent></Tooltip>
              </ToggleGroup>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Graisse</Label>
              <Select
                onValueChange={(e) => handleOnChanges({ target: { id: "fontWeight", value: e } })}
                value={sel.styles.fontWeight?.toString()}
              >
                <SelectTrigger className="w-full"><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Graisses</SelectLabel>
                    <SelectItem value="700">Gras</SelectItem>
                    <SelectItem value="600">Semi-gras</SelectItem>
                    <SelectItem value="500">Moyen</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="300">Léger</SelectItem>
                    <SelectItem value="200">Extra-léger</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Taille</Label>
              <Input placeholder="px" id="fontSize" onChange={handleOnChanges} value={sel.styles.fontSize ?? ""} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Hauteur de ligne</Label>
              <Input placeholder="rem" id="lineHeight" onChange={handleOnChanges} value={sel.styles.lineHeight ?? ""} />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Decorations */}
        <AccordionItem value="Decorations" className="px-6 py-0">
          <AccordionTrigger className="!no-underline">Décorations</AccordionTrigger>
          <AccordionContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>Opacité</Label>
              <div className="flex items-center justify-end -mt-2">
                <span className="p-2 text-sm">{parseSliderValue(sel.styles?.opacity, 100)}%</span>
              </div>
              <Slider
                className="-mt-2"
                defaultValue={[parseSliderValue(sel.styles?.opacity, 100)]}
                max={100}
                step={1}
                onValueChange={(e) => handleOnChanges({ target: { id: "opacity", value: `${e[0]}%` } })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Couleur de bordure</Label>
              <ColorInput value={sel.styles.borderColor as string} className="w-[274px]" onChange={(e) => handleOnChanges({ target: { id: "borderColor", value: e } })} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Épaisseur de bordure</Label>
              <div className="flex items-center justify-end -mt-2">
                <span className="p-2 text-sm">{parseSliderValue(sel.styles?.borderWidth, 0)}px</span>
              </div>
              <Slider
                className="-mt-2"
                defaultValue={[parseSliderValue(sel.styles?.borderWidth, 0)]}
                max={100}
                step={1}
                onValueChange={(e) => handleOnChanges({ target: { id: "borderWidth", value: `${e[0]}px` } })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Rayon de bordure</Label>
              <div className="flex items-center justify-end -mt-2">
                <span className="p-2 text-sm">{parseSliderValue(sel.styles?.borderRadius, 0)}px</span>
              </div>
              <Slider
                className="-mt-2"
                defaultValue={[parseSliderValue(sel.styles?.borderRadius, 0)]}
                max={100}
                step={1}
                onValueChange={(e) => handleOnChanges({ target: { id: "borderRadius", value: `${e[0]}px` } })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Couleur de fond</Label>
              <ColorInput value={sel.styles.background as string} className="w-[274px]" onChange={(e) => handleOnChanges({ target: { id: "background", value: e } })} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Image de fond</Label>
              <div className="flex border rounded-md overflow-clip">
                <div
                  className="w-12 shrink-0 object-cover object-center"
                  style={{ backgroundImage: sel.styles.backgroundImage as string }}
                />
                <Input
                  placeholder="url(https://...)"
                  className="!border-y-0 rounded-none !border-r-0 mr-2"
                  id="backgroundImage"
                  onChange={handleOnChanges}
                  value={sel.styles.backgroundImage ?? ""}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Position de l&apos;image</Label>
              <ToggleGroup
                type="single"
                className="w-[274px] justify-between border rounded-md gap-4 items-center p-1"
                value={sel.styles.backgroundSize?.toString()}
                onValueChange={(e) => handleOnChanges({ target: { id: "backgroundSize", value: e } })}
              >
                <Tooltip><TooltipTrigger><ToggleGroupItem value="cover"><Expand className="w-5 h-5" /></ToggleGroupItem></TooltipTrigger><TooltipContent side="bottom"><p>Cover</p></TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger><ToggleGroupItem value="contain"><Shrink className="w-5 h-5" /></ToggleGroupItem></TooltipTrigger><TooltipContent side="bottom"><p>Contain</p></TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger><ToggleGroupItem value="auto"><LucideImageDown className="w-5 h-5" /></ToggleGroupItem></TooltipTrigger><TooltipContent side="bottom"><p>Auto</p></TooltipContent></Tooltip>
              </ToggleGroup>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Layout */}
        <AccordionItem value="Layout" className="px-6 py-0">
          <AccordionTrigger className="!no-underline">Mise en page</AccordionTrigger>
          <AccordionContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>Mode d&apos;affichage</Label>
              <Select
                onValueChange={(e) => handleOnChanges({ target: { id: "display", value: e } })}
                value={sel.styles.display as string}
              >
                <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Mode</SelectLabel>
                    <SelectItem value="flex">Flex</SelectItem>
                    <SelectItem value="inline-flex">Inline Flex</SelectItem>
                    <SelectItem value="inline">Inline</SelectItem>
                    <SelectItem value="block">Block</SelectItem>
                    <SelectItem value="inline-block">Inline Block</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Justifier</Label>
              <ToggleGroup
                type="single"
                className="w-[274px] justify-between border rounded-md gap-2 items-center p-1"
                value={sel.styles.justifyContent}
                onValueChange={(e) => handleOnChanges({ target: { id: "justifyContent", value: e } })}
              >
                <Tooltip><TooltipTrigger><ToggleGroupItem value="space-between"><AlignHorizontalSpaceBetween className="w-5 h-5" /></ToggleGroupItem></TooltipTrigger><TooltipContent side="bottom"><p>Space Between</p></TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger><ToggleGroupItem value="space-around"><AlignHorizontalSpaceAround className="w-5 h-5" /></ToggleGroupItem></TooltipTrigger><TooltipContent side="bottom"><p>Space Around</p></TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger><ToggleGroupItem value="center"><AlignHorizontalJustifyCenterIcon className="w-5 h-5" /></ToggleGroupItem></TooltipTrigger><TooltipContent side="bottom"><p>Centre</p></TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger><ToggleGroupItem value="flex-start"><AlignHorizontalJustifyStart className="w-5 h-5" /></ToggleGroupItem></TooltipTrigger><TooltipContent side="bottom"><p>Début</p></TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger><ToggleGroupItem value="flex-end"><AlignHorizontalJustifyEnd className="w-5 h-5" /></ToggleGroupItem></TooltipTrigger><TooltipContent side="bottom"><p>Fin</p></TooltipContent></Tooltip>
              </ToggleGroup>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Aligner les éléments</Label>
              <ToggleGroup
                type="single"
                className="w-[274px] justify-between border rounded-md gap-4 items-center p-1"
                value={sel.styles.alignItems}
                onValueChange={(e) => handleOnChanges({ target: { id: "alignItems", value: e } })}
              >
                <Tooltip><TooltipTrigger><ToggleGroupItem value="center"><AlignVerticalJustifyCenter className="w-5 h-5" /></ToggleGroupItem></TooltipTrigger><TooltipContent side="bottom"><p>Centre</p></TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger><ToggleGroupItem value="flex-start"><AlignVerticalJustifyStart className="w-5 h-5" /></ToggleGroupItem></TooltipTrigger><TooltipContent side="bottom"><p>Début</p></TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger><ToggleGroupItem value="flex-end"><AlignVerticalJustifyEnd className="w-5 h-5" /></ToggleGroupItem></TooltipTrigger><TooltipContent side="bottom"><p>Fin</p></TooltipContent></Tooltip>
              </ToggleGroup>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Direction</Label>
              <Select
                onValueChange={(e) => handleOnChanges({ target: { id: "flexDirection", value: e } })}
                value={sel.styles.flexDirection as string}
              >
                <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Directions</SelectLabel>
                    <SelectItem value="row">Ligne</SelectItem>
                    <SelectItem value="column">Colonne</SelectItem>
                    <SelectItem value="row-reverse">Ligne inversée</SelectItem>
                    <SelectItem value="column-reverse">Colonne inversée</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Dimensions */}
        <AccordionItem value="Dimensions" className="px-6 py-0 border-b-0">
          <AccordionTrigger className="!no-underline">Dimensions</AccordionTrigger>
          <AccordionContent>
            <div className="flex flex-col gap-4">
              <div className="flex gap-4">
                <div className="flex flex-col gap-2">
                  <Label>Hauteur</Label>
                  <Input id="height" placeholder="px" onChange={handleOnChanges} value={sel.styles.height ?? ""} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Largeur</Label>
                  <Input id="width" placeholder="px" onChange={handleOnChanges} value={sel.styles.width ?? ""} />
                </div>
              </div>
              <Label className="w-full text-center">Marges (px)</Label>
              <div className="flex flex-col gap-4">
                <div className="flex gap-4">
                  <div className="flex flex-col gap-2"><Label>Haut</Label><Input id="marginTop" placeholder="px" onChange={handleOnChanges} value={sel.styles.marginTop ?? ""} /></div>
                  <div className="flex flex-col gap-2"><Label>Bas</Label><Input id="marginBottom" placeholder="px" onChange={handleOnChanges} value={sel.styles.marginBottom ?? ""} /></div>
                </div>
                <div className="flex gap-4">
                  <div className="flex flex-col gap-2"><Label>Gauche</Label><Input id="marginLeft" placeholder="px" onChange={handleOnChanges} value={sel.styles.marginLeft ?? ""} /></div>
                  <div className="flex flex-col gap-2"><Label>Droite</Label><Input id="marginRight" placeholder="px" onChange={handleOnChanges} value={sel.styles.marginRight ?? ""} /></div>
                </div>
              </div>
              <Label className="w-full text-center">Rembourrage (px)</Label>
              <div className="flex flex-col gap-4">
                <div className="flex gap-4">
                  <div className="flex flex-col gap-2"><Label>Haut</Label><Input id="paddingTop" placeholder="px" onChange={handleOnChanges} value={sel.styles.paddingTop ?? ""} /></div>
                  <div className="flex flex-col gap-2"><Label>Bas</Label><Input id="paddingBottom" placeholder="px" onChange={handleOnChanges} value={sel.styles.paddingBottom ?? ""} /></div>
                </div>
                <div className="flex gap-4">
                  <div className="flex flex-col gap-2"><Label>Gauche</Label><Input id="paddingLeft" placeholder="px" onChange={handleOnChanges} value={sel.styles.paddingLeft ?? ""} /></div>
                  <div className="flex flex-col gap-2"><Label>Droite</Label><Input id="paddingRight" placeholder="px" onChange={handleOnChanges} value={sel.styles.paddingRight ?? ""} /></div>
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

      </Accordion>
    </TooltipProvider>
  );
};

export default SettingsTab;
