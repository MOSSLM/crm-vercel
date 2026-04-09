"use client";

import React from "react";
import { PlusCircle, Settings } from "lucide-react";
import { useEditor } from "@/components/site-builder/use-editor";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import SettingsTab from "./editor-tabs/SettingsTab";
import ComponentsTab from "./editor-tabs/ComponentsTab";

type TabsName = "Settings" | "Components";

const SiteEditorSidebar: React.FC = () => {
  const { editor } = useEditor();

  const getDefaultTab = (): TabsName => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("site-builder-tab") as TabsName) || "Settings";
    }
    return "Settings";
  };

  const handleSaveTab = (tab: string) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("site-builder-tab", tab);
    }
  };

  if (editor.editor.previewMode || editor.editor.liveMode) return null;

  return (
    <TooltipProvider delayDuration={300}>
      <Tabs defaultValue={getDefaultTab()} onValueChange={handleSaveTab}>
        {/* Fixed sidebar: content panel (left) + icon strip (right) */}
        <div className="sb-animate-sidebar-r fixed right-0 top-[53px] h-[calc(100vh-53px)] flex z-50 border-l border-border bg-background">

          {/* Content panel */}
          <div className="w-72 overflow-hidden border-r border-border">
            <ScrollArea className="h-full">
              <TabsContent value="Settings" className="m-0 mt-0 focus-visible:outline-none focus-visible:ring-0">
                <SettingsTab />
              </TabsContent>
              <TabsContent value="Components" className="m-0 mt-0 focus-visible:outline-none focus-visible:ring-0">
                <ComponentsTab />
              </TabsContent>
            </ScrollArea>
          </div>

          {/* Icon strip */}
          <div className="w-[58px] flex flex-col items-center pt-3 bg-background border-l border-border">
            <TabsList className="flex flex-col items-center h-auto gap-2 bg-transparent p-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <TabsTrigger
                    value="Settings"
                    className="w-9 h-9 p-0 rounded-md data-[state=active]:bg-muted data-[state=active]:shadow-none"
                  >
                    <Settings className="h-4 w-4" />
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent side="left" sideOffset={8}><p>Styles</p></TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <TabsTrigger
                    value="Components"
                    className="w-9 h-9 p-0 rounded-md data-[state=active]:bg-muted data-[state=active]:shadow-none"
                  >
                    <PlusCircle className="h-4 w-4" />
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent side="left" sideOffset={8}><p>Composants</p></TooltipContent>
              </Tooltip>
            </TabsList>
          </div>

        </div>
      </Tabs>
    </TooltipProvider>
  );
};

export default SiteEditorSidebar;
