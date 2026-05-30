import AppLayout from "@/components/layout/AppLayout";
import { ClientDetailPage } from "@/components/admin/ClientDetailPage";

interface Params {
  params: Promise<{ id: string }>;
}

export default async function ClientDetailRoute({ params }: Params) {
  const { id } = await params;
  return (
    <AppLayout>
      <ClientDetailPage clientId={id} />
    </AppLayout>
  );
}
