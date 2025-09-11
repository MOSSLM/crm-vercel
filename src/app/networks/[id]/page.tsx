import NetworkDetailPage from "@/components/NetworkDetailPage";
import AppLayout from "@/components/layout/AppLayout";

interface Props {
  params: { id: string };
}

export default function NetworkDetail({ params }: Props) {
  const id = Number(params.id);
  return (
    <AppLayout>
      <NetworkDetailPage id={id} />
    </AppLayout>
  );
}
