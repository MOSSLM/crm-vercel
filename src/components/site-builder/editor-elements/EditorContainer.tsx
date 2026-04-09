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
        } catch {}
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
      className={cn(
        "relative p-4 transition-all group",
        {
          "max-w-full w-full": type === "container" || type === "2Col" || type === "3Col",
          "h-fit": type === "container",
          "h-full w-full overflow-y-auto overflow-x-hidden": type === "__body",
          "flex flex-col md:!flex-row gap-4": type === "2Col" || type === "3Col",
          // selection states
          "!border-blue-500 !border-solid border":
            editor.selectedElement.id === id && !editor.liveMode && editor.selectedElement.type !== "__body",
          "!border-yellow-400 border-4 !border-solid":
            editor.selectedElement.id === id && !editor.liveMode && editor.selectedElement.type === "__body",
          "!mb-[100px]": !editor.liveMode && !editor.previewMode && type === "__body",
          // drag-over highlight
          "!border-blue-400 !border-2 !border-solid bg-blue-50/10": isDragOver && !editor.liveMode,
          // edit mode borders
          "border-dashed border": !editor.liveMode && editor.selectedElement.id !== id,
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
