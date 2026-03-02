
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
        <div className="relative flex h-screen w-full bg-background">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_8%,rgba(99,102,241,0.14),transparent_38%),radial-gradient(circle_at_88%_2%,rgba(14,165,233,0.12),transparent_32%)]" />
          <AppSidebar />
          <SidebarInset className="z-10 flex-1 overflow-auto">
            <AppHeader />
            <div className="flex flex-1 flex-col gap-4 overflow-auto px-3 pb-4 pt-2 md:px-5 md:pb-6 md:pt-4">
              {children}
            </div>
          </SidebarInset>
        </div>
        {/* Toaster retiré d'ici */}
      </SidebarProvider>
    </TooltipProvider>
  );
}
