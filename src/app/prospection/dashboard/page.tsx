import AppLayout from "@/components/layout/AppLayout";
import RequireAuth from "@/components/auth/RequireAuth";
import WorkspaceViewSync from "@/components/layout/WorkspaceViewSync";
import { SalesDashboard } from "@/components/SalesDashboard";

export default function SalesDashboardRoute() {
  return (
    <AppLayout>
      <RequireAuth>
        <WorkspaceViewSync view="prospection" />
        <SalesDashboard />
      </RequireAuth>
    </AppLayout>
  );
}
