
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
        <div className="flex h-screen w-full bg-gradient-to-br from-slate-50 via-white to-blue-50/40">
          <AppSidebar />
          <SidebarInset className="flex-1 overflow-auto bg-transparent">
            <AppHeader />
            <div className="flex flex-1 flex-col gap-4 overflow-auto p-1 md:p-2">
              {children}
            </div>
          </SidebarInset>
        </div>
        {/* Toaster retiré d'ici */}
      </SidebarProvider>
    </TooltipProvider>
  );
}
