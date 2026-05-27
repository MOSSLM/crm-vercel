import React, { ReactNode } from "react";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ClientPortalSidebar } from "./ClientPortalSidebar";

type Props = { children: ReactNode };

export default function ClientPortalLayout({ children }: Props) {
  return (
    <TooltipProvider>
      <SidebarProvider>
        <div className="flex h-screen w-full overflow-hidden">
          <ClientPortalSidebar />
          <SidebarInset className="flex min-w-0 flex-1 overflow-hidden">
            <div className="flex h-full w-full flex-col overflow-hidden">
              <header className="flex h-14 items-center gap-2 border-b px-4">
                <SidebarTrigger />
                <span className="text-sm font-medium">Espace client</span>
              </header>
              <main className="flex flex-1 flex-col overflow-auto">{children}</main>
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </TooltipProvider>
  );
}
