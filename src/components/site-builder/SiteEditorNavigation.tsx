"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { ArrowLeft, Clock, Eye, EyeOff, Laptop, PanelLeft, Redo2, Smartphone, Tablet, Undo2 } from "lucide-react";
import { useEditor } from "@/components/site-builder/use-editor";
import { sitePagesApi } from "@/utils/siteBuilderApi";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/utils";
import type { DeviceTypes } from "@/types";

interface SiteEditorNavigationProps {
  siteId: string;
  pageId: string;
  leftPanelOpen: boolean;
  onToggleLeftPanel: () => void;
}

const SiteEditorNavigation: React.FC<SiteEditorNavigationProps> = ({
  siteId,
  pageId,
  leftPanelOpen,
  onToggleLeftPanel,
}) => {
  const router = useRouter();
  const { editor, dispatch, pageDetails } = useEditor();
  const [isLoading, setIsLoading] = React.useState(false);

  React.useEffect(() => {
    dispatch({ type: "SET_PAGE_ID", payload: { pageId } });
  }, [pageId]);

  const handleBlurTitleChange = async (e: React.FocusEvent<HTMLInputElement>) => {
    if (!pageDetails || e.target.value === pageDetails.name) return;
    if (!e.target.value) { toast.error("Le titre ne peut pas être vide"); return; }
    try {
      await sitePagesApi.update(pageId, { name: e.target.value });
      toast.success("Titre sauvegardé");
      router.refresh();
    } catch {
      toast.error("Erreur lors de la sauvegarde du titre");
    }
  };

  const handlePreviewClick = () => {
    dispatch({ type: "TOGGLE_PREVIEW_MODE" });
    dispatch({ type: "TOGGLE_LIVE_MODE" });
  };

  const handleUndo = () => dispatch({ type: "UNDO" });
  const handleRedo = () => dispatch({ type: "REDO" });

  const handleSave = async () => {
    setIsLoading(true);
    const content = JSON.stringify(editor.editor.elements);
    try {
      await sitePagesApi.update(pageId, { content });
      dispatch({ type: "CLEAR_HISTORY" });
      toast.success("Page sauvegardée");
      router.refresh();
    } catch {
      toast.error("Erreur lors de la sauvegarde");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = React.useCallback((event: KeyboardEvent) => {
    if (event.key === "s" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); handleSave(); }
    else if (event.key === "z" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); handleUndo(); }
    else if (event.key === "y" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); handleRedo(); }
    else if (event.key === "p" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); handlePreviewClick(); }
  }, [editor]);

  React.useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const unsavedCount = Math.min(editor.history.history.length, 50);

  return (
    <TooltipProvider delayDuration={300}>
      <nav
        className={cn(
          "sb-animate-topbar border-b bg-background z-50 shrink-0",
          "grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 h-[53px] transition-all",
          {
            "h-0 p-0 overflow-hidden border-0": editor.editor.previewMode,
          }
        )}
      >
        {/* ── LEFT: toggle + back + title ─────────────────────────────── */}
        <div className="flex items-center gap-1 min-w-0">
          {/* Left panel toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn("h-8 w-8 shrink-0", { "bg-muted": leftPanelOpen })}
                onClick={onToggleLeftPanel}
              >
                <PanelLeft className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>{leftPanelOpen ? "Masquer" : "Afficher"} les calques</p></TooltipContent>
          </Tooltip>

          {/* Back */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Link href={`/site-builder/${siteId}`} className="shrink-0">
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
            </TooltipTrigger>
            <TooltipContent><p>Retour au site</p></TooltipContent>
          </Tooltip>

          {/* Separator */}
          <div className="w-px h-5 bg-border shrink-0" />

          {/* Page title + meta */}
          <div className="flex flex-col min-w-0 flex-1">
            <Input
              defaultValue={pageDetails?.name ?? ""}
              onBlur={handleBlurTitleChange}
              className="border-none h-6 m-0 p-0 text-sm font-medium rounded-sm truncate bg-transparent focus-visible:ring-0 focus-visible:bg-muted/50 focus-visible:px-1"
            />
            {pageDetails?.updated_at && (
              <span className="text-muted-foreground text-[10px] inline-flex items-center gap-1 leading-none">
                <Clock className="w-2.5 h-2.5 shrink-0" />
                <span className="truncate">{format(new Date(pageDetails.updated_at), "dd/MM HH:mm")}</span>
              </span>
            )}
          </div>
        </div>

        {/* ── CENTER: device switcher ──────────────────────────────────── */}
        <div className="flex items-center justify-center">
          <Tabs
            value={editor.editor.device}
            onValueChange={(value) => dispatch({ type: "CHANGE_DEVICE", payload: { device: value as DeviceTypes } })}
          >
            <TabsList className="flex gap-1 bg-transparent h-fit p-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <TabsTrigger value="Desktop" className="data-[state=active]:bg-muted w-8 h-8 p-0 rounded-md border border-input bg-background">
                    <Laptop className="w-3.5 h-3.5" />
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent><p>Bureau</p></TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <TabsTrigger value="Tablet" className="data-[state=active]:bg-muted w-8 h-8 p-0 rounded-md border border-input bg-background">
                    <Tablet className="w-3.5 h-3.5" />
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent><p>Tablette</p></TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <TabsTrigger value="Mobile" className="data-[state=active]:bg-muted w-8 h-8 p-0 rounded-md border border-input bg-background">
                    <Smartphone className="w-3.5 h-3.5" />
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent><p>Mobile</p></TooltipContent>
              </Tooltip>
            </TabsList>
          </Tabs>
        </div>

        {/* ── RIGHT: actions ───────────────────────────────────────────── */}
        <div className="flex items-center justify-end gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" onClick={handlePreviewClick} className="h-8 w-8">
                {editor.editor.previewMode ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>Aperçu (⌘P)</p></TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                disabled={editor.history.currentIndex <= 0}
                onClick={handleUndo}
                variant="outline"
                size="icon"
                className="h-8 w-8"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>Annuler (⌘Z)</p></TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                disabled={editor.history.currentIndex >= editor.history.history.length - 1}
                onClick={handleRedo}
                variant="outline"
                size="icon"
                className="h-8 w-8"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>Rétablir (⌘Y)</p></TooltipContent>
          </Tooltip>

          <Button
            onClick={handleSave}
            disabled={isLoading}
            className="h-8 px-3 text-xs shrink-0"
          >
            {isLoading ? "…" : `Sauver${unsavedCount > 1 ? ` (${unsavedCount})` : ""}`}
          </Button>
        </div>
      </nav>
    </TooltipProvider>
  );
};

export default SiteEditorNavigation;
