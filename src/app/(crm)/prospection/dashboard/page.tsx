import RequireAuth from "@/components/auth/RequireAuth";
import WorkspaceViewSync from "@/components/layout/WorkspaceViewSync";
import { SalesDashboard } from "@/components/SalesDashboard";

// `AppLayout` est monté par `prospection/layout.tsx` depuis le 20/08 : le
// remettre ici emboîterait deux `StudioShell`, donc deux rails de navigation.
export default function SalesDashboardRoute() {
  return (
    <RequireAuth>
      <WorkspaceViewSync view="prospection" />
      <SalesDashboard />
    </RequireAuth>
  );
}
