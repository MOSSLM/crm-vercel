import AppLayout from "@/components/layout/AppLayout";
import { ClientsListPage } from "@/components/admin/ClientsListPage";

export default function ClientsRoute() {
  return (
    <AppLayout>
      <ClientsListPage />
    </AppLayout>
  );
}
