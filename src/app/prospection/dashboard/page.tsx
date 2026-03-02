import AppLayout from "@/components/layout/AppLayout";
import RequireAuth from "@/components/auth/RequireAuth";
import WorkspaceViewSync from "@/components/layout/WorkspaceViewSync";
import { DashboardPage } from "@/components/DashboardPage";

export default function ProspectionDashboardRoute() {
  return (
    <AppLayout>
      <RequireAuth>
        <WorkspaceViewSync view="prospection" />
        <DashboardPage />
      </RequireAuth>
    </AppLayout>
  );
}
