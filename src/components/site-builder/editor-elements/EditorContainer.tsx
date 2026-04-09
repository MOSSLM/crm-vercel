"use client";

import React from "react";
import { Trash, MousePointerClick } from "lucide-react";
import { useEditor } from "@/components/site-builder/use-editor";
import { Badge } from "@/components/ui/badge";
import EditorRecursive from "./EditorRecursive";
import { addVerifyElement, reinstantiateWithNewIds } from "@/components/site-builder/add-element";
import { cn } from "@/components/ui/utils";
import type { EditorBtns, EditorElement } from "@/types";

interface EditorContainerProps {
  element: EditorElement;
}

const EditorContainer: React.FC<EditorContainerProps> = ({ element }) => {
  const { content, id, styles, type } = element;
  const { dispatch, editor: editorState } = useEditor();
  const { editor } = editorState;
  const [dropPosition, setDropPosition] = React.useState<"inside" | "before" | "after" | null>(null);

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
    if (editor.liveMode || type === "__body") return;
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

  const isEmpty = Array.isArray(content) && content.length === 0;

  return (
    <div
      style={styles}
      draggable={!editor.liveMode && type !== "__body"}
      onDragStart={handleDragStart}
      className={cn(
        "relative p-4 transition-all group",
        {
          "max-w-full w-full": type === "container" || type === "2Col" || type === "3Col",
          "h-fit": type === "container",
          "h-full w-full overflow-y-auto overflow-x-hidden": type === "__body",
          "flex flex-col md:!flex-row gap-4": type === "2Col" || type === "3Col",
          "!mb-[200px]": !editor.liveMode && !editor.previewMode && type === "__body",
          // selection
          "ring-2 ring-blue-500 ring-inset":
            editor.selectedElement.id === id && !editor.liveMode && editor.selectedElement.type !== "__body",
          "ring-4 ring-yellow-400 ring-inset":
            editor.selectedElement.id === id && !editor.liveMode && editor.selectedElement.type === "__body",
          // drag-over
          "ring-2 ring-blue-400 ring-inset bg-blue-50/10": dropPosition === "inside" && !editor.liveMode,
          "border-t-2 border-blue-400": dropPosition === "before" && !editor.liveMode,
          "border-b-2 border-blue-400": dropPosition === "after" && !editor.liveMode,
          // edit mode borders
          "outline outline-1 outline-dashed outline-border": !editor.liveMode && editor.selectedElement.id !== id,
          "cursor-grab active:cursor-grabbing": !editor.liveMode && type !== "__body",
        }
      )}
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

      {/* Empty body hint */}
      {isEmpty && type === "__body" && !editor.liveMode && (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-3 text-muted-foreground select-none pointer-events-none">
          <MousePointerClick className="w-8 h-8 opacity-30" />
          <p className="text-sm font-medium">Glissez des composants ici</p>
          <p className="text-xs opacity-50">Ouvrez l&apos;onglet Composants →</p>
        </div>
      )}

      {/* Empty container hint */}
      {isEmpty && type !== "__body" && !editor.liveMode && (
        <div className="flex items-center justify-center min-h-[60px] text-[10px] text-muted-foreground/50 select-none pointer-events-none">
          Déposez un élément
        </div>
      )}

      {Array.isArray(content) && content.map((child) => (
        <EditorRecursive key={child.id} element={child} />
      ))}

      {editor.selectedElement.id === element.id && !editor.liveMode && editor.selectedElement.type !== "__body" && (
        <div className="absolute bg-primary px-2.5 py-1 text-xs font-bold -top-[25px] -right-[1px] rounded-none rounded-t-lg !text-white">
          <Trash className="cursor-pointer w-4 h-4" onClick={handleDelete} />
        </div>
      )}
    </div>
  );
};

export default EditorContainer;
