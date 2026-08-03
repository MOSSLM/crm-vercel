"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthContext";
import AppLoading from "@/components/AppLoading";
import { PlancheCanvas } from "@/components/planches/PlancheCanvas";
import "../board.css";

/**
 * The board view is full-screen with its own (Milanote-style) shell, so it
 * renders OUTSIDE the CRM StudioShell. We still replicate AppLayout's
 * admin-only gate here — a back arrow in the board topbar returns to the CRM.
 */
export default function PlancheBoardPage() {
  const { isAuthenticated, loading, user, logout } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const isAdmin = user?.role === "admin";

  React.useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) {
      router.replace(`/login?next=${encodeURIComponent(`/planches/${id ?? ""}`)}`);
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
    void logout();
  }, [loading, isAuthenticated, isAdmin, user?.role, id, router, logout]);

  if (loading || !isAuthenticated || !isAdmin || !id) return <AppLoading />;
  return <PlancheCanvas boardId={id} />;
}
