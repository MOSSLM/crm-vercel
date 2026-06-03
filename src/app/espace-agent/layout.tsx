"use client";

import { PropsWithChildren, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthContext";
import AppLoading from "@/components/AppLoading";
import AgentPortalLayout from "@/components/agent-portal/AgentPortalLayout";

/**
 * Agent portal gate. Mirrors espace-client/layout but for the `freelance`
 * role: admins go to the full CRM, clients to the client portal, an unresolved
 * role is signed out. No onboarding gate — agents are provisioned by an admin.
 */
export default function EspaceAgentLayout({ children }: PropsWithChildren) {
  const { isAuthenticated, loading, user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname() ?? "";

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (user?.role === "admin") {
      router.replace("/dashboard");
      return;
    }
    if (user?.role === "client") {
      router.replace("/espace-client/dashboard");
      return;
    }
    if (user?.role === "unknown") {
      void logout();
    }
  }, [loading, isAuthenticated, user?.role, pathname, router, logout]);

  if (loading || !isAuthenticated) {
    return <AppLoading />;
  }

  if (user?.role !== "freelance") {
    return null;
  }

  return <AgentPortalLayout>{children}</AgentPortalLayout>;
}
