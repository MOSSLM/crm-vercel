"use client";

import React from "react";
import { EyeOff } from "lucide-react";
import { useEditor } from "@/components/site-builder/use-editor";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/utils";
import EditorRecursive from "./editor-elements/EditorRecursive";

interface SiteEditorProps {
  pageId: string;
  liveMode?: boolean;
  leftPanelOpen?: boolean;
}

// Right sidebar: w-72 (288px content) + w-[58px] (58px icons) = 346px total
const SIDEBAR_WIDTH = 346;
// Left panel: w-64 = 256px
const LEFT_PANEL_WIDTH = 256;

const SiteEditor: React.FC<SiteEditorProps> = ({ pageId, liveMode, leftPanelOpen = true }) => {
  const { editor, dispatch, pageDetails } = useEditor();

  React.useEffect(() => {
    if (liveMode) {
      dispatch({ type: "TOGGLE_LIVE_MODE", payload: { value: true } });
    }
  }, [liveMode]);

  React.useEffect(() => {
    if (!pageDetails) return;
    let elements;
    try {
      elements = pageDetails.content ? JSON.parse(pageDetails.content) : undefined;
    } catch {
      elements = undefined;
    }
    dispatch({
      type: "LOAD_DATA",
      payload: { elements, withLive: !!liveMode },
    });
  }, [pageId]);

  const handleClickCanvas = () => {
    dispatch({ type: "CHANGE_CLICKED_ELEMENT", payload: {} });
  };

  const handleExitPreview = () => {
    dispatch({ type: "TOGGLE_LIVE_MODE" });
    dispatch({ type: "TOGGLE_PREVIEW_MODE" });
  };

  const isEditMode = !editor.editor.previewMode && !editor.editor.liveMode;
  const device = editor.editor.device;

  // ── PREVIEW / LIVE mode ──────────────────────────────────────────────────
  if (!isEditMode) {
    return (
      <div className="flex-1 h-full overflow-hidden relative bg-white" onClick={handleClickCanvas}>
        {editor.editor.previewMode && editor.editor.liveMode && (
          <Button
            variant="outline"
            size="icon"
            className="absolute top-4 left-4 z-[100]"
            onClick={handleExitPreview}
            title="Retour à l'éditeur"
          >
            <EyeOff className="w-4 h-4" />
          </Button>
        )}
        <div className="relative h-full w-full overflow-y-auto overflow-x-hidden">
          {Array.isArray(editor.editor.elements) &&
            editor.editor.elements.map((element) => (
              <EditorRecursive key={element.id} element={element} />
            ))}
        </div>
      </div>
    );
  }

  // ── EDIT mode: dark canvas with dotted grid background ───────────────────
  return (
    <div
      className="sb-animate-canvas flex-1 h-full overflow-auto relative"
      style={{
        backgroundColor: "#0f0f11",
        backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.10) 1px, transparent 1px)",
        backgroundSize: "20px 20px",
      }}
      onClick={handleClickCanvas}
    >
      {/* Padding wrapper — offsets content away from fixed panels */}
      <div
        className="min-h-full transition-[padding-left] duration-300 ease-in-out"
        style={{
          paddingLeft: leftPanelOpen ? LEFT_PANEL_WIDTH : 0,
          paddingRight: SIDEBAR_WIDTH,
        }}
      >
        <div className="py-10 px-6 min-h-full flex flex-col">
          {/* White page canvas */}
          <div
            className={cn(
              "mx-auto bg-white rounded-t-sm overflow-x-hidden flex-1",
              "min-h-[calc(100vh-73px)]",
              {
                "w-full max-w-[1200px]": device === "Desktop",
                "w-[850px]":            device === "Tablet",
                "w-[420px]":            device === "Mobile",
              }
            )}
            style={{
              boxShadow: "0 0 0 1px rgba(255,255,255,0.05), 0 32px 80px rgba(0,0,0,0.6), 0 8px 24px rgba(0,0,0,0.4)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {Array.isArray(editor.editor.elements) &&
              editor.editor.elements.map((element) => (
                <EditorRecursive key={element.id} element={element} />
              ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SiteEditor;
