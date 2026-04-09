"use client";

import React from "react";
import { Trash } from "lucide-react";
import { useEditor } from "@/components/site-builder/use-editor";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/utils";
import type { EditorElement } from "@/types";
import { resolveResponsiveStyles } from "@/components/site-builder/style-system";

interface EditorVideoProps {
  element: EditorElement;
}

const EditorVideo: React.FC<EditorVideoProps> = ({ element }) => {
  const { dispatch, editor: editorState } = useEditor();
  const { editor } = editorState;

  const handleDelete = (event: React.MouseEvent) => {
    event.stopPropagation();
    dispatch({ type: "DELETE_ELEMENT", payload: { elementDetails: element } });
  };

  const handleClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    dispatch({ type: "CHANGE_CLICKED_ELEMENT", payload: { elementDetails: element } });
  };

  const src = !Array.isArray(element.content) ? element.content.src : "";

  const handleDragStart = (event: React.DragEvent) => {
    if (editor.liveMode) return;
    event.stopPropagation();
    event.dataTransfer.setData("componentType", "canvasElement");
    event.dataTransfer.setData("canvasElementId", element.id);
  };

  return (
    <div
      style={resolveResponsiveStyles(element.styles, editor.device)}
      draggable={!editor.liveMode}
      onDragStart={handleDragStart}
      className={cn("relative transition-all w-full aspect-video cursor-grab active:cursor-grabbing", {
        "border-blue-500 border-solid border": editor.selectedElement.id === element.id && !editor.liveMode,
        "border-dashed border": !editor.liveMode && editor.selectedElement.id !== element.id,
      })}
      onClick={handleClick}
    >
      {editor.selectedElement.id === element.id && !editor.liveMode && (
        <Badge className="absolute -top-6 -left-0.5 rounded-none rounded-t-md z-10">
          {element.name}
        </Badge>
      )}
      <iframe
        src={src}
        className="w-full h-full"
        allowFullScreen
        title="Video element"
      />
      {editor.selectedElement.id === element.id && !editor.liveMode && (
        <div className="absolute bg-primary px-2.5 py-1 text-xs font-bold -top-[25px] -right-[1px] rounded-none rounded-t-lg !text-white z-10">
          <Trash className="cursor-pointer w-4 h-4" onClick={handleDelete} />
        </div>
      )}
    </div>
  );
};

export default EditorVideo;
