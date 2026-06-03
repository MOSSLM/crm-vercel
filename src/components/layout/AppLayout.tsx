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
 * admin-only gate: the sidebar and content never render for a non-admin user.
 * Default-deny — freelance agents go to their own portal (/espace-agent),
 * clients to the client portal, and an unresolved role is signed out.
 */
export default function AppLayout({ children }: Props) {
  const { isAuthenticated, loading, user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname() ?? "";

  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (isAdmin) return;
    if (user?.role === "freelance") {
      router.replace("/espace-agent/dashboard");
      return;
    }
    if (user?.role === "client") {
      router.replace("/espace-client/dashboard");
      return;
    }
    // Unknown role = stale/invalid session — sign out instead of looping.
    void logout();
  }, [loading, isAuthenticated, isAdmin, user?.role, pathname, router, logout]);

  // Never render the admin shell until we're certain the user is an admin.
  if (loading || !isAuthenticated || !isAdmin) {
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
