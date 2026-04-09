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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

// Simple native color input wrapper
const ColorInput = ({ value, onChange }: { value?: string; onChange: (val: string) => void }) => (
  <div className="flex items-center gap-2 h-9 w-full rounded-md border border-input bg-background px-3 py-1">
    <input
      type="color"
      value={value || "#000000"}
      onChange={(e) => onChange(e.target.value)}
      className="h-6 w-6 rounded cursor-pointer border-0 bg-transparent p-0"
    />
    <span className="text-sm text-muted-foreground">{value || "#000000"}</span>
  </div>
);

const SettingsTab: React.FC = () => {
  const { editor, dispatch } = useEditor();

  const handleChangeCustomValues = (e: React.ChangeEvent<HTMLInputElement>) => {
    const prop = e.target.id;
    const value = e.target.value;
    dispatch({
      type: "UPDATE_ELEMENT",
      payload: {
        elementDetails: {
          ...editor.editor.selectedElement,
          content: {
            ...(!Array.isArray(editor.editor.selectedElement.content) ? editor.editor.selectedElement.content : {}),
            [prop]: value,
          },
        },
      },
    });
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleOnChanges = (e: any) => {
    const styleSettings = e.target.id;
    const value = e.target.value;
    dispatch({
      type: "UPDATE_ELEMENT",
      payload: {
        elementDetails: {
          ...editor.editor.selectedElement,
          styles: { ...editor.editor.selectedElement.styles, [styleSettings]: value },
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

      <Accordion type="multiple" className="w-full" defaultValue={["Custom", "Typography", "Dimensions", "Decorations", "Layout"]}>
        {/* Custom properties */}
        {(sel.type === "link" || sel.type === "video" || sel.type === "image") && (
          <AccordionItem value="Custom" className="px-6 py-0">
            <AccordionTrigger className="!no-underline">Personnalisé</AccordionTrigger>
            <AccordionContent>
              {sel.type === "link" && (
                <div className="flex flex-col gap-2">
                  <Label>URL du lien</Label>
                  <Input id="href" placeholder="https://example.com" onChange={handleChangeCustomValues} value={content.href ?? ""} />
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
                    <Input id="src" placeholder="https://example.com/image.jpg" onChange={handleChangeCustomValues} value={content.src ?? ""} />
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
              <ToggleGroup type="single" className="justify-between border rounded-md gap-4 items-center p-1"
                onValueChange={(e) => handleOnChanges({ target: { id: "textAlign", value: e } })}>
                <Tooltip><TooltipTrigger><ToggleGroupItem value="left"><AlignLeft className="w-4 h-4" /></ToggleGroupItem></TooltipTrigger><TooltipContent><p>Gauche</p></TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger><ToggleGroupItem value="center"><AlignCenter className="w-4 h-4" /></ToggleGroupItem></TooltipTrigger><TooltipContent><p>Centre</p></TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger><ToggleGroupItem value="right"><AlignRight className="w-4 h-4" /></ToggleGroupItem></TooltipTrigger><TooltipContent><p>Droite</p></TooltipContent></Tooltip>
              </ToggleGroup>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Couleur</Label>
              <ColorInput value={sel.styles.color as string} onChange={(v) => handleOnChanges({ target: { id: "color", value: v } })} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Décoration</Label>
              <ToggleGroup type="single" className="justify-between border rounded-md gap-4 items-center p-1"
                value={sel.styles.textDecoration as string}
                onValueChange={(e) => handleOnChanges({ target: { id: "textDecoration", value: e } })}>
                <Tooltip><TooltipTrigger><ToggleGroupItem value="underline"><Underline className="w-4 h-4" /></ToggleGroupItem></TooltipTrigger><TooltipContent><p>Souligné</p></TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger><ToggleGroupItem value="underline dotted"><GripHorizontal className="w-4 h-4" /></ToggleGroupItem></TooltipTrigger><TooltipContent><p>Pointillé</p></TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger><ToggleGroupItem value="underline wavy"><Waves className="w-4 h-4" /></ToggleGroupItem></TooltipTrigger><TooltipContent><p>Ondulé</p></TooltipContent></Tooltip>
              </ToggleGroup>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Style</Label>
              <ToggleGroup type="single" className="justify-between border rounded-md gap-4 items-center p-1"
                value={sel.styles.fontStyle as string}
                onValueChange={(e) => handleOnChanges({ target: { id: "fontStyle", value: e } })}>
                <Tooltip><TooltipTrigger><ToggleGroupItem value="italic"><Italic className="w-4 h-4" /></ToggleGroupItem></TooltipTrigger><TooltipContent><p>Italique</p></TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger><ToggleGroupItem value="normal"><Type className="w-4 h-4" /></ToggleGroupItem></TooltipTrigger><TooltipContent><p>Normal</p></TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger><ToggleGroupItem value="oblique"><RemoveFormatting className="w-4 h-4" /></ToggleGroupItem></TooltipTrigger><TooltipContent><p>Oblique</p></TooltipContent></Tooltip>
              </ToggleGroup>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Graisse</Label>
              <Select onValueChange={(e) => handleOnChanges({ target: { id: "fontWeight", value: e } })} value={sel.styles.fontWeight?.toString()}>
                <SelectTrigger><SelectValue placeholder="Choisir la graisse" /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Graisse</SelectLabel>
                    <SelectItem value="700">Gras</SelectItem>
                    <SelectItem value="600">Semi-gras</SelectItem>
                    <SelectItem value="500">Moyen</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="300">Léger</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Taille</Label>
              <Input placeholder="16px" id="fontSize" onChange={handleOnChanges} value={sel.styles.fontSize as string ?? ""} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Interlignage</Label>
              <Input placeholder="1.5rem" id="lineHeight" onChange={handleOnChanges} value={sel.styles.lineHeight as string ?? ""} />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Decorations */}
        <AccordionItem value="Decorations" className="px-6 py-0">
          <AccordionTrigger className="!no-underline">Décorations</AccordionTrigger>
          <AccordionContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>Opacité ({typeof sel.styles?.opacity === "number" ? sel.styles?.opacity : parseFloat((sel.styles?.opacity || "100").replace("%", "")) || 100}%)</Label>
              <Slider
                onValueChange={(e) => handleOnChanges({ target: { id: "opacity", value: `${e[0]}%` } })}
                defaultValue={[typeof sel.styles?.opacity === "number" ? sel.styles.opacity : parseFloat((sel.styles?.opacity || "100").replace("%", "")) || 100]}
                max={100} step={1}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Couleur de bordure</Label>
              <ColorInput value={sel.styles.borderColor as string} onChange={(v) => handleOnChanges({ target: { id: "borderColor", value: v } })} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Épaisseur de bordure ({parseFloat((sel.styles?.borderWidth as string || "0").replace("px", "")) || 0}px)</Label>
              <Slider
                onValueChange={(e) => handleOnChanges({ target: { id: "borderWidth", value: `${e[0]}px` } })}
                defaultValue={[parseFloat((sel.styles?.borderWidth as string || "0").replace("px", "")) || 0]}
                max={20} step={1}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Arrondi ({parseFloat((sel.styles?.borderRadius as string || "0").replace("px", "")) || 0}px)</Label>
              <Slider
                onValueChange={(e) => handleOnChanges({ target: { id: "borderRadius", value: `${e[0]}px` } })}
                defaultValue={[parseFloat((sel.styles?.borderRadius as string || "0").replace("px", "")) || 0]}
                max={100} step={1}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Couleur de fond</Label>
              <ColorInput value={sel.styles.background as string} onChange={(v) => handleOnChanges({ target: { id: "background", value: v } })} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Image de fond</Label>
              <div className="flex border rounded-md overflow-clip">
                <div className="w-12 bg-cover bg-center shrink-0" style={{ backgroundImage: sel.styles.backgroundImage as string }} />
                <Input placeholder="url(https://...)" className="!border-y-0 rounded-none !border-r-0" id="backgroundImage" onChange={handleOnChanges} value={sel.styles.backgroundImage as string ?? ""} />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Taille du fond</Label>
              <ToggleGroup type="single" className="justify-between border rounded-md gap-4 items-center p-1"
                onValueChange={(e) => handleOnChanges({ target: { id: "backgroundSize", value: e } })}
                value={sel.styles.backgroundSize?.toString()}>
                <Tooltip><TooltipTrigger><ToggleGroupItem value="cover"><Expand className="w-4 h-4" /></ToggleGroupItem></TooltipTrigger><TooltipContent><p>Cover</p></TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger><ToggleGroupItem value="contain"><Shrink className="w-4 h-4" /></ToggleGroupItem></TooltipTrigger><TooltipContent><p>Contain</p></TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger><ToggleGroupItem value="auto"><LucideImageDown className="w-4 h-4" /></ToggleGroupItem></TooltipTrigger><TooltipContent><p>Auto</p></TooltipContent></Tooltip>
              </ToggleGroup>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Layout */}
        <AccordionItem value="Layout" className="px-6 py-0">
          <AccordionTrigger className="!no-underline">Disposition</AccordionTrigger>
          <AccordionContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>Affichage</Label>
              <Select onValueChange={(e) => handleOnChanges({ target: { id: "display", value: e } })}>
                <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Display</SelectLabel>
                    <SelectItem value="flex">Flex</SelectItem>
                    <SelectItem value="inline-flex">Inline Flex</SelectItem>
                    <SelectItem value="block">Block</SelectItem>
                    <SelectItem value="inline-block">Inline Block</SelectItem>
                    <SelectItem value="inline">Inline</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Justify Content</Label>
              <ToggleGroup type="single" className="justify-between border rounded-md gap-2 items-center p-1"
                onValueChange={(e) => handleOnChanges({ target: { id: "justifyContent", value: e } })}
                value={sel.styles.justifyContent as string}>
                <Tooltip><TooltipTrigger><ToggleGroupItem value="space-between"><AlignHorizontalSpaceBetween className="w-4 h-4" /></ToggleGroupItem></TooltipTrigger><TooltipContent><p>Space Between</p></TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger><ToggleGroupItem value="space-around"><AlignHorizontalSpaceAround className="w-4 h-4" /></ToggleGroupItem></TooltipTrigger><TooltipContent><p>Space Around</p></TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger><ToggleGroupItem value="center"><AlignHorizontalJustifyCenterIcon className="w-4 h-4" /></ToggleGroupItem></TooltipTrigger><TooltipContent><p>Centre</p></TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger><ToggleGroupItem value="flex-start"><AlignHorizontalJustifyStart className="w-4 h-4" /></ToggleGroupItem></TooltipTrigger><TooltipContent><p>Début</p></TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger><ToggleGroupItem value="flex-end"><AlignHorizontalJustifyEnd className="w-4 h-4" /></ToggleGroupItem></TooltipTrigger><TooltipContent><p>Fin</p></TooltipContent></Tooltip>
              </ToggleGroup>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Align Items</Label>
              <ToggleGroup type="single" className="justify-between border rounded-md gap-4 items-center p-1"
                onValueChange={(e) => handleOnChanges({ target: { id: "alignItems", value: e } })}
                value={sel.styles.alignItems as string}>
                <Tooltip><TooltipTrigger><ToggleGroupItem value="center"><AlignVerticalJustifyCenter className="w-4 h-4" /></ToggleGroupItem></TooltipTrigger><TooltipContent><p>Centre</p></TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger><ToggleGroupItem value="flex-start"><AlignVerticalJustifyStart className="w-4 h-4" /></ToggleGroupItem></TooltipTrigger><TooltipContent><p>Début</p></TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger><ToggleGroupItem value="flex-end"><AlignVerticalJustifyEnd className="w-4 h-4" /></ToggleGroupItem></TooltipTrigger><TooltipContent><p>Fin</p></TooltipContent></Tooltip>
              </ToggleGroup>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Direction</Label>
              <Select onValueChange={(e) => handleOnChanges({ target: { id: "flexDirection", value: e } })}>
                <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Direction</SelectLabel>
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
                <div className="flex flex-col gap-2 flex-1">
                  <Label>Hauteur</Label>
                  <Input id="height" placeholder="px" onChange={handleOnChanges} value={sel.styles.height as string ?? ""} />
                </div>
                <div className="flex flex-col gap-2 flex-1">
                  <Label>Largeur</Label>
                  <Input id="width" placeholder="px" onChange={handleOnChanges} value={sel.styles.width as string ?? ""} />
                </div>
              </div>
              <Label className="text-center text-xs text-muted-foreground">Marges (px)</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1"><Label className="text-xs">Haut</Label><Input id="marginTop" placeholder="px" onChange={handleOnChanges} value={sel.styles.marginTop as string ?? ""} /></div>
                <div className="flex flex-col gap-1"><Label className="text-xs">Bas</Label><Input id="marginBottom" placeholder="px" onChange={handleOnChanges} value={sel.styles.marginBottom as string ?? ""} /></div>
                <div className="flex flex-col gap-1"><Label className="text-xs">Gauche</Label><Input id="marginLeft" placeholder="px" onChange={handleOnChanges} value={sel.styles.marginLeft as string ?? ""} /></div>
                <div className="flex flex-col gap-1"><Label className="text-xs">Droite</Label><Input id="marginRight" placeholder="px" onChange={handleOnChanges} value={sel.styles.marginRight as string ?? ""} /></div>
              </div>
              <Label className="text-center text-xs text-muted-foreground">Rembourrage (px)</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1"><Label className="text-xs">Haut</Label><Input id="paddingTop" placeholder="px" onChange={handleOnChanges} value={sel.styles.paddingTop as string ?? ""} /></div>
                <div className="flex flex-col gap-1"><Label className="text-xs">Bas</Label><Input id="paddingBottom" placeholder="px" onChange={handleOnChanges} value={sel.styles.paddingBottom as string ?? ""} /></div>
                <div className="flex flex-col gap-1"><Label className="text-xs">Gauche</Label><Input id="paddingLeft" placeholder="px" onChange={handleOnChanges} value={sel.styles.paddingLeft as string ?? ""} /></div>
                <div className="flex flex-col gap-1"><Label className="text-xs">Droite</Label><Input id="paddingRight" placeholder="px" onChange={handleOnChanges} value={sel.styles.paddingRight as string ?? ""} /></div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </TooltipProvider>
  );
};

export default SettingsTab;
