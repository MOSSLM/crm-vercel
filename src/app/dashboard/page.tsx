"use client";

import AppLayout from "@/components/layout/AppLayout";
import RequireAuth from "@/components/auth/RequireAuth";
import { DashboardPage } from "@/components/DashboardPage";

export default function DashboardRoute() {
  return (
    <AppLayout>
      <RequireAuth>
        <DashboardPage />
      </RequireAuth>
    </AppLayout>
  );
}
