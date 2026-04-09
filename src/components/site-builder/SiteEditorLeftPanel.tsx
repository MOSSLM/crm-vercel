"use client";

import React from "react";
import { ChevronLeft } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/components/site-builder/use-editor";
import LayersTab from "./editor-tabs/LayersTab";

interface SiteEditorLeftPanelProps {
  open: boolean;
  onClose: () => void;
}

const SiteEditorLeftPanel: React.FC<SiteEditorLeftPanelProps> = ({ open, onClose }) => {
  const { editor: editorState } = useEditor();
  const { editor } = editorState;

  if (editor.previewMode || editor.liveMode) return null;
  if (!open) return null;

  return (
    <aside
      className="sb-animate-sidebar-l fixed left-0 top-[53px] h-[calc(100vh-53px)] w-64 z-40 border-r border-border bg-background flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Calques</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onClose}
          title="Fermer le panneau"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Layers content */}
      <ScrollArea className="flex-1">
        <LayersTab />
      </ScrollArea>
    </aside>
  );
};

export default SiteEditorLeftPanel;
