import React, { ReactNode } from "react";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AgentSidebar } from "./AgentSidebar";

type Props = { children: ReactNode };

export default function AgentPortalLayout({ children }: Props) {
  return (
    <TooltipProvider>
      <SidebarProvider
        style={
          {
            "--sidebar-width": "232px",
            "--sidebar-width-icon": "56px",
          } as React.CSSProperties
        }
      >
        <div className="flex h-screen w-full overflow-hidden">
          <AgentSidebar />
          <SidebarInset className="flex min-w-0 flex-1 overflow-hidden">
            <div className="flex h-full w-full flex-col overflow-hidden">
              <header className="flex h-12 items-center gap-2 border-b px-4">
                <SidebarTrigger />
                <span className="text-sm font-medium">Espace agent</span>
              </header>
              <main className="flex flex-1 flex-col overflow-auto">{children}</main>
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </TooltipProvider>
  );
}
