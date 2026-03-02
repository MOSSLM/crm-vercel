import AppLayout from "@/components/layout/AppLayout";
import RequireAuth from "@/components/auth/RequireAuth";
import WorkspaceViewSync from "@/components/layout/WorkspaceViewSync";
import { DashboardPage } from "@/components/DashboardPage";

export default function QualificationDashboardRoute() {
  return (
    <AppLayout>
      <RequireAuth>
        <WorkspaceViewSync view="qualification" />
        <DashboardPage />
      </RequireAuth>
    </AppLayout>
  );
}
