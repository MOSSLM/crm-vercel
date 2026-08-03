import NetworkDetailPage from "@/components/NetworkDetailPage";
import AppLayout from "@/components/layout/AppLayout";

interface Props {
  params: { id: string };
}

export default function NetworkDetail({ params }: Props) {
  return (
    <AppLayout>
      <NetworkDetailPage id={params.id} />
    </AppLayout>
  );
}
