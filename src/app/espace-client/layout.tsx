"use client";

import { PropsWithChildren, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthContext";
import AppLoading from "@/components/AppLoading";
import ClientPortalLayout from "@/components/client-portal/ClientPortalLayout";

const ONBOARDING_PATH = "/espace-client/onboarding";

export default function EspaceClientLayout({ children }: PropsWithChildren) {
  const { isAuthenticated, loading, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname() ?? "";

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (user?.role === "admin" || user?.role === "freelance") {
      router.replace("/dashboard");
      return;
    }
    if (user?.role !== "client") {
      // Role still 'unknown' — wait for profile to load.
      return;
    }
    if (!user.onboardedAt && pathname !== ONBOARDING_PATH) {
      router.replace(ONBOARDING_PATH);
    }
  }, [loading, isAuthenticated, user?.role, user?.onboardedAt, pathname, router]);

  if (loading || !isAuthenticated || user?.role === "unknown") {
    return <AppLoading />;
  }

  if (user?.role !== "client") {
    return null;
  }

  if (!user.onboardedAt && pathname !== ONBOARDING_PATH) {
    return null;
  }

  // Onboarding page renders standalone (no sidebar).
  if (pathname === ONBOARDING_PATH) {
    return <>{children}</>;
  }

  return <ClientPortalLayout>{children}</ClientPortalLayout>;
}
