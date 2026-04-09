"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { ArrowLeftCircle, Clock, Eye, Laptop, Redo2, Smartphone, Tablet, Undo2 } from "lucide-react";
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
}

const SiteEditorNavigation: React.FC<SiteEditorNavigationProps> = ({ siteId, pageId }) => {
  const router = useRouter();
  const { editor, dispatch, pageDetails } = useEditor();
  const [isLoading, setIsLoading] = React.useState(false);

  React.useEffect(() => {
    dispatch({ type: "SET_PAGE_ID", payload: { pageId } });
  }, [pageId]);

  const handleBlurTitleChange = async (e: React.FocusEvent<HTMLInputElement>) => {
    if (!pageDetails || e.target.value === pageDetails.name) return;
    if (!e.target.value) {
      toast.error("Le titre ne peut pas être vide");
      return;
    }
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

  return (
    <TooltipProvider delayDuration={300}>
      <nav
        className={cn("border-b flex items-center justify-between px-6 py-3 gap-2 transition-all bg-background z-50", {
          "h-0 p-0 overflow-hidden": editor.editor.previewMode,
        })}
      >
        {/* Left: back + page info */}
        <aside className="flex items-center gap-3 max-w-[280px] w-full">
          <Link href={`/site-builder/${siteId}`}>
            <ArrowLeftCircle className="h-5 w-5 text-muted-foreground hover:text-foreground transition-colors" aria-label="Retour" />
          </Link>
          <div className="flex flex-col w-full min-w-0">
            <Input
              defaultValue={pageDetails?.name ?? ""}
              onBlur={handleBlurTitleChange}
              className="border-none h-7 m-0 p-0 text-sm font-medium rounded-sm truncate"
            />
            {pageDetails?.path_name && (
              <div className="text-xs text-muted-foreground truncate">/{pageDetails.path_name}</div>
            )}
            {pageDetails?.updated_at && (
              <span className="text-muted-foreground text-[10px] inline-flex items-center gap-1 mt-0.5">
                <Clock className="w-3 h-3" />
                {format(new Date(pageDetails.updated_at), "dd/MM/yyyy HH:mm")}
              </span>
            )}
          </div>
        </aside>

        {/* Center: device switcher */}
        <aside>
          <Tabs
            defaultValue="Desktop"
            value={editor.editor.device}
            onValueChange={(value) => dispatch({ type: "CHANGE_DEVICE", payload: { device: value as DeviceTypes } })}
          >
            <TabsList className="grid w-full grid-cols-3 gap-x-2 bg-transparent h-fit">
              <Tooltip>
                <TooltipTrigger>
                  <TabsTrigger value="Desktop" className="data-[state=active]:bg-muted w-9 h-9 p-0 border border-input bg-background">
                    <Laptop className="w-4 h-4" />
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent><p>Bureau</p></TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger>
                  <TabsTrigger value="Tablet" className="data-[state=active]:bg-muted w-9 h-9 p-0 border border-input bg-background">
                    <Tablet className="w-4 h-4" />
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent><p>Tablette</p></TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger>
                  <TabsTrigger value="Mobile" className="data-[state=active]:bg-muted w-9 h-9 p-0 border border-input bg-background">
                    <Smartphone className="w-4 h-4" />
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent><p>Mobile</p></TooltipContent>
              </Tooltip>
            </TabsList>
          </Tabs>
        </aside>

        {/* Right: actions */}
        <aside className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" onClick={handlePreviewClick} className="h-9 w-9">
                <Eye className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>Aperçu (⌘P)</p></TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button disabled={editor.history.currentIndex <= 0} onClick={handleUndo} variant="outline" size="icon" className="h-9 w-9">
                <Undo2 className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>Annuler (⌘Z)</p></TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button disabled={editor.history.currentIndex >= editor.history.history.length - 1} onClick={handleRedo} variant="outline" size="icon" className="h-9 w-9">
                <Redo2 className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>Rétablir (⌘Y)</p></TooltipContent>
          </Tooltip>
          <Button onClick={handleSave} disabled={isLoading} className="h-9 px-4 text-sm">
            {isLoading ? "..." : `Sauvegarder${editor.history.history.length > 1 ? ` (${Math.min(editor.history.history.length, 50)})` : ""}`}
          </Button>
        </aside>
      </nav>
    </TooltipProvider>
  );
};

export default SiteEditorNavigation;
