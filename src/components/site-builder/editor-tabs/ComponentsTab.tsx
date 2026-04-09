"use client";

import React from "react";
import { Trash2, Package } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { ELEMENT_LAYOUT_PLACEHOLDERS, ELEMENT_PRIMITIVE_PLACEHOLDERS } from "@/components/site-builder/element-placeholders";
import { componentsApi } from "@/utils/siteBuilderApi";
import type { EditorBtns, EditorElement, SavedComponent } from "@/types";

const ComponentsTab: React.FC = () => {
  const [savedComponents, setSavedComponents] = React.useState<SavedComponent[]>([]);

  const loadComponents = React.useCallback(() => {
    componentsApi.fetchAll().then(setSavedComponents).catch(() => {});
  }, []);

  React.useEffect(() => {
    loadComponents();
    // Listen for save events from SettingsTab
    const handler = () => loadComponents();
    window.addEventListener("sb:componentSaved", handler);
    return () => window.removeEventListener("sb:componentSaved", handler);
  }, [loadComponents]);

  const handleDragStart = (e: React.DragEvent, type: EditorBtns) => {
    if (type === null) return;
    e.dataTransfer.setData("componentType", type as string);
  };

  const handleSavedDragStart = (e: React.DragEvent, component: SavedComponent) => {
    try {
      const element = JSON.parse(component.content) as EditorElement;
      e.dataTransfer.setData("componentType", "savedComponent");
      e.dataTransfer.setData("savedComponentContent", JSON.stringify(element));
    } catch {}
  };

  const handleDeleteComponent = async (id: string) => {
    await componentsApi.delete(id).catch(() => {});
    loadComponents();
  };

  return (
    <div className="px-4 py-6">
      <h3 className="text-sm font-semibold mb-4 text-foreground">Composants</h3>
      <Accordion type="multiple" defaultValue={["layout", "elements", "saved"]} className="w-full">

        <AccordionItem value="layout">
          <AccordionTrigger className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Mise en page
          </AccordionTrigger>
          <AccordionContent>
            <div className="grid grid-cols-2 gap-2 pt-2">
              {ELEMENT_LAYOUT_PLACEHOLDERS.map((item) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, item.id)}
                  className="cursor-grab active:cursor-grabbing"
                  title={item.label}
                >
                  {item.placeholder}
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="elements">
          <AccordionTrigger className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Éléments
          </AccordionTrigger>
          <AccordionContent>
            <div className="grid grid-cols-2 gap-2 pt-2">
              {ELEMENT_PRIMITIVE_PLACEHOLDERS.map((item) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, item.id)}
                  className="cursor-grab active:cursor-grabbing"
                  title={item.label}
                >
                  {item.placeholder}
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="saved">
          <AccordionTrigger className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Mes composants
          </AccordionTrigger>
          <AccordionContent>
            {savedComponents.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center text-muted-foreground">
                <Package className="w-6 h-6 opacity-40" />
                <p className="text-xs">Aucun composant sauvegardé.</p>
                <p className="text-[10px] opacity-60">Sélectionnez un élément dans le canvas et cliquez sur &quot;Sauvegarder&quot; dans l&apos;onglet Styles.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-1 pt-2">
                {savedComponents.map((comp) => (
                  <div
                    key={comp.id}
                    draggable
                    onDragStart={(e) => handleSavedDragStart(e, comp)}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 hover:bg-muted cursor-grab active:cursor-grabbing group"
                  >
                    <span className="text-xs font-medium truncate">{comp.name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 opacity-0 group-hover:opacity-100 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); handleDeleteComponent(comp.id); }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </AccordionContent>
        </AccordionItem>

      </Accordion>
    </div>
  );
};

export default ComponentsTab;
