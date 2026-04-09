"use client";

import React from "react";
import { PlusCircle, Settings, SquareStack } from "lucide-react";
import { useEditor } from "@/components/site-builder/use-editor";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/components/ui/utils";
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

  return (
    <TooltipProvider delayDuration={300}>
      <Sheet open modal={false}>
        <Tabs
          className="w-full"
          defaultValue={getDefaultTab()}
          onValueChange={handleSaveTab}
        >
          {/* Icon bar */}
          <SheetContent
            showClose={false}
            side="right"
            className={cn(
              "mt-[65px] w-16 z-[80] shadow-none p-0 focus:border-none transition-all overflow-hidden",
              { hidden: editor.editor.previewMode }
            )}
          >
            <TabsList className="flex items-center flex-col justify-start w-full bg-transparent h-fit gap-2 pt-4">
              <Tooltip>
                <TooltipTrigger>
                  <TabsTrigger value="Settings" className="w-10 h-10 p-0 data-[state=active]:bg-muted">
                    <Settings className="h-5 w-5" />
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent side="left" sideOffset={16}><p>Styles</p></TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger>
                  <TabsTrigger value="Components" className="data-[state=active]:bg-muted w-10 h-10 p-0">
                    <PlusCircle className="h-5 w-5" />
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent side="left" sideOffset={16}><p>Composants</p></TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger>
                  <TabsTrigger value="Layers" className="w-10 h-10 p-0 data-[state=active]:bg-muted">
                    <SquareStack className="h-5 w-5" />
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent side="left" sideOffset={16}><p>Calques</p></TooltipContent>
              </Tooltip>
            </TabsList>
          </SheetContent>

          {/* Panel content */}
          <SheetContent
            showClose={false}
            side="right"
            className={cn(
              "mt-[65px] w-80 z-[40] shadow-none p-0 mr-16 bg-background h-full transition-all overflow-hidden",
              { hidden: editor.editor.previewMode }
            )}
          >
            <div className="grid gap-4 h-full pb-28">
              <ScrollArea>
                <TabsContent value="Settings">
                  <SettingsTab />
                </TabsContent>
                <TabsContent value="Components">
                  <ComponentsTab />
                </TabsContent>
                <TabsContent value="Layers">
                  <LayersTab />
                </TabsContent>
              </ScrollArea>
            </div>
          </SheetContent>
        </Tabs>
      </Sheet>
    </TooltipProvider>
  );
};

export default SiteEditorSidebar;
