import React, { ReactNode } from "react";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppSidebar } from "@/components/AppSidebar";
import { AppHeader } from "./AppHeader";
import { MobileBottomNav } from "./MobileBottomNav";

type Props = { children: ReactNode };

export default function AppLayout({ children }: Props) {
  return (
    <TooltipProvider>
      <SidebarProvider>
        <div className="flex h-screen w-full overflow-hidden">
          <AppSidebar />
          <SidebarInset className="flex min-w-0 flex-1 overflow-hidden">
            <div className="flex h-full w-full flex-col overflow-hidden">
              <AppHeader />
              <main className="flex flex-1 flex-col overflow-auto pb-24 md:pb-0">{children}</main>
            </div>
          </SidebarInset>
        </div>
        <MobileBottomNav />
      </SidebarProvider>
    </TooltipProvider>
  );
}
