"use client";

import { PropsWithChildren, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthContext";
import AppLoading from "@/components/AppLoading";

/**
 * Gate the admin CRM. Renders nothing until we know for sure the connected
 * user is admin or freelance — preventing the briefly-visible admin shell
 * that used to leak while the user_profiles SELECT was still in flight.
 */
export default function RequireAuth({ children }: PropsWithChildren) {
  const { isAuthenticated, loading, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    // Only staff can sit on /dashboard. Anything else gets bounced.
    if (user?.role === "client") {
      router.replace("/espace-client/dashboard");
      return;
    }
    if (user?.role === "unknown") {
      // Profile failed to load (network error, missing row, etc.) — sign out
      // rather than expose admin content.
      router.replace("/login");
    }
  }, [loading, isAuthenticated, user?.role, router, pathname]);

  if (loading) return <AppLoading />;
  if (!isAuthenticated) return null;
  if (user?.role !== "admin" && user?.role !== "freelance") return null;

  return <>{children}</>;
}
