import AppLayout from "@/components/layout/AppLayout";
import RequireAuth from "@/components/auth/RequireAuth";
import WorkspaceViewSync from "@/components/layout/WorkspaceViewSync";
import { CalendarPage } from "@/components/CalendarPage";

export default function CalendarRoute() {
  return (
    <AppLayout>
      <RequireAuth>
        <WorkspaceViewSync view="base" />
        <CalendarPage />
      </RequireAuth>
    </AppLayout>
  );
}
