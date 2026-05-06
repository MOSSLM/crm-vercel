"use client";

import React from "react";
import { Code2, Trash } from "lucide-react";
import { useEditor } from "@/components/site-builder/use-editor";
import { cn } from "@/components/ui/utils";
import type { EditorElement, CustomCodeContent } from "@/types";

interface Props {
  element: EditorElement;
}

function isCustomCodeContent(c: unknown): c is CustomCodeContent {
  return typeof c === "object" && c !== null && !Array.isArray(c) && "code" in c;
}

function interpolate(code: string, propValues: Record<string, string>): string {
  return code.replace(/\{\{(\w+)\}\}/g, (_, key) => propValues[key] ?? "");
}

const EditorCustomCode: React.FC<Props> = ({ element }) => {
  const { dispatch, editor: editorState } = useEditor();
  const { editor } = editorState;
  const isSelected = editor.selectedElement.id === element.id && !editor.liveMode;
  const content = isCustomCodeContent(element.content) ? element.content : null;
  const effectiveStyles = editor.wireframeMode ? {} : element.styles;

  const handleSelect = (e: React.MouseEvent) => {
    e.stopPropagation();
    dispatch({ type: "CHANGE_CLICKED_ELEMENT", payload: { elementDetails: element } });
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    dispatch({ type: "DELETE_ELEMENT", payload: { elementDetails: element } });
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.stopPropagation();
    e.dataTransfer.setData("componentType", "canvasElement");
    e.dataTransfer.setData("canvasElementId", element.id);
  };

  // ── LIVE / PREVIEW MODE ──────────────────────────────────────────────────
  if (editor.liveMode) {
    if (!content) return null;
    const html = interpolate(content.code, content.propValues ?? {});
    const hasScript = /<script[\s>]/i.test(html);
    if (hasScript) {
      const srcdoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box;margin:0;padding:0}</style></head><body>${html}</body></html>`;
      return (
        <iframe
          srcDoc={srcdoc}
          style={{ ...element.styles, border: "none", display: "block" }}
          sandbox="allow-scripts"
          title={element.name}
        />
      );
    }
    return (
      <div
        style={element.styles}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  // ── EDIT MODE ──────────────────────────────────────────────────────
  const propCount = (() => {
    try {
      if (!content?.schema) return 0;
      return Object.keys(JSON.parse(content.schema)).length;
    } catch {
      return 0;
    }
  })();

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onClick={handleSelect}
      style={effectiveStyles}
      className={cn(
        "relative cursor-pointer select-none transition-all group",
        "outline outline-1 outline-dashed outline-border",
      )}
    >
      {/* Rectangular selection ring — never inherits element border-radius */}
      {isSelected && (
        <div
          className="absolute inset-0 pointer-events-none z-10"
          style={{ boxShadow: "inset 0 0 0 2px rgb(59 130 246)" }}
        />
      )}

      {/* Selection badge + delete */}
      {isSelected && (
        <div className="absolute -top-6 left-0 flex items-center gap-1 z-[100]">
          <span className="bg-primary text-primary-foreground text-[10px] font-medium px-2 py-0.5 rounded-t-md flex items-center gap-1">
            <Code2 className="w-3 h-3" />
            {element.name}
          </span>
          <button
            onClick={handleDelete}
            className="bg-destructive text-destructive-foreground text-[10px] px-1.5 py-0.5 rounded-t-md hover:opacity-80 transition-opacity"
            title="Supprimer"
          >
            <Trash className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Placeholder content */}
      <div className="flex flex-col items-center justify-center gap-2 py-8 px-4 min-h-[80px]">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Code2 className="w-6 h-6 opacity-40" />
          <span className="text-sm font-medium opacity-60">{element.name}</span>
        </div>
        {propCount > 0 && (
          <span className="text-[10px] text-muted-foreground opacity-50 bg-muted px-2 py-0.5 rounded-full">
            {propCount} prop{propCount > 1 ? "s" : ""}
          </span>
        )}
        <span className="text-[10px] text-muted-foreground opacity-40">
          Visible en aperçu
        </span>
      </div>
    </div>
  );
};

export default EditorCustomCode;
