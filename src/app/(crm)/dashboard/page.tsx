
import AppLayout from "@/components/layout/AppLayout";
import RequireAuth from "@/components/auth/RequireAuth";
import WorkspaceViewSync from "@/components/layout/WorkspaceViewSync";
import { StudioHub } from "@/components/studio/StudioHub";

export default function DashboardRoute() {
  return (
    <AppLayout>
      <RequireAuth>
        <WorkspaceViewSync view="base" />
        <StudioHub />
      </RequireAuth>
    </AppLayout>
  );
}
