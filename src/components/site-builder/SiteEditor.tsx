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
}

const SiteEditor: React.FC<SiteEditorProps> = ({ pageId, liveMode }) => {
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

  return (
    <div
      className={cn(
        "flex-1 h-full overflow-y-auto overflow-x-hidden mr-[385px] bg-background transition-all",
        {
          "p-0 mr-0": editor.editor.previewMode || editor.editor.liveMode,
          "!w-[850px] !flex-none mx-auto": editor.editor.device === "Tablet",
          "!w-[420px] !flex-none mx-auto": editor.editor.device === "Mobile",
          "pb-[100px]": !editor.editor.previewMode && !editor.editor.liveMode,
        }
      )}
      onClick={handleClickCanvas}
    >
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

      {Array.isArray(editor.editor.elements) &&
        editor.editor.elements.map((element) => (
          <EditorRecursive key={element.id} element={element} />
        ))}
    </div>
  );
};

export default SiteEditor;
