import AppLayout from "@/components/layout/AppLayout";
import { LeadMagnetV2DetailPage } from "@/components/production/LeadMagnetV2DetailPage";

export default async function LeadMagnetDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <AppLayout>
      <LeadMagnetV2DetailPage projectId={id} />
    </AppLayout>
  );
}
