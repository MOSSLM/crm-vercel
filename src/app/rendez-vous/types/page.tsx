import AppLayout from "@/components/layout/AppLayout";
import RequireAuth from "@/components/auth/RequireAuth";
import SchedulingSection from "@/components/scheduling/host/SchedulingSection";

export default function Page() {
  return (
    <AppLayout>
      <RequireAuth>
        <SchedulingSection section="types" basePath="/rendez-vous" />
      </RequireAuth>
    </AppLayout>
  );
}
