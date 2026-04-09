"use client";

import React from "react";
import { Trash } from "lucide-react";
import { useEditor } from "@/components/site-builder/use-editor";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/utils";
import type { EditorElement } from "@/types";
import { resolveResponsiveStyles } from "@/components/site-builder/style-system";

interface EditorTextProps {
  element: EditorElement;
}

const EditorText: React.FC<EditorTextProps> = ({ element }) => {
  const { dispatch, editor: editorState } = useEditor();
  const { editor } = editorState;

  const handleDelete = () => {
    dispatch({ type: "DELETE_ELEMENT", payload: { elementDetails: element } });
  };

  const handleClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    dispatch({ type: "CHANGE_CLICKED_ELEMENT", payload: { elementDetails: element } });
  };

  const handleDragStart = (event: React.DragEvent) => {
    if (editor.liveMode) return;
    event.stopPropagation();
    event.dataTransfer.setData("componentType", "canvasElement");
    event.dataTransfer.setData("canvasElementId", element.id);
  };

  return (
    <div
      draggable={!editor.liveMode}
      onDragStart={handleDragStart}
      className={cn("p-0.5 w-full m-1 relative text-base min-h-7 transition-all cursor-grab active:cursor-grabbing", {
        "border-blue-500 border-solid": editor.selectedElement.id === element.id,
        "border-dashed border": !editor.liveMode,
      })}
      style={resolveResponsiveStyles(element.styles, editor.device)}
      onClick={handleClick}
    >
      {editor.selectedElement.id === element.id && !editor.liveMode && (
        <Badge className="absolute -top-6 -left-0.5 rounded-none rounded-t-md">
          {editor.selectedElement.name}
        </Badge>
      )}
      <span
        contentEditable={!editor.liveMode}
        className="outline-none"
        suppressContentEditableWarning
        onBlur={(e) => {
          dispatch({
            type: "UPDATE_ELEMENT",
            payload: {
              elementDetails: {
                ...element,
                content: { innerText: (e.target as HTMLSpanElement).innerText },
              },
            },
          });
        }}
      >
        {!Array.isArray(element.content) && element.content.innerText}
      </span>
      {editor.selectedElement.id === element.id && !editor.liveMode && (
        <div className="absolute bg-primary px-2.5 py-1 text-xs font-bold -top-[25px] -right-[1px] rounded-none rounded-t-lg !text-white">
          <Trash className="cursor-pointer w-4 h-4" onClick={handleDelete} />
        </div>
      )}
    </div>
  );
};

export default EditorText;
