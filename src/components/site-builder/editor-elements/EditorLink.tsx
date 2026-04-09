"use client";

import React from "react";
import { Trash } from "lucide-react";
import { useEditor } from "@/components/site-builder/use-editor";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/utils";
import type { EditorElement } from "@/types";
import { resolveResponsiveStyles } from "@/components/site-builder/style-system";

interface EditorLinkProps {
  element: EditorElement;
}

const EditorLink: React.FC<EditorLinkProps> = ({ element }) => {
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

  const href = !Array.isArray(element.content) ? element.content.href : "#";
  const innerText = !Array.isArray(element.content) ? element.content.innerText : "Link";

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
      className={cn("relative p-0.5 m-1 transition-all cursor-grab active:cursor-grabbing", {
        "border-blue-500 border-solid border": editor.selectedElement.id === element.id && !editor.liveMode,
        "border-dashed border": !editor.liveMode && editor.selectedElement.id !== element.id,
      })}
      onClick={handleClick}
    >
      {editor.selectedElement.id === element.id && !editor.liveMode && (
        <Badge className="absolute -top-6 -left-0.5 rounded-none rounded-t-md">
          {element.name}
        </Badge>
      )}
      {editor.liveMode ? (
        <a href={href} className="underline text-blue-500">
          {innerText}
        </a>
      ) : (
        <span
          contentEditable={!editor.liveMode}
          suppressContentEditableWarning
          className="outline-none underline text-blue-500 cursor-text"
          onBlur={(e) => {
            dispatch({
              type: "UPDATE_ELEMENT",
              payload: {
                elementDetails: {
                  ...element,
                  content: { ...(!Array.isArray(element.content) ? element.content : {}), innerText: (e.target as HTMLSpanElement).innerText },
                },
              },
            });
          }}
        >
          {innerText}
        </span>
      )}
      {editor.selectedElement.id === element.id && !editor.liveMode && (
        <div className="absolute bg-primary px-2.5 py-1 text-xs font-bold -top-[25px] -right-[1px] rounded-none rounded-t-lg !text-white">
          <Trash className="cursor-pointer w-4 h-4" onClick={handleDelete} />
        </div>
      )}
    </div>
  );
};

export default EditorLink;
