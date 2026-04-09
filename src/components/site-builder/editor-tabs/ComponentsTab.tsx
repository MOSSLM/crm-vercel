"use client";

import React from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ELEMENT_LAYOUT_PLACEHOLDERS, ELEMENT_PRIMITIVE_PLACEHOLDERS } from "@/components/site-builder/element-placeholders";
import type { EditorBtns } from "@/types";

const ComponentsTab: React.FC = () => {
  const handleDragStart = (e: React.DragEvent, type: EditorBtns) => {
    if (type === null) return;
    e.dataTransfer.setData("componentType", type);
  };

  return (
    <div className="px-4 py-6">
      <h3 className="text-sm font-semibold mb-4 text-foreground">Composants</h3>
      <Accordion type="multiple" defaultValue={["layout", "elements"]} className="w-full">
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
      </Accordion>
    </div>
  );
};

export default ComponentsTab;
