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
  const [dropPosition, setDropPosition] = React.useState<"inside" | "before" | "after" | null>(null);

  const isSelected = editor.selectedElement.id === id && !editor.liveMode;
  const effectiveStyles = editor.wireframeMode ? {} : styles;

  const handleOnDrop = (event: React.DragEvent) => {
    event.stopPropagation();
    const position = dropPosition ?? "inside";
    setDropPosition(null);
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
        dispatch({ type: "MOVE_ELEMENT", payload: { elementId, targetContainerId: id, position } });
      }
      return;
    }

    if (position !== "inside") return;
    addVerifyElement(componentType, id, dispatch);
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const offsetY = event.clientY - rect.top;
    const third = rect.height / 3;
    if (offsetY < third) setDropPosition("before");
    else if (offsetY > third * 2) setDropPosition("after");
    else setDropPosition("inside");
  };

  const handleDragLeave = (event: React.DragEvent) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
      setDropPosition(null);
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
      style={effectiveStyles}
      draggable={!editor.liveMode}
      onDragStart={handleDragStart}
      className={cn("relative p-4 transition-all w-full cursor-grab active:cursor-grabbing", {
        "ring-2 ring-blue-400 ring-inset bg-blue-50/10": dropPosition === "inside" && !editor.liveMode,
        "border-t-2 border-blue-400": dropPosition === "before" && !editor.liveMode,
        "border-b-2 border-blue-400": dropPosition === "after" && !editor.liveMode,
        "outline outline-1 outline-dashed outline-border": !editor.liveMode && !isSelected,
      })}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleOnDrop}
      onClick={handleOnClick}
    >
      {/* Rectangular selection ring — never inherits element border-radius */}
      {isSelected && (
        <div
          className="absolute inset-0 pointer-events-none z-10"
          style={{ boxShadow: "inset 0 0 0 2px rgb(59 130 246)" }}
        />
      )}

      <Badge
        className={cn("absolute -top-6 -left-0.5 rounded-none rounded-t-md hidden", {
          block: isSelected,
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

      {isSelected && (
        <div className="absolute bg-primary px-2.5 py-1 text-xs font-bold -top-[25px] -right-[1px] rounded-none rounded-t-lg !text-white z-20">
          <Trash className="cursor-pointer w-4 h-4" onClick={handleDelete} />
        </div>
      )}
    </section>
  );
};

export default EditorSection;
