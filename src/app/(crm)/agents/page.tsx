import AppLayout from "@/components/layout/AppLayout";
import RequireAuth from "@/components/auth/RequireAuth";
import AgentsAdmin from "@/components/admin/AgentsAdmin";

export default function AgentsRoute() {
  return (
    <AppLayout>
      <RequireAuth>
        <AgentsAdmin />
      </RequireAuth>
    </AppLayout>
  );
}
