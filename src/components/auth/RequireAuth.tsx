"use client";

import { PropsWithChildren, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthContext";
import AppLoading from "@/components/AppLoading"; // tu l’as déjà dans ton projet

export default function RequireAuth({ children }: PropsWithChildren) {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      // Redirige vers /login et garde la route demandée pour après la connexion
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [loading, isAuthenticated, router, pathname]);

  // Pendant la vérification de session
  if (loading) return <AppLoading />;

  // Si pas connecté, on a lancé la redirection → on ne rend rien
  if (!isAuthenticated) return null;

  // User OK → on rend le contenu protégé
  return <>{children}</>;
}
