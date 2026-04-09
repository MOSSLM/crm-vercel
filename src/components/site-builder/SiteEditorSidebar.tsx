"use client";

import React from "react";
import { PlusCircle, Settings, SquareStack } from "lucide-react";
import { useEditor } from "@/components/site-builder/use-editor";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import SettingsTab from "./editor-tabs/SettingsTab";
import ComponentsTab from "./editor-tabs/ComponentsTab";
import LayersTab from "./editor-tabs/LayersTab";

type TabsName = "Settings" | "Components" | "Layers";

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
        <div className="fixed right-0 top-[65px] h-[calc(100vh-65px)] flex z-20 border-l border-border bg-background">

          {/* Content panel */}
          <div className="w-80 overflow-hidden border-r border-border">
            <ScrollArea className="h-full">
              <TabsContent value="Settings" className="m-0 mt-0 focus-visible:outline-none focus-visible:ring-0">
                <SettingsTab />
              </TabsContent>
              <TabsContent value="Components" className="m-0 mt-0 focus-visible:outline-none focus-visible:ring-0">
                <ComponentsTab />
              </TabsContent>
              <TabsContent value="Layers" className="m-0 mt-0 focus-visible:outline-none focus-visible:ring-0">
                <LayersTab />
              </TabsContent>
            </ScrollArea>
          </div>

          {/* Icon strip */}
          <div className="w-16 flex flex-col items-center pt-4 gap-1 bg-background">
            <TabsList className="flex flex-col h-auto gap-1 bg-transparent p-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <TabsTrigger value="Settings" className="w-10 h-10 p-0 rounded-md data-[state=active]:bg-muted data-[state=active]:shadow-none">
                    <Settings className="h-5 w-5" />
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent side="left" sideOffset={8}><p>Styles</p></TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <TabsTrigger value="Components" className="w-10 h-10 p-0 rounded-md data-[state=active]:bg-muted data-[state=active]:shadow-none">
                    <PlusCircle className="h-5 w-5" />
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent side="left" sideOffset={8}><p>Composants</p></TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <TabsTrigger value="Layers" className="w-10 h-10 p-0 rounded-md data-[state=active]:bg-muted data-[state=active]:shadow-none">
                    <SquareStack className="h-5 w-5" />
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent side="left" sideOffset={8}><p>Calques</p></TooltipContent>
              </Tooltip>
            </TabsList>
          </div>

        </div>
      </Tabs>
    </TooltipProvider>
  );
};

export default SiteEditorSidebar;
