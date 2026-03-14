
import React, { ReactNode } from "react";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
// ❌ On ne monte plus de Toaster ici
import { AppSidebar } from "@/components/AppSidebar"; // import nommé
import { AppHeader } from "./AppHeader";

type Props = { children: ReactNode };

export default function AppLayout({ children }: Props) {
  return (
    <TooltipProvider>
      <SidebarProvider>
        <div className="flex h-screen w-full bg-background">
          <AppSidebar />
          <SidebarInset className="flex-1 overflow-auto md:p-2">
            <AppHeader />
            <div className="flex flex-1 flex-col gap-5 overflow-auto px-3 pb-3 md:px-4 md:pb-4">
              {children}
            </div>
          </SidebarInset>
        </div>
        {/* Toaster retiré d'ici */}
      </SidebarProvider>
    </TooltipProvider>
  );
}
