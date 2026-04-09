"use client";

import React from "react";
import { Trash } from "lucide-react";
import { useEditor } from "@/components/site-builder/use-editor";
import { Badge } from "@/components/ui/badge";
import EditorRecursive from "./EditorRecursive";
import { addVerifyElement } from "@/components/site-builder/add-element";
import { cn } from "@/components/ui/utils";
import type { EditorBtns, EditorElement } from "@/types";

interface EditorSectionProps {
  element: EditorElement;
}

const EditorSection: React.FC<EditorSectionProps> = ({ element }) => {
  const { content, id, styles } = element;
  const { dispatch, editor: editorState } = useEditor();
  const { editor } = editorState;

  const handleOnDrop = (event: React.DragEvent) => {
    event.stopPropagation();
    const componentType = event.dataTransfer.getData("componentType") as EditorBtns;
    addVerifyElement(componentType, id, dispatch);
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
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
      className={cn("relative p-4 transition-all w-full", {
        "!border-blue-500": editor.selectedElement.id === id && !editor.liveMode,
        "!border-solid": editor.selectedElement.id === id && !editor.liveMode,
        "!border-dashed !border": !editor.liveMode,
      })}
      onDragOver={handleDragOver}
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
