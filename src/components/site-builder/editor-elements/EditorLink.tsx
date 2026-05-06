"use client";

import React from "react";
import { Trash } from "lucide-react";
import { useEditor } from "@/components/site-builder/use-editor";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/utils";
import type { EditorElement } from "@/types";

interface EditorLinkProps {
  element: EditorElement;
}

const EditorLink: React.FC<EditorLinkProps> = ({ element }) => {
  const { dispatch, editor: editorState } = useEditor();
  const { editor } = editorState;
  const [dropPosition, setDropPosition] = React.useState<"before" | "after" | null>(null);
  const [isEditing, setIsEditing] = React.useState(false);

  const isSelected = editor.selectedElement.id === element.id && !editor.liveMode;
  const effectiveStyles = editor.wireframeMode ? {} : element.styles;

  const handleDelete = (event: React.MouseEvent) => {
    event.stopPropagation();
    dispatch({ type: "DELETE_ELEMENT", payload: { elementDetails: element } });
  };

  const handleClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    dispatch({ type: "CHANGE_CLICKED_ELEMENT", payload: { elementDetails: element } });
  };

  const simpleContent = !Array.isArray(element.content) && !("code" in element.content)
    ? element.content : {};
  const href = simpleContent.href ?? "#";
  const innerText = simpleContent.innerText ?? "Link";

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
      style={effectiveStyles}
      draggable={!editor.liveMode && !isEditing}
      onDragStart={handleDragStart}
      className={cn("relative p-0.5 m-1 transition-all", {
        "cursor-grab active:cursor-grabbing": !editor.liveMode && !isEditing,
        "outline outline-1 outline-dashed outline-border": !editor.liveMode && !isSelected,
        "border-t-2 border-blue-400": dropPosition === "before" && !editor.liveMode,
        "border-b-2 border-blue-400": dropPosition === "after" && !editor.liveMode,
      })}
      onClick={handleClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Rectangular selection ring — never inherits element border-radius */}
      {isSelected && (
        <div
          className="absolute inset-0 pointer-events-none z-10"
          style={{ boxShadow: "inset 0 0 0 2px rgb(59 130 246)" }}
        />
      )}

      {isSelected && (
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
          contentEditable
          suppressContentEditableWarning
          className="outline-none underline text-blue-500 cursor-text"
          onFocus={() => setIsEditing(true)}
          onBlur={(e) => {
            setIsEditing(false);
            dispatch({
              type: "UPDATE_ELEMENT",
              payload: {
                elementDetails: {
                  ...element,
                  content: {
                    ...(!Array.isArray(element.content) && !("code" in element.content) ? element.content : {}),
                    innerText: (e.target as HTMLSpanElement).innerText,
                  },
                },
              },
            });
          }}
        >
          {innerText}
        </span>
      )}
      {isSelected && (
        <div className="absolute bg-primary px-2.5 py-1 text-xs font-bold -top-[25px] -right-[1px] rounded-none rounded-t-lg !text-white z-20">
          <Trash className="cursor-pointer w-4 h-4" onClick={handleDelete} />
        </div>
      )}
    </div>
  );
};

export default EditorLink;
