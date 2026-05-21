import "./dashboard2.css";
import AppLayout from "@/components/layout/AppLayout";
import RequireAuth from "@/components/auth/RequireAuth";
import WorkspaceViewSync from "@/components/layout/WorkspaceViewSync";
import { Dashboard2Page } from "@/components/Dashboard2Page";

export default function Dashboard2Route() {
  return (
    <AppLayout>
      <RequireAuth>
        <WorkspaceViewSync view="base" />
        <Dashboard2Page />
      </RequireAuth>
    </AppLayout>
  );
}
