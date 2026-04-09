"use client";

import React from "react";
import { Trash } from "lucide-react";
import { useEditor } from "@/components/site-builder/use-editor";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/utils";
import type { EditorElement } from "@/types";

interface EditorTextProps {
  element: EditorElement;
}

const EditorText: React.FC<EditorTextProps> = ({ element }) => {
  const { dispatch, editor: editorState } = useEditor();
  const { editor } = editorState;
  const [dropPosition, setDropPosition] = React.useState<"before" | "after" | null>(null);

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

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setDropPosition((event.clientY - rect.top) < rect.height / 2 ? "before" : "after");
  };

  const handleDragLeave = (event: React.DragEvent) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropPosition(null);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const componentType = event.dataTransfer.getData("componentType");
    if (componentType === "canvasElement") {
      const elementId = event.dataTransfer.getData("canvasElementId");
      if (elementId && elementId !== element.id) {
        dispatch({ type: "MOVE_ELEMENT", payload: { elementId, targetContainerId: element.id, position: dropPosition ?? "after" } });
      }
    }
    setDropPosition(null);
  };

  return (
    <div
      draggable={!editor.liveMode}
      onDragStart={handleDragStart}
      className={cn("p-0.5 w-full m-1 relative text-base min-h-7 transition-all cursor-grab active:cursor-grabbing", {
        "ring-2 ring-blue-500 ring-inset": editor.selectedElement.id === element.id && !editor.liveMode,
        "outline outline-1 outline-dashed outline-border": !editor.liveMode,
        "border-t-2 border-blue-400": dropPosition === "before" && !editor.liveMode,
        "border-b-2 border-blue-400": dropPosition === "after" && !editor.liveMode,
      })}
      style={element.styles}
      onClick={handleClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
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
        {!Array.isArray(element.content) && !('code' in element.content) && element.content.innerText}
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
