"use client";

import React from "react";
import { Trash } from "lucide-react";
import { useEditor } from "@/components/site-builder/use-editor";
import { Badge } from "@/components/ui/badge";
import EditorRecursive from "./EditorRecursive";
import { addVerifyElement, reinstantiateWithNewIds } from "@/components/site-builder/add-element";
import { cn } from "@/components/ui/utils";
import type { EditorBtns, EditorElement } from "@/types";

interface EditorSectionProps {
  element: EditorElement;
}

const EditorSection: React.FC<EditorSectionProps> = ({ element }) => {
  const { content, id, styles } = element;
  const { dispatch, editor: editorState } = useEditor();
  const { editor } = editorState;
  const [isDragOver, setIsDragOver] = React.useState(false);

  const handleOnDrop = (event: React.DragEvent) => {
    event.stopPropagation();
    setIsDragOver(false);
    const componentType = event.dataTransfer.getData("componentType") as EditorBtns;

    if (componentType === "savedComponent") {
      const json = event.dataTransfer.getData("savedComponentContent");
      if (json) {
        try {
          const el = JSON.parse(json) as EditorElement;
          dispatch({ type: "ADD_ELEMENT", payload: { containerId: id, elementDetails: reinstantiateWithNewIds(el) } });
        } catch { /* ignore */ }
      }
      return;
    }

    if (componentType === "canvasElement") {
      const elementId = event.dataTransfer.getData("canvasElementId");
      if (elementId && elementId !== id) {
        dispatch({ type: "MOVE_ELEMENT", payload: { elementId, targetContainerId: id } });
      }
      return;
    }

    addVerifyElement(componentType, id, dispatch);
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };

  const handleDragStart = (event: React.DragEvent) => {
    if (editor.liveMode) return;
    event.stopPropagation();
    event.dataTransfer.setData("componentType", "canvasElement");
    event.dataTransfer.setData("canvasElementId", id);
  };

  const handleOnClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    dispatch({ type: "CHANGE_CLICKED_ELEMENT", payload: { elementDetails: element } });
  };

  const handleDelete = (event: React.MouseEvent) => {
    event.stopPropagation();
    dispatch({ type: "DELETE_ELEMENT", payload: { elementDetails: element } });
  };

  return (
    <section
      style={styles}
      draggable={!editor.liveMode}
      onDragStart={handleDragStart}
      className={cn("relative p-4 transition-all w-full cursor-grab active:cursor-grabbing", {
        "!border-blue-500 !border-solid border": editor.selectedElement.id === id && !editor.liveMode,
        "!border-blue-400 !border-2 !border-solid bg-blue-50/10": isDragOver && !editor.liveMode,
        "border-dashed border": !editor.liveMode && editor.selectedElement.id !== id,
      })}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleOnDrop}
      onClick={handleOnClick}
    >
      <Badge
        className={cn("absolute -top-6 -left-0.5 rounded-none rounded-t-md hidden", {
          block: editor.selectedElement.id === element.id && !editor.liveMode,
        })}
      >
        {element.name}
      </Badge>

      {Array.isArray(content) && content.length === 0 && !editor.liveMode && (
        <div className="flex items-center justify-center min-h-[60px] text-[10px] text-muted-foreground/50 select-none pointer-events-none">
          Déposez un élément
        </div>
      )}

      {Array.isArray(content) && content.map((child) => (
        <EditorRecursive key={child.id} element={child} />
      ))}

      {editor.selectedElement.id === element.id && !editor.liveMode && (
        <div className="absolute bg-primary px-2.5 py-1 text-xs font-bold -top-[25px] -right-[1px] rounded-none rounded-t-lg !text-white">
          <Trash className="cursor-pointer w-4 h-4" onClick={handleDelete} />
        </div>
      )}
    </section>
  );
};

export default EditorSection;
