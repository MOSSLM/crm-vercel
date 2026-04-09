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
  const [isDragOver, setIsDragOver] = React.useState(false);
  const hasChildren = Array.isArray(element.content) && element.content.length > 0;
  const isContainer = Array.isArray(element.content);

  const handleSelect = (e: React.MouseEvent) => {
    e.stopPropagation();
    dispatch({ type: "CHANGE_CLICKED_ELEMENT", payload: { elementDetails: element } });
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.stopPropagation();
    if (element.type === "__body") return;
    e.dataTransfer.setData("componentType", "canvasElement");
    e.dataTransfer.setData("canvasElementId", element.id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!isContainer) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const type = e.dataTransfer.getData("componentType");
    if (type === "canvasElement") {
      const elementId = e.dataTransfer.getData("canvasElementId");
      if (elementId && elementId !== element.id && isContainer) {
        dispatch({ type: "MOVE_ELEMENT", payload: { elementId, targetContainerId: element.id } });
      }
    }
  };

  return (
    <div
      draggable={element.type !== "__body"}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        className={cn(
          "flex items-center gap-1 py-1 px-2 rounded-md cursor-pointer text-sm hover:bg-muted transition-colors",
          {
            "bg-muted": editor.selectedElement.id === element.id,
            "ring-2 ring-blue-400 ring-inset": isDragOver && isContainer,
          }
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
      <div className="flex items-center gap-2 mb-2">
        <Layers className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Calques</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">Structure de la page. Glissez pour réorganiser.</p>
      <div className="space-y-0.5">
        {editor.elements.map((element) => (
          <LayerItem key={element.id} element={element} />
        ))}
      </div>
    </div>
  );
};

export default LayersTab;
