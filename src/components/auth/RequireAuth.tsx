"use client";

import { PropsWithChildren, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthContext";
import AppLoading from "@/components/AppLoading"; // tu l’as déjà dans ton projet

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
    if (user?.role === "client") {
      router.replace("/espace-client/dashboard");
    }
  }, [loading, isAuthenticated, user?.role, router, pathname]);

  if (loading) return <AppLoading />;
  if (!isAuthenticated) return null;
  if (user?.role === "client") return null;

  return <>{children}</>;
}
