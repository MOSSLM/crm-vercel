"use client";

import React from "react";
import { ChevronRight, Layers } from "lucide-react";
import { useEditor } from "@/components/site-builder/use-editor";
import { cn } from "@/components/ui/utils";
import type { EditorElement } from "@/types";

interface LayerItemProps {
  element: EditorElement;
  depth?: number;
}

const LayerItem: React.FC<LayerItemProps> = ({ element, depth = 0 }) => {
  const { dispatch, editor: editorState } = useEditor();
  const { editor } = editorState;
  const [open, setOpen] = React.useState(true);
  const hasChildren = Array.isArray(element.content) && element.content.length > 0;

  const handleSelect = () => {
    dispatch({ type: "CHANGE_CLICKED_ELEMENT", payload: { elementDetails: element } });
  };

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 py-1 px-2 rounded-md cursor-pointer text-sm hover:bg-muted transition-colors",
          { "bg-muted": editor.selectedElement.id === element.id }
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={handleSelect}
      >
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", { "rotate-90": open })} />
          </button>
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <span className="truncate text-xs text-foreground">{element.name || element.type}</span>
        {element.type && (
          <span className="ml-auto text-[10px] text-muted-foreground shrink-0">{element.type}</span>
        )}
      </div>
      {hasChildren && open && Array.isArray(element.content) && (
        <div>
          {element.content.map((child) => (
            <LayerItem key={child.id} element={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

const LayersTab: React.FC = () => {
  const { editor: editorState } = useEditor();
  const { editor } = editorState;

  return (
    <div className="px-4 py-6">
      <div className="flex items-center gap-2 mb-4">
        <Layers className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Calques</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">Structure en arbre de la page.</p>
      <div className="space-y-0.5">
        {editor.elements.map((element) => (
          <LayerItem key={element.id} element={element} />
        ))}
      </div>
    </div>
  );
};

export default LayersTab;
