"use client";

import React, { ReactNode, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppSidebar } from "@/components/AppSidebar";
import { AppHeader } from "./AppHeader";
import { MobileBottomNav } from "./MobileBottomNav";
import { useAuth } from "@/components/AuthContext";
import AppLoading from "@/components/AppLoading";

type Props = { children: ReactNode };

/**
 * Admin shell. Every CRM page renders through here, so this is the single
 * staff-only gate: the sidebar and content never render for a non-staff user.
 * Default-deny — anything other than admin/freelance (client, or an unresolved
 * role) is routed to the client portal, not the CRM.
 */
export default function AppLayout({ children }: Props) {
  const { isAuthenticated, loading, user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname() ?? "";

  const isStaff = user?.role === "admin" || user?.role === "freelance";

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (isStaff) return;
    if (user?.role === "client") {
      router.replace("/espace-client/dashboard");
      return;
    }
    // Unknown role = stale/invalid session — sign out instead of looping.
    void logout();
  }, [loading, isAuthenticated, isStaff, user?.role, pathname, router, logout]);

  // Never render the admin shell until we're certain the user is staff.
  if (loading || !isAuthenticated || !isStaff) {
    return <AppLoading />;
  }

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
