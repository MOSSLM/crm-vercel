"use client";

import React from "react";
import { Bookmark, Check, MousePointerClick } from "lucide-react";
import { useEditor } from "@/components/site-builder/use-editor";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { componentsApi } from "@/utils/siteBuilderApi";

import TypographySection from "@/components/site-builder/settings-sections/TypographySection";
import AppearanceSection from "@/components/site-builder/settings-sections/AppearanceSection";
import PositionSection from "@/components/site-builder/settings-sections/PositionSection";
import LayoutSection from "@/components/site-builder/settings-sections/LayoutSection";
import SizeSection from "@/components/site-builder/settings-sections/SizeSection";
import CustomCodeSection from "@/components/site-builder/settings-sections/CustomCodeSection";

const SettingsTab: React.FC = () => {
  const { editor, dispatch } = useEditor();
  const [showSave, setShowSave] = React.useState(false);
  const [compName, setCompName] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  const sel = editor.editor.selectedElement;
  const content = !Array.isArray(sel.content) ? sel.content : {};

  const handleSaveComponent = async () => {
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
          ...sel,
          content: {
            ...(!Array.isArray(sel.content) ? sel.content : {}),
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
          ...sel,
          styles: { ...sel.styles, [e.target.id]: e.target.value },
        },
      },
    });
  };

  // ── No selection state ────────────────────────────────────────────────────
  if (!sel.id) {
    return (
      <div className="px-4 py-6 flex flex-col items-center gap-3 text-center mt-16">
        <MousePointerClick className="w-7 h-7 text-muted-foreground opacity-40" />
        <div>
          <p className="text-sm font-medium text-foreground">Aucun élément sélectionné</p>
          <p className="text-xs text-muted-foreground mt-1">Cliquez sur un élément du canvas</p>
        </div>
      </div>
    );
  }

  // ── Open accordion panels ─────────────────────────────────────────────────
  const defaultOpen = ["Styles", "Size", "Position", "Layout"];
  if (sel.type === "customCode") defaultOpen.push("CustomCode");
  if (sel.type === "link" || sel.type === "image" || sel.type === "video") defaultOpen.push("Custom");

  return (
    <div>
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-border">
        <p className="text-xs font-semibold text-foreground truncate">{sel.name || sel.type}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">{sel.type}</p>
      </div>

      {/* Save as component */}
      {sel.type && sel.type !== "__body" && (
        <div className="px-4 py-3 border-b border-border">
          {!showSave ? (
            <Button variant="outline" size="sm" className="w-full gap-2 text-xs h-8" onClick={() => setShowSave(true)}>
              <Bookmark className="w-3.5 h-3.5" />
              Sauvegarder comme composant
            </Button>
          ) : (
            <div className="flex flex-col gap-2">
              <Label className="text-xs">Nom du composant</Label>
              <div className="flex gap-2">
                <Input
                  value={compName} onChange={(e) => setCompName(e.target.value)}
                  placeholder="Hero Section" className="h-8 text-xs"
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

      {/* Accordion sections */}
      <Accordion type="multiple" defaultValue={defaultOpen} className="w-full">

        {/* Custom properties: link / video / image */}
        {(sel.type === "link" || sel.type === "video" || sel.type === "image") && (
          <AccordionItem value="Custom" className="px-4 py-0">
            <AccordionTrigger className="!no-underline py-3">
              <span className="text-xs font-medium">Propriétés</span>
            </AccordionTrigger>
            <AccordionContent className="flex flex-col gap-3 pb-4">
              {sel.type === "link" && (
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">URL du lien</Label>
                  <Input id="href" placeholder="https://example.com" className="h-8 text-xs"
                    onChange={handleChangeCustomValues} value={(content as { href?: string }).href ?? ""} />
                </div>
              )}
              {sel.type === "video" && (
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">URL de la vidéo</Label>
                  <Input id="src" placeholder="https://www.youtube.com/embed/..." className="h-8 text-xs"
                    onChange={handleChangeCustomValues} value={(content as { src?: string }).src ?? ""} />
                </div>
              )}
              {sel.type === "image" && (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">URL de l&apos;image</Label>
                    <Input id="src" placeholder="https://example.com/image.jpg" className="h-8 text-xs"
                      onChange={handleChangeCustomValues} value={(content as { src?: string }).src ?? ""} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">Description (alt)</Label>
                    <Input id="alt" placeholder="Description de l'image" className="h-8 text-xs"
                      onChange={handleChangeCustomValues} value={(content as { alt?: string }).alt ?? ""} />
                  </div>
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        )}

        {/* Custom Code props + schema + code editor */}
        {sel.type === "customCode" && (
          <CustomCodeSection sel={sel} dispatch={dispatch} />
        )}

        {/* Style sections */}
        <TypographySection styles={sel.styles} onChange={handleOnChanges} />
        <AppearanceSection styles={sel.styles} onChange={handleOnChanges} />
        <PositionSection   styles={sel.styles} onChange={handleOnChanges} />
        <LayoutSection     styles={sel.styles} onChange={handleOnChanges} />
        <SizeSection       styles={sel.styles} onChange={handleOnChanges} />

      </Accordion>
    </div>
  );
};

export default SettingsTab;
